import * as THREE from "three";
import type { Path3, Profile2, Section3 } from "../definitions/geometry";
import type { MeshData, QuadFace } from "../mesh/MeshData";
import {
    geometryResult,
    GeometryOperationError,
    type GeometryResult
} from "../kernel/GeometryResult";
import { topologyOf } from "../kernel/topology";
import {
    assertAffineTransform,
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { loftSideQuads } from "./loftSideQuads";
import { loftSectionWalls } from "./loftSectionWalls";
import { capSectionEnd } from "./finishBoundaries";

export interface PathSweepOptions {
    path: Path3;
    sectionAt(t: number): Profile2;
    /** Rigid local-to-world frame: local +Z is the initial tangent. */
    startingFrame: THREE.Matrix4;
    /** Open: [0, 1]. Periodic: [0, 1), with no duplicate seam. */
    stations: readonly number[];
    closedPath?: boolean;
    ends?: "open" | "cap";
    precision?: GeometryPrecision;
}

interface Frame {
    origin: THREE.Vector3;
    tangent: THREE.Vector3;
    u: THREE.Vector3;
    v: THREE.Vector3;
}

function invalid(
    reason: "invalid-input" | "degenerate-geometry" | "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("sweepSection", reason, message);
}

function pathPoint(point: THREE.Vector3Like): THREE.Vector3 {
    if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
        invalid("invalid-input", "Path contains non-finite positions or tangents");
    }

    return new THREE.Vector3(point.x, point.y, point.z);
}

function pathFrameAt(
    path: Path3,
    t: number,
    precision: GeometryPrecision
): Pick<Frame, "origin" | "tangent"> {
    const origin = pathPoint(path.at(t));
    const tangent = pathPoint(path.tangent(t));

    if (!(tangent.length() > precision.absoluteLength)) {
        invalid("degenerate-geometry", "Path has a zero tangent");
    }

    return { origin, tangent: tangent.normalize() };
}

function validateStations(
    stations: readonly number[],
    closed: boolean
): void {
    if (
        stations.length < (closed ? 3 : 2) ||
        stations[0] !== 0 ||
        (!closed && stations.at(-1) !== 1) ||
        stations.some((t, i) =>
            !Number.isFinite(t) ||
            t < 0 ||
            t > (closed ? 1 - Number.EPSILON : 1) ||
            (i > 0 && t <= stations[i - 1]!)
        )
    ) {
        invalid("invalid-input", "Invalid sweep sampling stations");
    }
}

function initialFrame(
    matrix: THREE.Matrix4,
    first: Pick<Frame, "origin" | "tangent">,
    precision: GeometryPrecision
): Frame {
    assertAffineTransform(matrix, "sweepSection", precision);

    const e = matrix.elements;
    const u = new THREE.Vector3(e[0], e[1], e[2]);
    const v = new THREE.Vector3(e[4], e[5], e[6]);
    const z = new THREE.Vector3(e[8], e[9], e[10]);
    const origin = new THREE.Vector3(e[12], e[13], e[14]);

    if (
        Math.abs(u.length() - 1) > precision.angle ||
        Math.abs(v.length() - 1) > precision.angle ||
        Math.abs(z.length() - 1) > precision.angle ||
        Math.abs(u.dot(v)) > precision.angle ||
        Math.abs(u.dot(z)) > precision.angle ||
        Math.abs(v.dot(z)) > precision.angle ||
        u.clone().cross(v).dot(z) < 1 - precision.angle ||
        z.dot(first.tangent) < 1 - precision.angle ||
        origin.distanceTo(first.origin) > precision.absoluteLength
    ) {
        invalid("invalid-input", "Starting frame must be rigid and tangent-aligned");
    }

    return {
        origin: first.origin,
        tangent: first.tangent,
        u,
        v
    };
}

function transport(
    previous: Frame,
    next: Pick<Frame, "origin" | "tangent">,
    precision: GeometryPrecision
): Frame {
    if (previous.tangent.dot(next.tangent) < -1 + precision.angle) {
        invalid("unsupported-topology", "180-degree path reversal needs intermediate stations");
    }

    const rotation = new THREE.Quaternion().setFromUnitVectors(
        previous.tangent,
        next.tangent
    );
    const u = previous.u.clone().applyQuaternion(rotation);
    u.addScaledVector(next.tangent, -u.dot(next.tangent)).normalize();

    return {
        origin: next.origin,
        tangent: next.tangent,
        u,
        v: new THREE.Vector3().crossVectors(next.tangent, u).normalize()
    };
}

