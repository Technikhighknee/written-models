import * as THREE from "three";

import type { QuadFace, TriangleFace } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    geometryResult,
    GeometryOperationError,
    type BoundaryRef,
    type EdgeRef,
    type FaceRef,
    type GeometryResult,
    type SurfacePatchRef
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    triangleQuality,
    type GeometryPrecision
} from "../kernel/precision";
import { patchChartMatches } from "../kernel/selectionLifecycle";
import { topologyOf } from "../kernel/topology";
import { triangulateProfile } from "../build/triangulateProfile";

export interface EdgeSubdivision {
    edge: EdgeRef;
    /** Strictly inside (0, 1), measured from edge.from toward edge.to. */
    t: number;
}

type Face = QuadFace | TriangleFace;

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "unsupported-topology" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("subdivideEdges", reason, message);
}

function key(a: number, b: number): string {
    return Math.min(a, b) + ":" + Math.max(a, b);
}

interface EdgeStations {
    from: number;
    to: number;
    station: {t: number; id: number}[];
}

/**
 * Split exact authored edges, propagating each station to every incident
 * face. A vertex is allocated once per undirected edge/parameter;
 * material and UV seams remain independent face-corner attributes.
 *
 * Changed faces become the minimum required real triangles. Untouched
 * authored quads and triangles are left as-is. Planar convex quads and
 * triangles are supported; splitting warped/concave quads is deliberately
 * rejected rather than creating a false planar or folded fan.
 */
