import * as THREE from "three";

import type { Contour2 } from "../definitions/geometry";
import type { MeshData } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    GeometryOperationError,
    type BoundaryRef,
    type FaceRef,
    type GeometryResult,
    type SurfacePatchRef
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { topologyOf } from "../kernel/topology";
import { patchChartMatches } from "../kernel/selectionLifecycle";
import { triangulateProfile } from "../build/triangulateProfile";
import { bridgeBoundaries } from "../build/bridgeBoundaries";
import { joinGeometry } from "../build/joinGeometry";
import { raycastSurface } from "../queries/raycastSurface";
import { openPatch } from "./patchOpening";

export interface ThroughCutOptions {
    wallRegion: string;
    entry: { patch: SurfacePatchRef; contour: Contour2 };
    exit: { patch: SurfacePatchRef; contour: Contour2 };
    precision?: GeometryPrecision;
}

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "degenerate-geometry" | "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("cutThrough", reason, message);
}

function key(ref: FaceRef): string {
    return ref.kind + ":" + ref.index;
}

function face(mesh: MeshData, ref: FaceRef) {
    return ref.kind === "quad"
        ? mesh.quads[ref.index]
        : mesh.triangles?.[ref.index];
}

function normalOf(
    patch: SurfacePatchRef,
    point: THREE.Vector2Like
): THREE.Vector3 {
    const normal = patch.chart.normalAt(point);

    if (!normal || ![normal.x, normal.y, normal.z].every(Number.isFinite)) {
        fail("invalid-input", "A selected chart has no finite normal");
    }

    const result = new THREE.Vector3().copy(normal);

    if (!(result.length() > 0)) {
        fail("invalid-input", "A selected chart has a zero normal");
    }

    return result.normalize();
}

function mappedExitPatch(
    source: GeometryResult,
    first: GeometryResult,
    entry: SurfacePatchRef,
    exit: SurfacePatchRef,
    precision: GeometryPrecision
): SurfacePatchRef {
    const selected = new Set(entry.faces.map(key));
    const quadBefore = source.geometry.quads.map((_, index) =>
        selected.has("quad:" + index) ? 1 : 0
    );
    const triangleBefore = (source.geometry.triangles ?? []).map((_, index) =>
        selected.has("triangle:" + index) ? 1 : 0
    );

    const mapped: FaceRef[] = exit.faces.map(ref => {
        if (selected.has(key(ref)) || !face(source.geometry, ref)) {
            fail("invalid-input", "Entry and exit must select disjoint valid faces");
        }

        const previous = ref.kind === "quad" ? quadBefore : triangleBefore;
        const removed = previous.slice(0, ref.index)
            .filter(Boolean).length;
        return {kind: ref.kind, index: ref.index - removed};
    });

    const patch: SurfacePatchRef = {
        owner: first.id,
        faces: mapped,
        chart: exit.chart
    };

    if (!patchChartMatches(first, patch, precision)) {
        fail("invalid-topology", "Exit chart no longer matches its surviving faces");
    }

    return patch;
}

function stations(points: readonly THREE.Vector3[]): number[] {
    const distances = [0];

    for (let i = 0; i < points.length; i++) {
        distances.push(distances.at(-1)! +
            points[i]!.distanceTo(points[(i + 1) % points.length]!));
    }

    const length = distances.at(-1)!;
    if (!(length > 0)) {
        fail("degenerate-geometry", "Through-cut boundary has no length");
    }

    return distances.slice(0, -1).map(value => value / length);
}

/**
 * Join two planar, opposing openings with a straight, constant-section
 * tunnel. The contour stations must match after reversing the opposite
 * face's outward rim; curved, twisted and tapered cuts require an
 * explicitly constructed wall or a solid boolean.
 */