function createFrames(
    path: Path3,
    stations: readonly number[],
    start: THREE.Matrix4,
    closed: boolean,
    precision: GeometryPrecision
): Frame[] {
    const samples = [...stations, ...(closed ? [1] : [])];
    const points = samples.map(t => pathFrameAt(path, t, precision));
    const first = initialFrame(start, points[0]!, precision);
    const frames = [first];
    const distances = [0];

    for (let i = 1; i < points.length; i++) {
        const current = points[i]!;
        const previous = points[i - 1]!;
        const step = current.origin.distanceTo(previous.origin);

        if (!(step > lengthTolerance(precision, step))) {
            invalid("degenerate-geometry", "Consecutive path stations coincide");
        }

        frames.push(transport(frames.at(-1)!, current, precision));
        distances.push(distances.at(-1)! + step);
    }

    if (!closed) return frames;

    const last = frames.at(-1)!;
    if (
        last.origin.distanceTo(first.origin) > precision.absoluteLength ||
        last.tangent.dot(first.tangent) < 1 - precision.angle
    ) {
        invalid("invalid-input", "Closed path does not return with a matching tangent");
    }

    // Parallel transport around a loop can accumulate holonomy. Distribute
    // the resulting roll over the physical path length before welding the
    // final face directly to the original section's construction vertices.
    const roll = Math.atan2(
        first.tangent.dot(new THREE.Vector3().crossVectors(last.u, first.u)),
        last.u.dot(first.u)
    );
    const total = distances.at(-1)!;

    for (let i = 1; i < frames.length; i++) {
        const frame = frames[i]!;
        const correction = new THREE.Quaternion().setFromAxisAngle(
            frame.tangent,
            roll * (distances[i]! / total)
        );

        frame.u.applyQuaternion(correction);
        frame.v.applyQuaternion(correction);
    }

    const corrected = frames.at(-1)!;
    if (corrected.u.distanceTo(first.u) > 8 * precision.angle ||
        corrected.v.distanceTo(first.v) > 8 * precision.angle) {
        invalid("unsupported-topology", "Periodic path frame cannot close consistently");
    }

    return frames;
}

function toSection(
    profile: Profile2,
    frame: Frame
): Section3 {
    if (!profile?.outer?.closed ||
        profile.outer.points.length < 3 ||
        profile.holes?.some(hole =>
            !hole.closed || hole.points.length < 3
        )) {
        invalid("invalid-input", "Sweep requires closed section outlines");
    }

    const project = (points: readonly THREE.Vector2Like[]) =>
        points.map(point => {
            if (!point || ![point.x, point.y].every(Number.isFinite)) {
                invalid("invalid-input", "Sweep section has invalid points");
            }

            return frame.origin.clone()
                .addScaledVector(frame.u, point.x)
                .addScaledVector(frame.v, point.y);
        });

    const outerArea = THREE.ShapeUtils.area(
        profile.outer.points.map(point => new THREE.Vector2(point.x, point.y))
    );

    if (!Number.isFinite(outerArea) || outerArea === 0 ||
        profile.holes?.some(hole => {
            const area = THREE.ShapeUtils.area(
                hole.points.map(point => new THREE.Vector2(point.x, point.y))
            );

            return !Number.isFinite(area) || area * outerArea >= 0;
        })) {
        invalid("degenerate-geometry", "Section hole winding must oppose its outer contour");
    }

    const outer = project(profile.outer.points);
    const inner = profile.holes?.map(hole => ({
        points: project(hole.points),
        closed: true
    }));

    // Preserve every authored section station and contour corner.

    return {
        outer: { points: outer, closed: true },
        ...(inner === undefined ? {} : { inner })
    };
}

