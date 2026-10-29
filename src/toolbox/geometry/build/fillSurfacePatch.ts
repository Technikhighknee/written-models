import * as THREE from "three";
import type { SampledProfile2 } from "../definitions/geometry";
import type { MeshData, TriangleFace } from "../mesh/MeshData";
import {
    geometryResult,
    GeometryOperationError,
    type GeometryResult,
    type SurfaceChart,
    type BoundaryRef,
    type FaceRef
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    triangleQuality,
    type GeometryPrecision
} from "../kernel/precision";
import { topologyOf } from "../kernel/topology";
import { triangulateProfile } from "./triangulateProfile";

export interface SurfaceFillOptions {
    profile: SampledProfile2;
    chart: SurfaceChart;
    region: string;
    /** Maximum observed chord/centroid deviation in metres. */
    maxDeviation?: number;
    precision?: GeometryPrecision;
}

type Triangle = [number, number, number];

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "degenerate-geometry" | "unsupported-topology" | "sampling-limit",
    message: string
): never {
    throw new GeometryOperationError("fillSurfacePatch", reason, message);
}

function key(a: number, b: number): string {
    return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function finite2(point: THREE.Vector2Like): boolean {
    return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function sampleChart(
    chart: SurfaceChart,
    uv: THREE.Vector2,
    tolerance: number
): THREE.Vector3 {
    const point = chart.at(uv);
    if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
        fail("degenerate-geometry", "Chart produces a non-finite position");
    }

    const inverse = chart.parameterOf(point);
    if (!finite2(inverse) ||
        new THREE.Vector2(inverse.x, inverse.y).distanceTo(uv) > tolerance) {
        fail("unsupported-topology", "Chart does not round-trip its coordinates");
    }

    const normal = chart.normalAt(uv);
    if (
        !normal ||
        ![normal.x, normal.y, normal.z].every(Number.isFinite) ||
        !(new THREE.Vector3(normal.x, normal.y, normal.z).length() > 0)
    ) {
        fail("degenerate-geometry", "Chart has an undefined normal");
    }

    return new THREE.Vector3(point.x, point.y, point.z);
}

function pointOnEdge(
    point: THREE.Vector2,
    first: THREE.Vector2,
    second: THREE.Vector2,
    tolerance: number
): boolean {
    const segment = second.clone().sub(first);
    const lengthSquared = segment.lengthSq();
    if (lengthSquared <= tolerance * tolerance) return false;

    const t = point.clone().sub(first).dot(segment) / lengthSquared;
    const projected = first.clone().addScaledVector(segment, t);

    return t >= -tolerance / Math.sqrt(lengthSquared) &&
        t <= 1 + tolerance / Math.sqrt(lengthSquared) &&
        point.distanceTo(projected) <= tolerance;
}

function crossing(
    a: THREE.Vector2,
    b: THREE.Vector2,
    c: THREE.Vector2,
    d: THREE.Vector2,
    tolerance: number
): boolean {
    if (
        pointOnEdge(a, c, d, tolerance) ||
        pointOnEdge(b, c, d, tolerance) ||
        pointOnEdge(c, a, b, tolerance) ||
        pointOnEdge(d, a, b, tolerance)
    ) {
        return true;
    }

    const cross = (u: THREE.Vector2, v: THREE.Vector2, w: THREE.Vector2) =>
        (v.x - u.x) * (w.y - u.y) -
        (v.y - u.y) * (w.x - u.x);
    const threshold = tolerance * Math.max(
        a.distanceTo(b), c.distanceTo(d)
    );
    const x = cross(a, b, c);
    const y = cross(a, b, d);
    const z = cross(c, d, a);
    const w = cross(c, d, b);

    return ((x > threshold && y < -threshold) ||
            (x < -threshold && y > threshold)) &&
        ((z > threshold && w < -threshold) ||
            (z < -threshold && w > threshold));
}

function insideContour(
    point: THREE.Vector2,
    outline: readonly THREE.Vector2[]
): boolean {
    let inside = false;

    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const a = outline[i]!;
        const b = outline[j]!;

        if ((a.y > point.y) !== (b.y > point.y) &&
            point.x < a.x + (point.y - a.y) *
                (b.x - a.x) / (b.y - a.y)) {
            inside = !inside;
        }
    }

    return inside;
}

