import * as THREE from "three";

import type { Contour2 } from "../definitions/geometry";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    geometryResult,
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
import { patchChartMatches, transferBoundary } from "../kernel/selectionLifecycle";
import { triangulateProfile } from "../build/triangulateProfile";
import { fillSurfacePatch } from "../build/fillSurfacePatch";
import { raycastSurface } from "../queries/raycastSurface";

export interface RecessOptions {
    depth: number;
    wallRegion: string;
    floorRegion: string;
    precision?: GeometryPrecision;
}

type Face = QuadFace | TriangleFace;
type Loop = { ids: number[]; uv: THREE.Vector2[] };

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "unsupported-topology" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("patchOpening", reason, message);
}

function faceKey(ref: FaceRef): string {
    return ref.kind + ":" + ref.index;
}

function edgeKey(a: number, b: number): string {
    return Math.min(a, b) + ":" + Math.max(a, b);
}

function area(points: readonly THREE.Vector2[]): number {
    return THREE.ShapeUtils.area(points);
}

function cross(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): number {
    return (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x);
}

function onEdge(
    point: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2,
    tolerance: number
): boolean {
    const line = b.clone().sub(a);
    const length = line.length();
    const projection = point.clone().sub(a).dot(line);
    return length > tolerance &&
        Math.abs(cross(a, b, point)) <= tolerance * length &&
        projection >= -tolerance * length &&
        projection <= line.lengthSq() + tolerance * length;
}

function intersects(
    a: THREE.Vector2, b: THREE.Vector2,
    c: THREE.Vector2, d: THREE.Vector2,
    tolerance: number
): boolean {
    const threshold = tolerance * Math.max(a.distanceTo(b), c.distanceTo(d));
    const ac = cross(a, b, c);
    const ad = cross(a, b, d);
    const ca = cross(c, d, a);
    const cb = cross(c, d, b);

    return (
        (ac > threshold && ad < -threshold ||
            ac < -threshold && ad > threshold) &&
        (ca > threshold && cb < -threshold ||
            ca < -threshold && cb > threshold)
    ) || [onEdge(a, c, d, tolerance), onEdge(b, c, d, tolerance),
        onEdge(c, a, b, tolerance), onEdge(d, a, b, tolerance)].some(Boolean);
}

function inside(
    point: THREE.Vector2, contour: readonly THREE.Vector2[],
    tolerance: number
): boolean {
    let contained = false;
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const a = contour[j]!;
        const b = contour[i]!;
        if (onEdge(point, a, b, tolerance)) return false;
        if ((a.y > point.y) !== (b.y > point.y) &&
            point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
            contained = !contained;
        }
    }
    return contained;
}

function loopEdges(loop: readonly THREE.Vector2[], others: readonly THREE.Vector2[],
    tolerance: number): boolean {
    return loop.some((a, i) =>
        others.some((c, j) => intersects(
            a, loop[(i + 1) % loop.length]!,
            c, others[(j + 1) % others.length]!,
            tolerance
        ))
    );
}

function validateOutline(
    outline: Contour2,
    loops: readonly Loop[],
    tolerance: number
): THREE.Vector2[] {
    if (!outline?.closed || !Array.isArray(outline.points) ||
        outline.points.length < 3 || outline.points.some(p =>
            !p || ![p.x, p.y].every(Number.isFinite))) {
        fail("invalid-input", "Opening requires a finite closed contour");
    }
    const points = outline.points.map(p => new THREE.Vector2(p.x, p.y));
    if (Math.abs(area(points)) <= tolerance * tolerance) {
        fail("degenerate-geometry", "Opening has no area");
    }

    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        if (a.distanceTo(b) <= tolerance) {
            fail("degenerate-geometry", "Opening has a collapsed edge");
        }
        for (let j = i + 1; j < points.length; j++) {
            if (j === i + 1 || i === 0 && j === points.length - 1) continue;
            if (intersects(
                a, b, points[j]!, points[(j + 1) % points.length]!,
                tolerance
            )) fail("unsupported-topology", "Opening intersects itself");
        }
    }

    if (!points.every(point =>
        inside(point, loops[0]!.uv, tolerance) &&
        loops.slice(1).every(hole => !inside(point, hole.uv, tolerance))
    ) || loops.some(loop => loopEdges(points, loop.uv, tolerance)) ||
        loops.slice(1).some(hole =>
            inside(hole.uv[0]!, points, tolerance))) {
        fail("unsupported-topology", "Opening must be strictly inside the patch footprint");
    }

    return area(points) < 0 ? points : points.reverse();
}