function periodicWalls(
    sections: readonly Section3[],
    closing: Section3,
    precision: GeometryPrecision
): GeometryResult {
    const first = sections[0]!;
    const loopCount = 1 + (first.inner?.length ?? 0);
    const vertices: THREE.Vector3[] = [];
    const quads: QuadFace[] = [];

    for (let loop = 0; loop < loopCount; loop++) {
        const getLoop = (section: Section3) =>
            loop === 0
                ? section.outer.points
                : section.inner![loop - 1]!.points;

        const rings = [...sections, closing].map(getLoop);
        const strips = loftSideQuads({
            rings,
            uvMode: "perimeter",
            surface: () => loop === 0 ? "outer" : `inner-${loop - 1}`,
            minimumEdgeLength: precision.absoluteLength,
            minimumTravel: precision.absoluteLength
        });
        const sides = rings[0]!.length;
        const rows = sections.length;
        const offset = vertices.length;

        // Only sampled sections in [0,1) have vertices. The terminal
        // ring at t=1 supplies UV and distance data, never new IDs.
        vertices.push(...strips.vertices.slice(0, rows * sides));

        for (const quad of strips.quads) {
            quads.push({
                ...quad,
                corners: quad.corners.map(index =>
                    offset + (index % (rows * sides))
                ) as QuadFace["corners"]
            });
        }
    }

    const result = geometryResult({ vertices, quads }, precision);

    if (topologyOf(result).openBoundaries().length !== 0) {
        invalid("unsupported-topology", "Periodic sweep left open edges");
    }

    return result;
}

/** Construct a transported, section-varying authored sweep. */
export function sweepSection({
    path,
    sectionAt,
    startingFrame,
    stations,
    closedPath = false,
    ends: suppliedEnds,
    precision
}: PathSweepOptions): GeometryResult {
    const policy = resolvePrecision(precision);
    const ends = suppliedEnds ?? (closedPath ? "open" : "cap");

    if (
        typeof path?.at !== "function" ||
        typeof path.tangent !== "function" ||
        typeof sectionAt !== "function" ||
        !(startingFrame instanceof THREE.Matrix4) ||
        !["cap", "open"].includes(ends) ||
        (closedPath && suppliedEnds !== undefined)
    ) {
        invalid("invalid-input", "Invalid sweep path or end treatment");
    }

    validateStations(stations, closedPath);
    const frames = createFrames(
        path, stations, startingFrame, closedPath, policy
    );

    const sections = stations.map((t, i) =>
        toSection(sectionAt(t), frames[i]!)
    );

    const sizes = (section: Section3) => [
        section.outer.points.length,
        ...(section.inner ?? []).map(hole => hole.points.length)
    ];
    const expected = sizes(sections[0]!);

    if (sections.some(section =>
        sizes(section).length !== expected.length ||
        sizes(section).some((count, i) => count !== expected[i])
    )) {
        invalid("unsupported-topology", "Sweep section correspondence changes");
    }

    if (closedPath) {
        const closing = toSection(sectionAt(1), frames.at(-1)!);
        if (
            sizes(closing).length !== expected.length ||
            sizes(closing).some((count, i) => count !== expected[i])
        ) {
            invalid("unsupported-topology", "Periodic section correspondence changes");
        }

        const get = (section: Section3) => [
            ...section.outer.points,
            ...(section.inner ?? []).flatMap(hole => [...hole.points])
        ];
        const first = get(sections[0]!);
        const last = get(closing);

        if (first.some((point, i) =>
            new THREE.Vector3(point.x, point.y, point.z)
                .distanceTo(last[i]!) > policy.absoluteLength
        )) {
            invalid("unsupported-topology", "Section is not periodic at the seam");
        }

        return periodicWalls(sections, closing, policy);
    }

    let result = loftSectionWalls(sections, { precision: policy });

    if (ends === "cap") {
        for (const end of ["start", "end"] as const) {
            const frame = end === "start" ? frames[0]! : frames.at(-1)!;
            const uvFrame = new THREE.Matrix4().makeBasis(
                frame.u, frame.v, frame.tangent
            ).setPosition(frame.origin);

            result = capSectionEnd(
                result,
                result.boundaries[`${end}-outer`]![0]!,
                expected.slice(1).map((_, i) =>
                    result.boundaries[`${end}-inner-${i}`]![0]!
                ),
                {
                    region: `cap-${end}`,
                    uvFrame,
                    tessellation: "quad-if-planar",
                    precision: policy
                }
            );
        }
    }

    return result;
}