function validateLoops(
    loops: readonly (readonly THREE.Vector2[])[],
    tolerance: number
): void {
    for (let loop = 0; loop < loops.length; loop++) {
        const points = loops[loop]!;

        for (let i = 0; i < points.length; i++) {
            const a = points[i]!;
            const b = points[(i + 1) % points.length]!;

            for (let other = loop; other < loops.length; other++) {
                const candidate = loops[other]!;

                for (let j = 0; j < candidate.length; j++) {
                    if (
                        other === loop &&
                        (i === j || (i + 1) % points.length === j ||
                            (j + 1) % points.length === i)
                    ) {
                        continue;
                    }

                    if (crossing(
                        a, b,
                        candidate[j]!,
                        candidate[(j + 1) % candidate.length]!,
                        tolerance
                    )) {
                        fail(
                            "unsupported-topology",
                            "Surface boundaries intersect or touch"
                        );
                    }
                }
            }
        }

        if (loop > 0 && !insideContour(points[0]!, loops[0]!)) {
            fail("unsupported-topology", "Hole lies outside the outer contour");
        }

        if (loop > 0 && loops.slice(1).some((other, index) =>
            index !== loop - 1 && insideContour(points[0]!, other)
        )) {
            fail("unsupported-topology", "Holes are nested or overlapping");
        }
    }
}

function validateProfile(
    profile: SampledProfile2,
    precision: GeometryPrecision
): { uv: THREE.Vector2[]; loops: number[][]; tolerance: number } {
    const contours = [profile?.outer, ...(profile?.holes ?? [])];

    if (!profile?.outer || !Array.isArray(contours) ||
        contours.some(contour =>
            !contour ||
            !Array.isArray(contour.points) ||
            !Array.isArray(contour.parameters) ||
            contour.points.length < 3 ||
            contour.points.length !== contour.parameters.length ||
            contour.parameters[0] !== 0 ||
            contour.parameters.some((station, i) =>
                !Number.isFinite(station) || station < 0 ||
                station >= 1 ||
                (i > 0 && station <= contour.parameters[i - 1]!)
            ) ||
            contour.points.some(point => !finite2(point))
        )
    ) {
        fail("invalid-input", "Expected fully sampled closed contour loops");
    }

    const uv = contours.flatMap(contour =>
        contour.points.map(point => new THREE.Vector2(point.x, point.y))
    );
    const extent = new THREE.Box2().setFromPoints(uv)
        .getSize(new THREE.Vector2()).length();
    const tolerance = lengthTolerance(precision, extent);
    const loops: number[][] = [];
    let offset = 0;

    for (const contour of contours) {
        const points = contour.points.map(point =>
            new THREE.Vector2(point.x, point.y)
        );
        const area = THREE.ShapeUtils.area(points);
        if (!(Math.abs(area) > tolerance * tolerance) ||
            (loops.length === 0 ? area >= 0 : area <= 0)) {
            fail("invalid-input", "Outer contour must be clockwise and holes counterclockwise");
        }

        for (let i = 0; i < points.length; i++) {
            const from = points[i]!;
            const to = points[(i + 1) % points.length]!;

            if (!(from.distanceTo(to) > tolerance)) {
                fail("degenerate-geometry", "Collapsed sampled boundary edge");
            }
        }

        loops.push(points.map((_, i) => offset + i));
        offset += points.length;
    }

    validateLoops(
        loops.map(loop => loop.map(id => uv[id]!)),
        tolerance
    );

    return { uv, loops, tolerance };
}

function edgesOf(triangles: readonly Triangle[]): Map<string, {
    a: number;
    b: number;
    uses: number;
}> {
    const edges = new Map<string, { a: number; b: number; uses: number }>();

    for (const triangle of triangles) {
        for (let i = 0; i < 3; i++) {
            const a = triangle[i]!;
            const b = triangle[(i + 1) % 3]!;
            const id = key(a, b);
            const found = edges.get(id);

            if (found) found.uses++;
            else edges.set(id, { a, b, uses: 1 });
        }
    }

    return edges;
}

/**
 * Construct one charted surface patch from exact sampled boundaries.
 * Interior triangulation may be refined; no outer or hole edge is split.
 * The requested error bounds measured chart samples, not an analytic
 * guarantee for arbitrary black-box SurfaceChart functions.
 */