function boundaries(
    source: GeometryResult,
    patch: SurfacePatchRef
): Loop[] {
    const mesh = source.geometry;
    const uses = new Map<string, [number, number][]>();
    const read = (ref: FaceRef): Face => ref.kind === "quad"
        ? mesh.quads[ref.index]! : mesh.triangles![ref.index]!;

    for (const ref of patch.faces) {
        const corners = read(ref).corners;
        for (let i = 0; i < corners.length; i++) {
            const a = corners[i]!;
            const b = corners[(i + 1) % corners.length]!;
            const id = edgeKey(a, b);
            const entries = uses.get(id) ?? [];
            entries.push([a, b]);
            uses.set(id, entries);
        }
    }

    const forward = new Map<number, number>();
    const backwards = new Set<number>();
    for (const edges of uses.values()) {
        if (edges.length === 2) {
            if (edges[0]![0] !== edges[1]![1] ||
                edges[0]![1] !== edges[1]![0]) {
                fail("invalid-topology", "Patch has incompatible internal edges");
            }
            continue;
        }
        if (edges.length !== 1) {
            fail("invalid-topology", "Patch contains a nonmanifold edge");
        }
        const [a, b] = edges[0]!;
        if (forward.has(a) || backwards.has(b)) {
            fail("unsupported-topology", "Patch boundary has an ambiguous junction");
        }
        forward.set(a, b);
        backwards.add(b);
    }
    if (!forward.size || [...forward.keys()].some(id => !backwards.has(id))) {
        fail("unsupported-topology", "Patch boundary must be closed");
    }

    const result: Loop[] = [];
    while (forward.size) {
        const first = forward.keys().next().value as number;
        const ids: number[] = [];
        let current = first;
        do {
            const next = forward.get(current);
            if (next === undefined) fail("invalid-topology", "Unclosed patch boundary");
            ids.push(current);
            forward.delete(current);
            current = next;
        } while (current !== first);

        if (ids.length < 3) fail("degenerate-geometry", "Collapsed patch loop");
        result.push({
            ids,
            uv: ids.map(id => {
                const point = patch.chart.parameterOf(mesh.vertices[id]!);
                if (!point || ![point.x, point.y].every(Number.isFinite)) {
                    fail("invalid-input", "Invalid patch chart inverse");
                }
                return new THREE.Vector2(point.x, point.y);
            })
        });
    }

    const outer = result.filter(loop => area(loop.uv) > 0);
    const holes = result.filter(loop => area(loop.uv) < 0);
    if (outer.length !== 1 || holes.some(hole =>
        !inside(hole.uv[0]!, outer[0]!.uv, 0)
    )) {
        fail("unsupported-topology", "Expected one connected, oriented patch footprint");
    }
    return [outer[0]!, ...holes];
}

function validateChart(
    source: GeometryResult,
    patch: SurfacePatchRef,
    loops: readonly Loop[],
    outline: readonly THREE.Vector2[],
    tolerance: number
): THREE.Vector3 {
    const uv = outline[0]!;
    const direction = patch.chart.normalAt(uv);
    if (!direction || ![direction.x, direction.y, direction.z]
        .every(Number.isFinite)) {
        fail("invalid-input", "Invalid patch normal");
    }
    const normal = new THREE.Vector3().copy(direction);
    if (!(normal.length() > tolerance)) {
        fail("invalid-input", "Invalid patch normal");
    }

    // A charted edit must represent every selected source vertex, not
    // merely its perimeter. Curvature is allowed, chart folds are not.
    const chartPoints = [
        ...Array.from(new Set(patch.faces.flatMap(ref => {
            const face = ref.kind === "quad"
                ? source.geometry.quads[ref.index]!
                : source.geometry.triangles![ref.index]!;
            return face.corners;
        }))).map(id => patch.chart.parameterOf(source.geometry.vertices[id]!)),
        ...loops.flatMap(loop => loop.uv),
        ...outline,
        ...outline.map((from, i) => from.clone()
            .lerp(outline[(i + 1) % outline.length]!, 0.5))
    ];
    for (const parameter of chartPoints) {
        if (!parameter || ![parameter.x, parameter.y].every(Number.isFinite)) {
            fail("unsupported-topology", "Patch chart has no finite inverse");
        }
        const point = patch.chart.at(parameter);
        const inverse = point && patch.chart.parameterOf(point);
        const directionAt = patch.chart.normalAt(parameter);
        if (!point || !inverse || !directionAt ||
            ![point.x, point.y, point.z, inverse.x, inverse.y,
                directionAt.x, directionAt.y, directionAt.z].every(Number.isFinite) ||
            new THREE.Vector2(inverse.x, inverse.y)
                .distanceTo(new THREE.Vector2(parameter.x, parameter.y)) > tolerance ||
            new THREE.Vector3().copy(directionAt).length() <= tolerance) {
            fail("unsupported-topology", "Patch chart is not regular at the opening");
        }
    }
    return normal.normalize();
}