export function cutThrough(
    source: GeometryResult,
    options: ThroughCutOptions
): GeometryResult {
    const policy = resolvePrecision(options?.precision);
    const {entry, exit, wallRegion} = options ?? {};

    if (!wallRegion?.trim() || !entry?.patch || !exit?.patch ||
        !entry.contour?.points?.length || !exit.contour?.points?.length) {
        fail("invalid-input", "Through-cut needs two patches, contours and a wall region");
    }

    assertSelectionOwner(source, entry.patch);
    assertSelectionOwner(source, exit.patch);
    const topology = topologyOf(source);

    if (topology.openBoundaries().length ||
        topology.connectedComponents().length !== 1) {
        fail("unsupported-topology", "Straight through-cut requires one closed manifold shell");
    }

    if (!patchChartMatches(source, entry.patch, policy) ||
        !patchChartMatches(source, exit.patch, policy)) {
        fail("invalid-input", "Entry or exit patch has an invalid chart");
    }

    const firstNormal = normalOf(entry.patch, entry.contour.points[0]!);
    const secondNormal = normalOf(exit.patch, exit.contour.points[0]!);

    if (firstNormal.dot(secondNormal) > -1 + policy.angle) {
        fail("unsupported-topology", "Entry and exit must face in opposite directions");
    }

    const first = openPatch(source, entry.patch, entry.contour, policy);
    const rebound = mappedExitPatch(
        source, first, entry.patch, exit.patch, policy
    );
    const opened = openPatch(first, rebound, exit.contour, policy);
    const rims = opened.boundaries.opening;

    if (!rims || rims.length < 2) {
        fail("invalid-topology", "Both openings must have distinct named rims");
    }

    const from = rims[rims.length - 2]!;
    const to = rims[rims.length - 1]!;
    const vertices = opened.geometry.vertices;

    if (!from.closed || !to.closed ||
        from.vertices.length !== to.vertices.length) {
        fail("unsupported-topology", "Entry and exit rims need equal ordered stations");
    }

    const entryPoints = from.vertices.map(id => vertices[id]!.clone());
    const exitIds = [to.vertices[0]!, ...to.vertices.slice(1).reverse()];
    const exitPoints = exitIds.map(id => vertices[id]!.clone());
    const center = (points: readonly THREE.Vector3[]) =>
        points.reduce((sum, point) => sum.add(point),
            new THREE.Vector3()).divideScalar(points.length);

    const displacement = center(exitPoints).sub(center(entryPoints));
    const depth = -displacement.dot(firstNormal);
    const extent = new THREE.Box3().setFromPoints(vertices)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);

    if (!(depth > tolerance) ||
        displacement.clone().addScaledVector(firstNormal, depth)
            .length() > tolerance) {
        fail("unsupported-topology", "Through-cut needs a nonzero, normal-aligned thickness");
    }

    // Align the seam by physical positions, not by either chart's UV origin.
    const target = entryPoints[0]!.clone().add(displacement);
    const candidates = exitPoints.flatMap((point, index) =>
        point.distanceTo(target) <= tolerance ? [index] : []
    );

    if (candidates.length !== 1) {
        fail("unsupported-topology", "No unique entry/exit contour correspondence");
    }

    const shift = candidates[0]!;
    const aligned = exitPoints.map((_, index) =>
        exitPoints[(index + shift) % exitPoints.length]!
    );

    if (!aligned.every((point, index) =>
        point.distanceTo(entryPoints[index]!.clone().add(displacement)) <= tolerance
    )) {
        fail("unsupported-topology", "Through-cut contours must have one matching section");
    }

    // Check the corridor against all other source faces before joining.
    // Samples include each corner, each edge midpoint and each interior
    // face centroid, so even an obstruction missing the rim is detected.
    const omitted = new Set([
        ...entry.patch.faces.map(key), ...exit.patch.faces.map(key)
    ]);
    const outside: MeshData = {
        vertices: source.geometry.vertices,
        quads: source.geometry.quads.filter((_, i) =>
            !omitted.has("quad:" + i)
        ),
        triangles: (source.geometry.triangles ?? []).filter((_, i) =>
            !omitted.has("triangle:" + i)
        )
    };
    const profile = entryPoints.map(point => {
        const value = entry.patch.chart.parameterOf(point);
        return new THREE.Vector2(value.x, value.y);
    });
    const insidePoints = triangulateProfile([profile], policy)
        .map(triangle => triangle.reduce((sum, id) =>
            sum.add(entryPoints[id]!), new THREE.Vector3()).divideScalar(3));

    const samples = [
        ...entryPoints,
        ...entryPoints.map((point, i) =>
            point.clone().lerp(entryPoints[(i + 1) % entryPoints.length]!, 0.5)),
        ...insidePoints
    ];

    const margin = Math.min(depth / 8, tolerance * 8);

    for (const sample of samples) {
        const hit = raycastSurface({
            geometry: outside,
            localToWorld: new THREE.Matrix4()
        }, {
            origin: sample.clone().addScaledVector(firstNormal, -margin),
            direction: firstNormal.clone().negate(),
            maxDistance: depth - 2 * margin
        }, policy);

        if (hit) {
            fail("unsupported-topology", "Through-cut crosses an unrelated surface");
        }
    }

    const sharedStations = stations(entryPoints);
    const bridge = bridgeBoundaries({
        closed: true, points: entryPoints
    }, {
        closed: true, points: aligned
    }, {
        region: wallRegion,
        fromStations: sharedStations,
        toStations: sharedStations,
        precision: policy
    });

    const joined = joinGeometry([opened, bridge], {
        weld: [
            {
                firstPart: 0, first: from,
                secondPart: 1, second: bridge.boundaries.from![0]!
            },
            {
                firstPart: 0, first: to,
                secondPart: 1, second: bridge.boundaries.to![0]!
            }
        ],
        precision: policy
    });

    if (topologyOf(joined).openBoundaries().length !== 0 ||
        topologyOf(joined).connectedComponents().length !== 1) {
        fail("invalid-topology", "Through-cut did not produce one closed solid");
    }

    // The source part is the first input to joinGeometry. All of its
    // existing vertex IDs remain stable while bridge vertices weld to it.
    const boundary = (ref: BoundaryRef): BoundaryRef => {
        for (let i = 0; i < ref.vertices.length; i++) {
            const a = ref.vertices[i]!;
            const b = ref.vertices[(i + 1) % ref.vertices.length]!;

            if (topologyOf(joined).edgeUses(a, b).length !== 2) {
                fail("invalid-topology", "Through-cut seam was not welded");
            }
        }

        return {
            owner: joined.id,
            closed: true,
            vertices: [...ref.vertices]
        };
    };

    const named: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(joined.boundaries)) {
        named[name.startsWith("0:") ? name.slice(2) : name] = [...refs];
    }
    (named["through-entry"] ??= []).push(boundary(from));
    (named["through-exit"] ??= []).push(boundary(to));

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(joined.patches ?? {})) {
        patches[name.startsWith("0:") ? name.slice(2) : name] = [...refs];
    }

    return {
        ...joined,
        boundaries: named,
        ...(Object.keys(patches).length ? {patches} : {})
    };
}