export function fillSurfacePatch({
    profile,
    chart,
    region,
    maxDeviation,
    precision
}: SurfaceFillOptions): GeometryResult {
    const policy = resolvePrecision(precision);

    if (!region?.trim() ||
        !chart ||
        typeof chart.at !== "function" ||
        typeof chart.parameterOf !== "function" ||
        typeof chart.normalAt !== "function" ||
        (maxDeviation !== undefined &&
            (!Number.isFinite(maxDeviation) || maxDeviation <= 0))) {
        fail("invalid-input", "Invalid patch region, chart or deviation");
    }

    const { uv, loops, tolerance } = validateProfile(profile, policy);
    const positions = uv.map(point => sampleChart(chart, point, tolerance));
    let triangles: Triangle[];

    try {
        triangles = triangulateProfile(
            [
                profile.outer.points,
                ...(profile.holes ?? []).map(hole => hole.points)
            ], policy
        );
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                "fillSurfacePatch", error.reason, error.message, error.context
            );
        }
        throw error;
    }

    const boundary = new Set<string>();
    for (const loop of loops) {
        for (let i = 0; i < loop.length; i++) {
            boundary.add(key(loop[i]!, loop[(i + 1) % loop.length]!));
        }
    }

    const normalAt = (point: THREE.Vector2): THREE.Vector3 => {
        const normal = chart.normalAt(point);
        if (!normal || ![normal.x, normal.y, normal.z].every(Number.isFinite)) {
            fail("degenerate-geometry", "Chart normal is not finite");
        }
        const vector = new THREE.Vector3(normal.x, normal.y, normal.z);
        if (!(vector.length() > policy.absoluteLength)) {
            fail("degenerate-geometry", "Chart normal collapses");
        }
        return vector.normalize();
    };

    function checkFace(face: Triangle): void {
        const [a, b, c] = face;
        if (!triangleQuality(
            positions[a]!, positions[b]!, positions[c]!, policy
        )) {
            fail("degenerate-geometry", "Invalid charted face triangle");
        }

        const centroid = uv[a]!.clone().add(uv[b]!).add(uv[c]!)
            .multiplyScalar(1 / 3);
        const direction = positions[b]!.clone().sub(positions[a]!)
            .cross(positions[c]!.clone().sub(positions[a]!))
            .normalize();

        if (direction.dot(normalAt(centroid)) <= Math.sin(policy.angle)) {
            fail("unsupported-topology", "Chart folds or reverses a face normal");
        }
    }

    // All authored triangles use one consistent orientation relative to
    // the chart normal. Never flip individual faces independently.
    const initial = triangles[0]!;
    const center = uv[initial[0]]!.clone().add(uv[initial[1]]!)
        .add(uv[initial[2]]!).multiplyScalar(1 / 3);
    const direction = positions[initial[1]]!.clone()
        .sub(positions[initial[0]]!)
        .cross(positions[initial[2]]!.clone().sub(positions[initial[0]]!));

    if (direction.dot(normalAt(center)) < 0) {
        triangles = triangles.map(([a, b, c]) => [a, c, b]);
    }

    if (maxDeviation !== undefined) {
        // Refinement is conforming: split marked interior edges in every
        // incident face and use one shared midpoint vertex. A centroid fan
        // handles interior curvature without touching any boundary edge.
        const maxIterations = 15;
        const maxFaces = 40_000;
        let converged = false;

        for (let iteration = 0; iteration <= maxIterations; iteration++) {
            const edges = edgesOf(triangles);
            const split = new Set<string>();
            const marked = new Set<number>();

            for (const [id, edge] of edges) {
                if (edge.uses > 2) {
                    fail("invalid-topology", "Nonmanifold surface edge");
                }

                const midpointUv = uv[edge.a]!.clone()
                    .add(uv[edge.b]!).multiplyScalar(0.5);
                const expected = positions[edge.a]!.clone()
                    .add(positions[edge.b]!).multiplyScalar(0.5);
                const actual = sampleChart(chart, midpointUv, tolerance);
                const deviation = actual.distanceTo(expected);

                if (deviation <= maxDeviation) continue;
                if (boundary.has(id)) {
                    fail(
                        "sampling-limit",
                        "Boundary chord exceeds requested accuracy; resample the shared interface first"
                    );
                }
                split.add(id);
            }

            for (let i = 0; i < triangles.length; i++) {
                const [a, b, c] = triangles[i]!;
                const centroidUv = uv[a]!.clone().add(uv[b]!).add(uv[c]!)
                    .multiplyScalar(1 / 3);
                const expected = positions[a]!.clone().add(positions[b]!)
                    .add(positions[c]!).multiplyScalar(1 / 3);
                const deviation = sampleChart(chart, centroidUv, tolerance)
                    .distanceTo(expected);

                if (deviation > maxDeviation) marked.add(i);
            }

            if (split.size === 0 && marked.size === 0) {
                converged = true;
                break;
            }

            if (iteration === maxIterations || triangles.length > maxFaces) {
                fail("sampling-limit", "Interior refinement reached its triangle budget");
            }

            const midpoints = new Map<string, number>();
            for (const id of split) {
                const edge = edges.get(id)!;
                const point = uv[edge.a]!.clone().add(uv[edge.b]!)
                    .multiplyScalar(0.5);
                midpoints.set(id, uv.push(point) - 1);
                positions.push(sampleChart(chart, point, tolerance));
            }

            const refined: Triangle[] = [];
            triangles.forEach((face, index) => {
                const middle = [0, 1, 2].map(i =>
                    midpoints.get(key(face[i]!, face[(i + 1) % 3]!))
                );
                const cut = middle.flatMap((id, i) =>
                    id === undefined ? [] : [i]
                );

                if (cut.length === 0) {
                    if (!marked.has(index)) {
                        refined.push(face);
                        return;
                    }
                    const center = face.reduce(
                        (point, id) => point.add(uv[id]!),
                        new THREE.Vector2()
                    ).multiplyScalar(1 / 3);
                    const vertex = uv.push(center) - 1;
                    positions.push(sampleChart(chart, center, tolerance));
                    const [a, b, c] = face;
                    refined.push([a, b, vertex], [b, c, vertex],
                        [c, a, vertex]);
                    return;
                }

                // Shared edge midpoint splits conformingly in each incident
                // triangle. A centroid fan here would create 4–6 faces even
                // for a single split and compound aggressively on curved
                // patches with long, precisely sampled boundary chains.
                if (cut.length === 1) {
                    const i = cut[0]!;
                    const a = face[i]!;
                    const b = face[(i + 1) % 3]!;
                    const c = face[(i + 2) % 3]!;
                    const m = middle[i]!;
                    refined.push([a, m, c], [m, b, c]);
                    return;
                }
                if (cut.length === 2) {
                    const i = [0, 1, 2].find(edge =>
                        middle[edge] === undefined
                    )!;
                    const a = face[i]!;
                    const b = face[(i + 1) % 3]!;
                    const c = face[(i + 2) % 3]!;
                    const bc = middle[(i + 1) % 3]!;
                    const ca = middle[(i + 2) % 3]!;
                    refined.push([a, b, bc], [a, bc, ca],
                        [ca, bc, c]);
                    return;
                }

                const [a, b, c] = face;
                const ab = middle[0]!;
                const bc = middle[1]!;
                const ca = middle[2]!;
                refined.push([a, ab, ca], [ab, b, bc],
                    [ca, bc, c], [ab, bc, ca]);
            });
            triangles = refined;
        }

        if (!converged) {
            fail("sampling-limit", "Interior chart deviation is not resolved");
        }
    }

    for (const face of triangles) checkFace(face);

    const mesh: MeshData = {
        vertices: positions,
        quads: [],
        triangles: triangles.map(corners => ({
            corners,
            uvs: corners.map(id => uv[id]!.clone()) as TriangleFace["uvs"],
            surface: region
        }))
    };
    const result = geometryResult(mesh, policy);
    const actualBoundaries = topologyOf(result).openBoundaries();

    if (actualBoundaries.length !== loops.length) {
        fail("invalid-topology", "Surface boundary differs from the sampled profile");
    }

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    for (let i = 0; i < loops.length; i++) {
        const source = loops[i]!;
        const match = actualBoundaries.find(loop =>
            loop.closed &&
            loop.vertices.length === source.length &&
            loop.vertices.every(id => source.includes(id))
        );

        if (!match) {
            fail("invalid-topology", "Sampled boundary was changed by surface construction");
        }

        boundaries[i === 0 ? "outer" : `hole-${i - 1}`] = [match];
    }

    const faces: FaceRef[] = triangles.map((_, index) => ({
        kind: "triangle",
        index
    }));

    return {
        ...result,
        boundaries,
        patches: {
            [region]: [{
                owner: result.id,
                faces,
                chart
            }]
        }
    };
}