function sampled(
    points: readonly THREE.Vector2[],
    chart: SurfacePatchRef["chart"]
): {points: THREE.Vector2[]; parameters: number[]} {
    const positions = points.map(point => chart.at(point));
    const distances = [0];
    for (let i = 0; i < points.length; i++) {
        distances.push(distances.at(-1)! + new THREE.Vector3()
            .copy(positions[i]!).distanceTo(positions[(i + 1) % points.length]!));
    }
    const total = distances.at(-1)!;
    if (!(total > 0) || !Number.isFinite(total)) {
        fail("degenerate-geometry", "Collapsed sampled patch boundary");
    }
    return {
        points: points.map(point => point.clone()),
        parameters: distances.slice(0, -1).map(value => value / total)
    };
}

function uvMap(
    source: GeometryResult,
    patch: SurfacePatchRef,
    tolerance: number
): (point: THREE.Vector2) => THREE.Vector2 {
    const uvCorners = patch.faces.flatMap(ref => {
        const face = ref.kind === "quad"
            ? source.geometry.quads[ref.index]!
            : source.geometry.triangles![ref.index]!;
        return face.corners.map((id, i) => ({
            chart: new THREE.Vector2().copy(
                patch.chart.parameterOf(source.geometry.vertices[id]!)
            ),
            uv: face.uvs[i]!
        }));
    });
    // Every authored face has a nondegenerate first triangle. One face
    // determines the affine UV basis; all other corners must obey it.
    const [a, b, c] = uvCorners;
    if (!a || !b || !c ||
        Math.abs(cross(a.chart, b.chart, c.chart)) <=
            tolerance * tolerance) {
        fail("degenerate-geometry", "Cannot project patch UVs");
    }
    const base = new THREE.Triangle(
        new THREE.Vector3(a!.chart.x, a!.chart.y, 0),
        new THREE.Vector3(b!.chart.x, b!.chart.y, 0),
        new THREE.Vector3(c!.chart.x, c!.chart.y, 0)
    );
    const evaluate = (point: THREE.Vector2): THREE.Vector2 => {
        const weights = base.getBarycoord(
            new THREE.Vector3(point.x, point.y, 0),
            new THREE.Vector3()
        );
        if (!weights) fail("degenerate-geometry", "Patch UV basis collapsed");
        return a!.uv.clone().multiplyScalar(weights.x)
            .addScaledVector(b!.uv, weights.y)
            .addScaledVector(c!.uv, weights.z);
    };
    const uvTolerance = Math.max(1e-6, tolerance * 16);
    if (uvCorners.some(corner =>
        evaluate(corner.chart).distanceTo(corner.uv) > uvTolerance)) {
        fail("unsupported-topology", "Patch has UV seams or nonlinear mapping");
    }
    return evaluate;
}

