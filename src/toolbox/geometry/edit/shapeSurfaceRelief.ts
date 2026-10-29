import * as THREE from "three";
import type { SampledBoundary } from "../definitions/geometry";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    geometryResult,
    GeometryOperationError,
    type BoundaryRef,
    type FaceRef,
    type GeometryResult,
    type SurfaceChart,
    type SurfacePatchRef
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    triangleQuality,
    type GeometryPrecision
} from "../kernel/precision";
import { topologyOf } from "../kernel/topology";

export interface SurfaceReliefFeature {
    path: SampledBoundary;
    halfWidthAt(t: number): number;
    displacementAt(u: number, t: number): number;
    regionAt?(u: number, t: number): string;
}

export interface SurfaceReliefOptions {
    overlap: "minimum" | "sum";
    /** Maximum sampled position error in metres; default 0.002 m. */
    maxDeviation?: number;
    precision?: GeometryPrecision;
}

type Triangle = [number, number, number];

interface FeaturePath {
    feature: SurfaceReliefFeature;
    uv: THREE.Vector2[];
    stations: number[];
    closed: boolean;
}

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "degenerate-geometry" | "unsupported-topology" |
        "sampling-limit" | "self-intersection",
    message: string
): never {
    throw new GeometryOperationError("shapeSurfaceRelief", reason, message);
}

function faceKey(face: FaceRef): string {
    return `${face.kind}:${face.index}`;
}