export function subdivideEdges(
    source: GeometryResult,
    splits: readonly EdgeSubdivision[],
    precision?: GeometryPrecision
): GeometryResult {
    const policy = resolvePrecision(precision);
    if (!source?.geometry || !Array.isArray(splits) || !splits.length) {
        fail("invalid-input", "Expected a source and nonempty edge stations");
    }
    const topology = topologyOf(source);
    topology.openBoundaries();

    const vertices = source.geometry.vertices.map(p => p.clone());
    const extent = new THREE.Box3().setFromPoints(vertices)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);
    const pending = new Map<string, {from: number; to: number; stations: number[]}>();

    for (const {edge, t} of splits) {
        if (!edge || !Number.isFinite(t) || t <= 0 || t >= 1 ||
            !Number.isInteger(edge.from) || !Number.isInteger(edge.to) ||
            edge.from === edge.to || edge.from < 0 || edge.to < 0 ||
            edge.from >= vertices.length || edge.to >= vertices.length) {
            fail("invalid-input", "Invalid subdivision edge or station");
        }
        assertSelectionOwner(source, edge);
        const uses = topology.edgeUses(edge.from, edge.to);
        if (uses.length < 1 || uses.length > 2) {
            fail("invalid-topology", "Subdivision edge must exist and be manifold");
        }
        const from = Math.min(edge.from, edge.to);
        const to = Math.max(edge.from, edge.to);
        const normalized = edge.from === from ? t : 1 - t;
        const id = key(from, to);
        const record = pending.get(id) ?? {from, to, stations: []};
        record.stations.push(normalized);
        pending.set(id, record);
    }

    const stations = new Map<string, EdgeStations>();
    for (const [id, record] of pending) {
        const length = vertices[record.from]!.distanceTo(
            vertices[record.to]!
        );
        if (length <= tolerance) {
            fail("degenerate-geometry", "Subdivision edge is collapsed");
        }
        const unique = record.stations.sort((a, b) => a - b);
        if (unique.some((t, index) =>
            Math.min(t, 1 - t) * length <= tolerance ||
            index > 0 && (t - unique[index - 1]!) * length <= tolerance
        )) {
            fail("degenerate-geometry", "Subdivision creates coincident stations");
        }
        stations.set(id, {
            from: record.from,
            to: record.to,
            station: unique.map(t => ({
                t, id: vertices.push(vertices[record.from]!.clone().lerp(
                    vertices[record.to]!, t
                )) - 1
            }))
        });
    }

    function edgeStations(a: number, b: number): EdgeStations["station"] {
        const entry = stations.get(key(a, b));
        if (!entry) return [];
        return entry.from === a
            ? entry.station
            : entry.station.slice().reverse().map(value => ({
                id: value.id, t: 1 - value.t
            }));
    }

    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    const rewritten = new Map<string, FaceRef[]>();

    function emit(face: Face, original: FaceRef): void {
        const perimeter: {id: number; uv: THREE.Vector2}[] = [];
        let affected = false;
        for (let i = 0; i < face.corners.length; i++) {
            const a = face.corners[i]!;
            const b = face.corners[(i + 1) % face.corners.length]!;
            const uvA = face.uvs[i]!;
            const uvB = face.uvs[(i + 1) % face.uvs.length]!;
            perimeter.push({id: a, uv: uvA.clone()});
            for (const station of edgeStations(a, b)) {
                affected = true;
                perimeter.push({
                    id: station.id,
                    uv: uvA.clone().lerp(uvB, station.t)
                });
            }
        }
        const refs: FaceRef[] = [];
        if (!affected) {
            if (face.corners.length === 4) {
                refs.push({kind: "quad", index: quads.push({
                    surface: face.surface,
                    ...(face.smoothingGroup === undefined ? {} :
                        {smoothingGroup: face.smoothingGroup}),
                    corners: [...face.corners] as QuadFace["corners"],
                    uvs: face.uvs.map(uv => uv.clone()) as QuadFace["uvs"]
                }) - 1});
            } else {
                refs.push({kind: "triangle", index: triangles.push({
                    surface: face.surface,
                    ...(face.smoothingGroup === undefined ? {} :
                        {smoothingGroup: face.smoothingGroup}),
                    corners: [...face.corners] as TriangleFace["corners"],
                    uvs: face.uvs.map(uv => uv.clone()) as TriangleFace["uvs"]
                }) - 1});
            }
            rewritten.set(original.kind + ":" + original.index, refs);
            return;
        }

        const a = vertices[face.corners[0]!]!;
        const b = vertices[face.corners[1]!]!;
        const c = vertices[face.corners[2]!]!;
        const normal = new THREE.Vector3().subVectors(b, a)
            .cross(new THREE.Vector3().subVectors(c, a));
        if (face.corners.length === 4) {
            const diagonal = Math.sqrt(normal.lengthSq());
            const d = vertices[face.corners[3]!]!;
            if (Math.abs(d.clone().sub(a).dot(normal)) >
                tolerance * diagonal) {
                fail("unsupported-topology", "Warped quad needs explicit surface reconstruction");
            }
        }
        for (let i = 0; i < face.corners.length; i++) {
            const prev = vertices[face.corners[
                (i + face.corners.length - 1) % face.corners.length
            ]!]!;
            const current = vertices[face.corners[i]!]!;
            const next = vertices[face.corners[
                (i + 1) % face.corners.length
            ]!]!;
            if (new THREE.Vector3().subVectors(next, current)
                .cross(new THREE.Vector3().subVectors(prev, current))
                .dot(normal) <= 0) {
                fail("unsupported-topology", "Subdivided face needs a convex planar footprint");
            }
        }

        // Triangulate the exact subdivided boundary, retaining the
        // shared stations without inserting a synthetic face center.
        // A split triangle thus needs two triangles; a split quad
        // needs three, regardless of material UV discontinuities.
        const x = b.clone().sub(a).normalize();
        const z = normal.clone().normalize();
        const y = z.clone().cross(x);
        const flat = perimeter.map(entry => {
            const offset = vertices[entry.id]!.clone().sub(a);
            return new THREE.Vector2(offset.dot(x), offset.dot(y));
        });
        for (const triangle of triangulateProfile([flat], policy)) {
            const indices = [...triangle];
            const ids = indices.map(i => perimeter[i]!.id);
            const orientation = vertices[ids[1]!]!.clone()
                .sub(vertices[ids[0]!]!)
                .cross(vertices[ids[2]!]!.clone().sub(vertices[ids[0]!]!));
            if (orientation.dot(normal) < 0) {
                indices.reverse();
                ids.reverse();
            }
            if (!triangleQuality(
                vertices[ids[0]!]!, vertices[ids[1]!]!,
                vertices[ids[2]!]!, policy
            )) fail("degenerate-geometry", "Subdivision produced a collapsed triangle");
            refs.push({kind: "triangle", index: triangles.push({
                corners: ids as TriangleFace["corners"],
                uvs: indices.map(i => perimeter[i]!.uv.clone()) as
                    TriangleFace["uvs"],
                surface: face.surface,
                ...(face.smoothingGroup === undefined ? {} :
                    {smoothingGroup: face.smoothingGroup})
            }) - 1});
        }
        rewritten.set(original.kind + ":" + original.index, refs);
    }

    source.geometry.quads.forEach((face, index) =>
        emit(face, {kind: "quad", index})
    );
    (source.geometry.triangles ?? []).forEach((face, index) =>
        emit(face, {kind: "triangle", index})
    );
    const output = geometryResult({vertices, quads, triangles}, policy);
    topologyOf(output).openBoundaries();

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    function updated(chain: BoundaryRef): BoundaryRef {
        assertSelectionOwner(source, chain);
        const ids = chain.vertices;
        if (!Array.isArray(ids) ||
            ids.length < (chain.closed ? 3 : 2)) {
            fail("invalid-input", "Invalid selected edge chain");
        }
        const extended: number[] = [];
        const edgeCount = chain.closed ? ids.length : ids.length - 1;
        for (let i = 0; i < edgeCount; i++) {
            const a = ids[i]!;
            const b = ids[(i + 1) % ids.length]!;
            if (!topology.edgeUses(a, b).length) {
                fail("invalid-topology", "Named boundary references a missing edge");
            }
            extended.push(a, ...edgeStations(a, b).map(v => v.id));
        }
        if (!chain.closed) extended.push(ids.at(-1)!);
        if (new Set(extended).size !== extended.length) {
            fail("invalid-topology", "Named boundary has repeated vertices");
        }
        for (let i = 0; i < extended.length - (chain.closed ? 0 : 1); i++) {
            if (!topologyOf(output).edgeUses(
                extended[i]!, extended[(i + 1) % extended.length]!
            ).length) fail("invalid-topology", "Named boundary lost a subdivided edge");
        }
        return {owner: output.id, closed: chain.closed, vertices: extended};
    }
    for (const [name, chains] of Object.entries(source.boundaries)) {
        boundaries[name] = chains.map(updated);
    }
    boundaries.subdivided = [...stations.values()].map(item => ({
        owner: output.id,
        closed: false,
        vertices: [item.from, ...item.station.map(s => s.id), item.to]
    }));

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, list] of Object.entries(source.patches ?? {})) {
        for (const patch of list) {
            assertSelectionOwner(source, patch);
            const replacement: FaceRef[] = [];
            for (const face of patch.faces) {
                const refs = rewritten.get(face.kind + ":" + face.index);
                if (!refs) fail("invalid-input", "Named patch references an unknown face");
                replacement.push(...refs);
            }
            const candidate: SurfacePatchRef = {
                owner: output.id, chart: patch.chart, faces: replacement
            };
            if (patchChartMatches(output, candidate, policy)) {
                (patches[name] ??= []).push(candidate);
            }
        }
    }
    return {
        ...output, boundaries,
        ...(Object.keys(patches).length ? {patches} : {})
    };
}