function edited(
    source: GeometryResult,
    patch: SurfacePatchRef,
    outline: Contour2,
    recess: RecessOptions | undefined,
    precision?: GeometryPrecision
): GeometryResult {
    const policy = resolvePrecision(precision);
    assertSelectionOwner(source, patch);
    if (!patchChartMatches(source, patch, policy)) {
        fail("invalid-input", "Patch selection or chart is not valid");
    }
    const selected = new Set(patch.faces.map(faceKey));
    if (selected.size !== patch.faces.length) {
        fail("invalid-input", "Patch contains repeated faces");
    }
    const selectedFaces = patch.faces.map(ref => ref.kind === "quad"
        ? source.geometry.quads[ref.index]!
        : source.geometry.triangles![ref.index]!);
    const regions = new Set(selectedFaces.map(face => face.surface));
    const smoothing = new Set(selectedFaces.map(face => face.smoothingGroup));
    if (regions.size !== 1 || smoothing.size !== 1) {
        fail("unsupported-topology", "Patch needs a single consistent material and smoothing policy");
    }

    topologyOf(source).openBoundaries();
    const loops = boundaries(source, patch);
    const bounds = new THREE.Box2().setFromPoints(loops.flatMap(loop => loop.uv))
        .getSize(new THREE.Vector2()).length();
    const tolerance = lengthTolerance(policy, bounds);
    const opening = validateOutline(outline, loops, tolerance);
    const normal = validateChart(source, patch, loops, opening, tolerance);
    const mapUv = uvMap(source, patch, tolerance);
    const original = source.geometry;
    const vertices = original.vertices.map(v => v.clone());
    const newIds = opening.map(uv => vertices.push(
        new THREE.Vector3().copy(patch.chart.at(uv))
    ) - 1);

    // Both open and recessed patches share one charted roof construction.
    // The fill operation owns adaptive interior refinement while preserving
    // every prescribed outer, old-hole and new-opening boundary station.
    const oriented = [
        ...loops.map(loop => ({
            ids: [...loop.ids].reverse(),
            uv: [...loop.uv].reverse()
        })),
        {ids: [...newIds].reverse(), uv: [...opening].reverse()}
    ];
    const profile = {
        outer: sampled(oriented[0]!.uv, patch.chart),
        holes: oriented.slice(1).map(loop => sampled(loop.uv, patch.chart))
    };
    const rebuilt = fillSurfacePatch({
        profile, chart: patch.chart, region: selectedFaces[0]!.surface,
        maxDeviation: 0.005, precision: policy
    });
    const mapped = oriented.flatMap(loop => loop.ids);
    for (let i = mapped.length; i < rebuilt.geometry.vertices.length; i++) {
        mapped.push(vertices.push(rebuilt.geometry.vertices[i]!.clone()) - 1);
    }

    const quads: QuadFace[] = [];
    const faces: TriangleFace[] = [];
    const quadMap = new Map<number, number>();
    const triangleMap = new Map<number, number>();

    original.quads.forEach((face, i) => {
        if (!selected.has(faceKey({kind: "quad", index: i}))) {
            quadMap.set(i, quads.push(face) - 1);
        }
    });
    (original.triangles ?? []).forEach((face, i) => {
        if (!selected.has(faceKey({kind: "triangle", index: i}))) {
            triangleMap.set(i, faces.push(face) - 1);
        }
    });
    const roofStart = faces.length;
    const mainRegion = selectedFaces[0]!.surface;
    const smooth = selectedFaces[0]!.smoothingGroup;
    for (const face of rebuilt.geometry.triangles ?? []) {
        const corners = face.corners.map(id => mapped[id]!)
            as TriangleFace["corners"];
        faces.push({
            corners,
            uvs: face.corners.map(id => mapUv(
                new THREE.Vector2().copy(patch.chart.parameterOf(
                    rebuilt.geometry.vertices[id]!
                ))
            )) as TriangleFace["uvs"],
            surface: mainRegion,
            ...(smooth === undefined ? {} : {smoothingGroup: smooth})
        });
    }
    const roofCount = faces.length - roofStart;
    let floorIds: number[] = [];
    let floorStart = -1;
    let floorCount = 0;

    if (recess) {
        const {depth, wallRegion, floorRegion} = recess;
        if (!Number.isFinite(depth) || depth <= tolerance ||
            !wallRegion?.trim() || !floorRegion?.trim()) {
            fail("invalid-input", "Recess requires positive depth and wall/floor regions");
        }

        const outside: MeshData = {
            vertices: original.vertices,
            quads,
            triangles: faces.slice(0, roofStart)
        };
        const samples = [
            ...opening,
            ...opening.map((a, i) => a.clone()
                .lerp(opening[(i + 1) % opening.length]!, 0.5)),
            ...triangulateProfile([opening], policy).map(triangle =>
                triangle.reduce((sum, i) => sum.add(opening[i]!),
                    new THREE.Vector2()).divideScalar(3))
        ];
        for (const uv of samples) {
            const point = new THREE.Vector3().copy(patch.chart.at(uv))
                .addScaledVector(normal, -tolerance * 4);
            const hit = raycastSurface({
                geometry: outside, localToWorld: new THREE.Matrix4()
            }, {
                origin: point,
                direction: normal.clone().negate(),
                maxDistance: depth
            }, policy);
            if (hit && hit.distance <= depth - tolerance * 2) {
                fail("unsupported-topology", "Recess breaks through another surface");
            }
        }

        floorIds = newIds.map(id => vertices.push(vertices[id]!.clone()
            .addScaledVector(normal, -depth)) - 1);
        const length = opening.length;
        for (let i = 0; i < length; i++) {
            const next = (i + 1) % length;
            const a = newIds[i]!;
            const b = newIds[next]!;
            const c = floorIds[i]!;
            const d = floorIds[next]!;
            const distance = vertices[a]!.distanceTo(vertices[b]!);
            quads.push({
                corners: [b, a, c, d],
                uvs: [
                    new THREE.Vector2(distance, 0),
                    new THREE.Vector2(0, 0),
                    new THREE.Vector2(0, depth),
                    new THREE.Vector2(distance, depth)
                ],
                surface: wallRegion
            });
        }
        floorStart = faces.length;
        for (const triangle of triangulateProfile([opening], policy)) {
            const corners = triangle.map(i => floorIds[i]!)
                as TriangleFace["corners"];
            faces.push({
                corners,
                uvs: triangle.map(i => opening[i]!.clone())
                    as TriangleFace["uvs"],
                surface: floorRegion
            });
        }
        floorCount = faces.length - floorStart;
    }

    const result = geometryResult({vertices, quads, triangles: faces}, policy);
    topologyOf(result).openBoundaries();

    const names: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(source.boundaries)) {
        const surviving = refs.flatMap(ref =>
            transferBoundary(source, result, ref, id => id)
        );
        if (surviving.length) names[name] = surviving;
    }
    (names.opening ??= []).push({
        owner: result.id, closed: true, vertices: [...newIds]
    });
    if (recess) {
        (names["floor-rim"] ??= []).push({
            owner: result.id, closed: true, vertices: [...floorIds]
        });
    }

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(source.patches ?? {})) {
        for (const ref of refs) {
            assertSelectionOwner(source, ref);
            if (ref === patch || ref.faces.some(face => selected.has(faceKey(face)))) {
                continue;
            }
            const mapped = ref.faces.map(face => ({
                kind: face.kind,
                index: (face.kind === "quad"
                    ? quadMap.get(face.index) : triangleMap.get(face.index))!
            }));
            if (mapped.some(face => face.index === undefined)) continue;
            const candidate: SurfacePatchRef = {
                owner: result.id, faces: mapped, chart: ref.chart
            };
            if (patchChartMatches(result, candidate, policy)) {
                (patches[name] ??= []).push(candidate);
            }
        }
    }

    const patchName = Object.entries(source.patches ?? {})
        .find(([, refs]) => refs.includes(patch))?.[0] ?? mainRegion;
    const replacement: SurfacePatchRef = {
        owner: result.id,
        faces: Array.from({length: roofCount}, (_, i) => ({
            kind: "triangle" as const, index: roofStart + i
        })),
        chart: patch.chart
    };
    if (!patchChartMatches(result, replacement, policy)) {
        fail("invalid-topology", "Rebuilt surface lost its chart");
    }
    (patches[patchName] ??= []).push(replacement);

    if (recess) {
        const floorChart = {
            at: (uv: THREE.Vector2Like) =>
                new THREE.Vector3().copy(patch.chart.at(uv))
                    .addScaledVector(normal, -recess.depth),
            parameterOf: (point: THREE.Vector3Like) =>
                patch.chart.parameterOf(
                    new THREE.Vector3().copy(point)
                        .addScaledVector(normal, recess.depth)
                ),
            normalAt: () => normal.clone()
        };
        const floor: SurfacePatchRef = {
            owner: result.id,
            faces: Array.from({length: floorCount}, (_, i) => ({
                kind: "triangle" as const, index: floorStart + i
            })),
            chart: floorChart
        };
        if (!patchChartMatches(result, floor, policy)) {
            fail("invalid-topology", "Recess floor lost its chart");
        }
        (patches[recess.floorRegion] ??= []).push(floor);
    }

    return {...result, boundaries: names, patches};
}

/** Remove a charted planar surface contour and expose its real edge rim. */
export function openPatch(
    source: GeometryResult,
    patch: SurfacePatchRef,
    outline: Contour2,
    precision?: GeometryPrecision
): GeometryResult {
    return edited(source, patch, outline, undefined, precision);
}

/** Rebuild the surface around a pocket with actual walls and a closed floor. */
export function recessPatch(
    source: GeometryResult,
    patch: SurfacePatchRef,
    outline: Contour2,
    options: RecessOptions
): GeometryResult {
    return edited(source, patch, outline, options, options?.precision);
}