function edgeKey(a: number, b: number): string {
    return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function finite2(point: THREE.Vector2Like): boolean {
    return !!point && [point.x, point.y].every(Number.isFinite);
}

function finite3(point: THREE.Vector3Like): boolean {
    return !!point && [point.x, point.y, point.z].every(Number.isFinite);
}

function vector3(point: THREE.Vector3Like): THREE.Vector3 {
    return new THREE.Vector3(point.x, point.y, point.z);
}

function checkedChart(
    chart: SurfaceChart,
    uv: THREE.Vector2,
    tolerance: number
): THREE.Vector3 {
    const point = chart.at(uv);

    if (!finite3(point)) {
        fail("degenerate-geometry", "Surface chart returned invalid coordinates");
    }

    const inverse = chart.parameterOf(point);
    if (!finite2(inverse) ||
        uv.distanceTo(new THREE.Vector2(inverse.x, inverse.y)) > tolerance) {
        fail("unsupported-topology", "Surface chart does not round-trip");
    }

    const normal = chart.normalAt(uv);
    if (!finite3(normal) ||
        vector3(normal).length() <= tolerance) {
        fail("degenerate-geometry", "Surface chart normal is undefined");
    }

    return vector3(point);
}

function validateFeatures(
    features: readonly SurfaceReliefFeature[],
    chart: SurfaceChart,
    tolerance: number
): FeaturePath[] {
    return features.map(feature => {
        const path = feature?.path;

        if (
            !path || typeof path.closed !== "boolean" ||
            !Array.isArray(path.points) ||
            !Array.isArray(path.parameters) ||
            path.points.length !== path.parameters.length ||
            path.points.length < (path.closed ? 3 : 2) ||
            path.parameters[0] !== 0 ||
            (!path.closed && path.parameters.at(-1) !== 1) ||
            path.parameters.some((t, i) =>
                !Number.isFinite(t) || t < 0 ||
                (path.closed ? t >= 1 : t > 1) ||
                (i > 0 && t <= path.parameters[i - 1]!)
            ) ||
            typeof feature.halfWidthAt !== "function" ||
            typeof feature.displacementAt !== "function" ||
            (feature.regionAt !== undefined &&
                typeof feature.regionAt !== "function") ||
            path.points.some(point => !finite3(point))
        ) {
            fail("invalid-input", "Relief needs an ordered sampled feature path");
        }

        const uv = path.points.map(point => {
            const mapped = chart.parameterOf(point);

            if (!finite2(mapped)) {
                fail("unsupported-topology", "Feature path is outside the patch chart");
            }

            const parameter = new THREE.Vector2(mapped.x, mapped.y);

            if (checkedChart(chart, parameter, tolerance)
                .distanceTo(vector3(point)) > tolerance) {
                fail("unsupported-topology", "Feature point is not on the selected surface");
            }

            return parameter;
        });

        const edgeCount = path.closed ? uv.length : uv.length - 1;

        for (let index = 0; index < edgeCount; index++) {
            if (uv[index]!.distanceTo(uv[(index + 1) % uv.length]!) <= tolerance) {
                fail("degenerate-geometry", "Feature path segment collapsed");
            }
        }

        for (const t of path.parameters) {
            const width = feature.halfWidthAt(t);
            const left = feature.displacementAt(-1, t);
            const right = feature.displacementAt(1, t);

            if (
                !Number.isFinite(width) || width <= tolerance ||
                ![left, right].every(Number.isFinite) ||
                Math.max(Math.abs(left), Math.abs(right)) > tolerance
            ) {
                fail("invalid-input", "Feature width must be positive and shoulders must taper to zero");
            }
        }

        return {
            feature,
            uv,
            stations: [...path.parameters],
            closed: path.closed
        };
    });
}

interface Contribution {
    height: number;
    region?: string;
    strength: number;
}

function contribution(
    path: FeaturePath,
    point: THREE.Vector2,
    chart: SurfaceChart,
    tolerance: number
): Contribution | undefined {
    let nearest: {
        point: THREE.Vector2;
        tangent: THREE.Vector2;
        station: number;
        distance: number;
    } | undefined;

    const count = path.closed ? path.uv.length : path.uv.length - 1;

    for (let index = 0; index < count; index++) {
        const a = path.uv[index]!;
        const b = path.uv[(index + 1) % path.uv.length]!;
        const direction = b.clone().sub(a);
        const fraction = THREE.MathUtils.clamp(
            point.clone().sub(a).dot(direction) / direction.lengthSq(),
            0, 1
        );
        const projected = a.clone().addScaledVector(direction, fraction);
        const actualDistance = vector3(chart.at(point)).distanceTo(
            vector3(chart.at(projected))
        );

        if (!nearest || actualDistance < nearest.distance) {
            const start = path.stations[index]!;
            const end = path.stations[index + 1] ?? 1;

            nearest = {
                point: projected,
                tangent: direction,
                station: start + (end - start) * fraction,
                distance: actualDistance
            };
        }
    }

    if (!nearest) return undefined;
    const width = path.feature.halfWidthAt(nearest.station);

    if (!Number.isFinite(width) || width <= tolerance) {
        fail("invalid-input", "Feature half-width is not positive");
    }

    if (nearest.distance >= width) return undefined;

    const side = Math.sign(
        nearest.tangent.x * (point.y - nearest.point.y) -
        nearest.tangent.y * (point.x - nearest.point.x)
    ) || 1;
    const u = side * nearest.distance / width;
    const height = path.feature.displacementAt(u, nearest.station);

    if (!Number.isFinite(height)) {
        fail("invalid-input", "Feature displacement is not finite");
    }

    const region = path.feature.regionAt?.(u, nearest.station);

    if (region !== undefined && !region.trim()) {
        fail("invalid-input", "Feature region must be nonempty");
    }

    return {
        height,
        ...(region === undefined ? {} : { region }),
        strength: Math.abs(height)
    };
}

function field(
    paths: readonly FeaturePath[],
    uv: THREE.Vector2,
    chart: SurfaceChart,
    overlap: SurfaceReliefOptions["overlap"],
    tolerance: number
): { height: number; region?: string; strength: number } {
    const values = paths.flatMap(path => {
        const value = contribution(path, uv, chart, tolerance);
        return value === undefined ? [] : [value];
    });

    if (!values.length) return { height: 0, strength: 0 };
    const chosen = values.reduce((best, candidate) =>
        candidate.strength > best.strength ? candidate : best
    );
    const height = overlap === "sum"
        ? values.reduce((sum, value) => sum + value.height, 0)
        : Math.min(...values.map(value => value.height));

    return {
        height,
        ...(chosen.region === undefined ? {} : { region: chosen.region }),
        strength: chosen.strength
    };
}

function sourceFace(
    source: GeometryResult,
    face: FaceRef
): QuadFace | TriangleFace {
    const selected = face.kind === "quad"
        ? source.geometry.quads[face.index]
        : source.geometry.triangles?.[face.index];

    if (!selected) {
        fail("invalid-input", "Patch contains an unknown authored face");
    }
    return selected;
}

function orientedArea(
    uv: readonly THREE.Vector2[],
    [a, b, c]: Triangle
): number {
    const x = uv[a]!;
    const y = uv[b]!;
    const z = uv[c]!;

    return (y.x - x.x) * (z.y - x.y) -
        (y.y - x.y) * (z.x - x.x);
}

function chartUv(
    chart: SurfaceChart,
    point: THREE.Vector3,
    tolerance: number
): THREE.Vector2 {
    const mapped = chart.parameterOf(point);

    if (!finite2(mapped)) {
        fail("unsupported-topology", "Selected patch lacks valid chart coordinates");
    }

    const uv = new THREE.Vector2(mapped.x, mapped.y);

    if (checkedChart(chart, uv, tolerance).distanceTo(point) > tolerance) {
        fail("unsupported-topology", "Selected geometry is not on its patch chart");
    }

    return uv;
}

function seeds(
    paths: readonly FeaturePath[],
    chart: SurfaceChart,
    tolerance: number
): THREE.Vector2[] {
    const locations: THREE.Vector2[] = [];
    const fractions = [0, 0.25, 0.5, 0.75];
    const lateral = [-1, -0.75, -0.5, 0, 0.5, 0.75, 1];

    for (const path of paths) {
        const count = path.closed ? path.uv.length : path.uv.length - 1;

        for (let segment = 0; segment < count; segment++) {
            const a = path.uv[segment]!;
            const b = path.uv[(segment + 1) % path.uv.length]!;
            const direction = b.clone().sub(a).normalize();
            const normal = new THREE.Vector2(-direction.y, direction.x);
            const begin = path.stations[segment]!;
            const end = path.stations[segment + 1] ?? 1;

            for (const fraction of [...fractions, ...(segment === count - 1 ? [1] : [])]) {
                const uv = a.clone().lerp(b, fraction);
                const t = begin + fraction * (end - begin);
                const width = path.feature.halfWidthAt(t);
                const probe = normal.clone().multiplyScalar(
                    Math.max(tolerance * 20, width * 0.01)
                );
                const scale = vector3(chart.at(uv.clone().add(probe)))
                    .distanceTo(vector3(chart.at(uv))) / probe.length();

                if (!Number.isFinite(scale) || scale <= tolerance) {
                    fail("degenerate-geometry", "Relief chart has zero lateral scale");
                }

                for (const fractionAcross of lateral) {
                    locations.push(uv.clone().addScaledVector(
                        normal, fractionAcross * width / scale
                    ));
                }
            }
        }
    }

    return locations;
}

function insertPoint(
    uv: THREE.Vector2[],
    triangles: Triangle[],
    point: THREE.Vector2,
    boundary: Set<string>,
    tolerance: number
): boolean {
    if (uv.some(existing => existing.distanceTo(point) <= tolerance)) {
        return false;
    }

    let inside: {
        face: number;
        edge?: string;
    } | undefined;
    const epsilon = tolerance / Math.max(1, point.length());

    for (let index = 0; index < triangles.length; index++) {
        const [a, b, c] = triangles[index]!;
        const first = uv[a]!;
        const second = uv[b]!;
        const third = uv[c]!;
        const area = orientedArea(uv, [a, b, c]);

        if (Math.abs(area) <= tolerance * tolerance) {
            fail("degenerate-geometry", "Patch parameter triangle collapsed");
        }

        const cross = (x: THREE.Vector2, y: THREE.Vector2, z: THREE.Vector2) =>
            (y.x - x.x) * (z.y - x.y) -
            (y.y - x.y) * (z.x - x.x);
        const weights = [
            cross(point, second, third) / area,
            cross(first, point, third) / area,
            cross(first, second, point) / area
        ];

        if (weights.some(weight => weight < -epsilon ||
            weight > 1 + epsilon)) continue;

        const near = weights.findIndex(weight => Math.abs(weight) <= epsilon);
        const corners = [a, b, c];
        inside = {
            face: index,
            ...(near < 0 ? {} : {
                edge: edgeKey(
                    corners[(near + 1) % 3]!,
                    corners[(near + 2) % 3]!
                )
            })
        };
        break;
    }

    if (!inside) return false;

    if (inside.edge && boundary.has(inside.edge)) {
        return false;
    }

    const id = uv.push(point.clone()) - 1;

    if (inside.edge) {
        const edge = inside.edge;
        const replacements: Triangle[] = [];
        let affected = 0;

        for (const face of triangles) {
            const found = [0, 1, 2].find(index =>
                edgeKey(face[index]!, face[(index + 1) % 3]!) === edge
            );

            if (found === undefined) {
                replacements.push(face);
                continue;
            }

            affected++;
            const a = face[found]!;
            const b = face[(found + 1) % 3]!;
            const c = face[(found + 2) % 3]!;
            replacements.push([a, id, c], [id, b, c]);
        }

        if (affected !== 2) {
            fail("invalid-topology", "Relief attempts to split a boundary edge");
        }
        triangles.splice(0, triangles.length, ...replacements);
        return true;
    }

    const [a, b, c] = triangles[inside.face]!;
    triangles.splice(
        inside.face, 1,
        [a, b, id], [b, c, id], [c, a, id]
    );
    return true;
}

/**
 * Rebuild selected charted faces once from every requested relief feature.
 * Existing seams are preserved vertex-for-vertex. Features use signed
 * surface-normal displacement; the opposite mating surface is untouched.
 */
export function shapeSurfaceRelief(
    source: GeometryResult,
    patch: SurfacePatchRef,
    features: readonly SurfaceReliefFeature[],
    options: SurfaceReliefOptions
): GeometryResult {
    const policy = resolvePrecision(options?.precision);
    const maxDeviation = options?.maxDeviation ?? 0.002;

    if (
        !source?.geometry || !patch ||
        !Array.isArray(features) || features.length === 0 ||
        (options?.overlap !== "minimum" && options?.overlap !== "sum") ||
        !Number.isFinite(maxDeviation) || maxDeviation <= 0
    ) {
        fail("invalid-input", "Expected a patch, features and valid relief options");
    }

    assertSelectionOwner(source, patch);

    if (!Array.isArray(patch.faces) || !patch.faces.length ||
        !patch.chart || typeof patch.chart.at !== "function" ||
        typeof patch.chart.parameterOf !== "function" ||
        typeof patch.chart.normalAt !== "function") {
        fail("invalid-input", "Relief requires a charted authored surface selection");
    }

    const selected = new Set<string>();
    for (const face of patch.faces) {
        const id = faceKey(face);
        if (selected.has(id)) {
            fail("invalid-input", "Patch includes the same face twice");
        }
        sourceFace(source, face);
        selected.add(id);
    }

    const positions = source.geometry.vertices.map(p => p.clone());
    const bounds = new THREE.Box3().setFromPoints(positions);
    const tolerance = lengthTolerance(
        policy, bounds.getSize(new THREE.Vector3()).length()
    );
    const uv = positions.map(() => new THREE.Vector2(NaN, NaN));
    const triangles: Triangle[] = [];
    const originalSurfaces: string[] = [];

    for (const reference of patch.faces) {
        const face = sourceFace(source, reference);
        for (const vertex of face.corners) {
            if (!finite2(uv[vertex]!)) {
                uv[vertex] = chartUv(patch.chart, positions[vertex]!, tolerance);
            }
        }

        if (reference.kind === "quad") {
            const [a, b, c, d] = face.corners;
            triangles.push([a!, b!, c!], [a!, c!, d!]);
            originalSurfaces.push(face.surface, face.surface);
        } else {
            triangles.push([...face.corners] as Triangle);
            originalSurfaces.push(face.surface);
        }
    }

    const uses = new Map<string, number>();
    for (const triangle of triangles) {
        for (let i = 0; i < 3; i++) {
            const key = edgeKey(triangle[i]!, triangle[(i + 1) % 3]!);
            uses.set(key, (uses.get(key) ?? 0) + 1);
        }
    }
    if ([...uses.values()].some(n => n > 2)) {
        fail("invalid-topology", "Relief patch has nonmanifold edges");
    }

    const boundary = new Set(
        [...uses].filter(([, n]) => n === 1).map(([key]) => key)
    );
    const boundaryVertices = new Set<number>();
    for (const triangle of triangles) {
        for (let i = 0; i < 3; i++) {
            const a = triangle[i]!;
            const b = triangle[(i + 1) % 3]!;
            if (boundary.has(edgeKey(a, b))) {
                boundaryVertices.add(a);
                boundaryVertices.add(b);
            }
        }
    }

    const paths = validateFeatures(features, patch.chart, tolerance);

    const originalPositions = positions.map(p => p.clone());
    const displacement = (point: THREE.Vector2) =>
        field(paths, point, patch.chart, options.overlap, tolerance);

    // The patch rim may be welded to a wall or used by another surface.
    // Verify the full sampled edge, not just its endpoints.
    for (const edge of boundary) {
        const [a, b] = edge.split(":").map(Number);
        if (a === undefined || b === undefined) {
            fail("invalid-topology", "Invalid patch boundary edge");
        }
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
            const point = uv[a]!.clone().lerp(uv[b]!, t);
            if (Math.abs(displacement(point).height) > tolerance) {
                fail(
                    "unsupported-topology",
                    "Relief reaches a shared rim; taper it inward or rebuild the interface"
                );
            }
        }
    }

    const candidateSeeds = seeds(paths, patch.chart, tolerance);

    for (const point of candidateSeeds) {
        if (!finite2(point)) {
            fail("degenerate-geometry", "Invalid relief sampling station");
        }

        insertPoint(uv, triangles, point, boundary, tolerance);
        if (triangles.length > 25000) {
            fail("sampling-limit", "Relief exceeded its topology budget");
        }
    }

    // A single conforming reconstruction: centroids refine only their
    // own triangle. Shared original edges never acquire one-sided splits.
    const charted = (point: THREE.Vector2) => {
        const base = checkedChart(patch.chart, point, tolerance);
        const normal = vector3(patch.chart.normalAt(point)).normalize();
        return base.addScaledVector(normal, displacement(point).height);
    };

    for (let iteration = 0; iteration < 7; iteration++) {
        const pending: number[] = [];

        for (let i = 0; i < triangles.length; i++) {
            const [a, b, c] = triangles[i]!;
            const center = uv[a]!.clone().add(uv[b]!).add(uv[c]!)
                .multiplyScalar(1 / 3);
            const actual = charted(center);
            const estimated = charted(uv[a]!).add(charted(uv[b]!))
                .add(charted(uv[c]!)).multiplyScalar(1 / 3);

            if (actual.distanceTo(estimated) > maxDeviation) {
                pending.push(i);
            }
        }

        if (!pending.length) break;
        if (iteration === 6 || triangles.length + pending.length * 2 > 25000) {
            fail("sampling-limit", "Relief detail exceeds the interior sampling budget");
        }

        for (const index of pending.reverse()) {
            const [a, b, c] = triangles[index]!;
            const center = uv[a]!.clone().add(uv[b]!).add(uv[c]!)
                .multiplyScalar(1 / 3);
            const id = uv.push(center) - 1;
            triangles.splice(index, 1,
                [a, b, id], [b, c, id], [c, a, id]
            );
        }
    }

    for (let i = originalPositions.length; i < uv.length; i++) {
        positions.push(charted(uv[i]!));
    }
    for (let i = 0; i < originalPositions.length; i++) {
        if (finite2(uv[i]!)) {
            positions[i] = boundaryVertices.has(i)
                ? originalPositions[i]!.clone() : charted(uv[i]!);
        }
    }

    for (const triangle of triangles) {
        const [a, b, c] = triangle;
        if (!triangleQuality(
            positions[a]!, positions[b]!, positions[c]!, policy
        ) || orientedArea(uv, triangle) === 0) {
            fail("degenerate-geometry", "Relief produced a collapsed face");
        }
    }

    const outsideQuads: QuadFace[] = [];
    const outsideTriangles: TriangleFace[] = [];
    const quadMap = new Map<number, number>();
    const triangleMap = new Map<number, number>();

    source.geometry.quads.forEach((face, index) => {
        if (!selected.has(faceKey({ kind: "quad", index }))) {
            quadMap.set(index, outsideQuads.push(face) - 1);
        }
    });
    (source.geometry.triangles ?? []).forEach((face, index) => {
        if (!selected.has(faceKey({ kind: "triangle", index }))) {
            triangleMap.set(index, outsideTriangles.push(face) - 1);
        }
    });

    const beforeNew = outsideTriangles.length;
    const originalRegion = originalSurfaces[0] ?? "surface";

    triangles.forEach(triangle => {
        const center = triangle.reduce(
            (value, id) => value.add(uv[id]!),
            new THREE.Vector2()
        ).multiplyScalar(1 / 3);
        const active = displacement(center);
        const region = Math.abs(active.height) <= tolerance
            ? originalRegion
            : active.region ?? (
                active.strength > tolerance
                    ? "relief-floor" : "relief-shoulder"
            );

        outsideTriangles.push({
            corners: triangle,
            uvs: triangle.map(id => uv[id]!.clone()) as TriangleFace["uvs"],
            surface: region
        });
    });

    const mesh: MeshData = {
        vertices: positions,
        quads: outsideQuads,
        triangles: outsideTriangles
    };

    let result: GeometryResult;
    try {
        result = geometryResult(mesh, policy);
        topologyOf(result).openBoundaries();
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                "shapeSurfaceRelief", error.reason, error.message, error.context
            );
        }
        throw error;
    }

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(source.boundaries)) {
        boundaries[name] = refs.map(ref => {
            assertSelectionOwner(source, ref);
            return {
                owner: result.id,
                vertices: [...ref.vertices],
                closed: ref.closed
            };
        });
    }

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);

    for (const [name, refs] of Object.entries(source.patches ?? {})) {
        for (const ref of refs) {
            assertSelectionOwner(source, ref);

            if (ref === patch) continue;
            if (ref.faces.some(face => selected.has(faceKey(face)))) continue;

            const mapped = ref.faces.map(face => ({
                kind: face.kind,
                index: (face.kind === "quad"
                    ? quadMap.get(face.index) : triangleMap.get(face.index))!
            }));
            if (mapped.some(face => face.index === undefined)) continue;

            (patches[name] ??= []).push({
                owner: result.id,
                faces: mapped,
                chart: ref.chart
            });
        }
    }

    // Reissue a chart only if the inverse round-trips the *new* surface.
    // Arbitrary charts can fail this after normal-direction relief.
    const modifiedChart: SurfaceChart = {
        at: point => charted(new THREE.Vector2(point.x, point.y)),
        parameterOf: point => patch.chart.parameterOf(point),
        normalAt: point => {
            const uv = new THREE.Vector2(point.x, point.y);
            const delta = Math.max(tolerance * 10, 1e-5);
            const tangentU = charted(uv.clone().add(new THREE.Vector2(delta, 0)))
                .sub(charted(uv.clone().add(new THREE.Vector2(-delta, 0))));
            const tangentV = charted(uv.clone().add(new THREE.Vector2(0, delta)))
                .sub(charted(uv.clone().add(new THREE.Vector2(0, -delta))));
            return tangentU.cross(tangentV).normalize();
        }
    };

    const canRetain = triangles.every(face =>
        face.every(id => {
            const inverse = modifiedChart.parameterOf(positions[id]!);
            return finite2(inverse) &&
                uv[id]!.distanceTo(new THREE.Vector2(inverse.x, inverse.y)) <= tolerance;
        })
    );

    if (canRetain) {
        const name = Object.entries(source.patches ?? {})
            .find(([, refs]) => refs.includes(patch))?.[0] ?? originalRegion;
        (patches[name] ??= []).push({
            owner: result.id,
            faces: triangles.map((_, i) => ({
                kind: "triangle" as const,
                index: beforeNew + i
            })),
            chart: modifiedChart
        });
    }

    return {
        ...result,
        boundaries,
        ...(Object.keys(patches).length ? { patches } : {})
    };
}
