import * as THREE from "three";

import type { QuadFace, TriangleFace } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    geometryResult,
    GeometryOperationError,
    type FaceRef,
    type GeometryResult,
    type SurfacePatchRef
} from "../kernel/GeometryResult";
import { transferBoundary, patchChartMatches } from "../kernel/selectionLifecycle";
import { topologyOf } from "../kernel/topology";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

/** Only a selected region or an owned, charted patch is reconstructed. */
export type QuadReconstructionSelection = string | SurfacePatchRef;

export interface QuadReconstructionOptions {
    precision?: GeometryPrecision;
    /** Reject any selected triangles which cannot be paired into quads. */
    requireComplete?: boolean;
}

interface QuadCandidate {
    first: number;
    second: number;
    corners: QuadFace["corners"];
    uvs: QuadFace["uvs"];
    surface: string;
    smoothingGroup?: string;
    quality: number;
}

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "unsupported-topology" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("reconstructPatchQuads", reason, message);
}

function faceKey(ref: FaceRef): string {
    return ref.kind + ":" + ref.index;
}

function cornerUV(face: TriangleFace, id: number): THREE.Vector2 {
    const index = face.corners.indexOf(id);
    if (index === -1) fail("invalid-topology", "Triangle does not contain the shared vertex");
    return face.uvs[index]!;
}

function candidate(
    firstId: number,
    secondId: number,
    source: GeometryResult,
    tolerance: number,
    angleTolerance: number
): QuadCandidate | undefined {
    const first = source.geometry.triangles![firstId]!;
    const second = source.geometry.triangles![secondId]!;
    if (first.surface !== second.surface ||
        first.smoothingGroup !== second.smoothingGroup) return undefined;

    const shared = first.corners.filter(id => second.corners.includes(id));
    if (shared.length !== 2) return undefined;

    // Follow the first triangle's winding along its shared diagonal.
    const sharedEdge = Array.from({length: 3}, (_, i) =>
        [first.corners[i]!, first.corners[(i + 1) % 3]!]
    ).find(([a, b]) => shared.includes(a!) && shared.includes(b!));
    if (!sharedEdge) return undefined;
    const [a, c] = sharedEdge;
    const oppositeFirst = first.corners.find(id => id !== a && id !== c);
    const oppositeSecond = second.corners.find(id => id !== a && id !== c);
    if (oppositeFirst === undefined || oppositeSecond === undefined) {
        return undefined;
    }

    // The other triangle must traverse the same geometric edge in the
    // opposite direction. A winding mismatch is not a candidate.
    const reversed = Array.from({length: 3}, (_, i) =>
        second.corners[i] === c &&
        second.corners[(i + 1) % 3] === a
    ).some(Boolean);
    if (!reversed) return undefined;

    // Face-corner UVs are not topological vertices. Joining a UV seam
    // would discard one side's coordinates, even if positions coincide.
    const uvValues = [...first.uvs, ...second.uvs];
    const uvExtent = Math.max(1, ...uvValues.map(uv =>
        Math.max(Math.abs(uv.x), Math.abs(uv.y))
    ));
    const uvTolerance = Math.max(1e-7, tolerance * 0.01,
        uvExtent * 1e-7);
    if (cornerUV(first, a!).distanceTo(cornerUV(second, a!)) >
            uvTolerance ||
        cornerUV(first, c!).distanceTo(cornerUV(second, c!)) >
            uvTolerance) return undefined;

    // Quad triangles are (0,1,2) + (0,2,3). Their original diagonal
    // becomes 0 -> 2, retaining both input triangles *exactly*.
    const corners = [a!, oppositeSecond, c!, oppositeFirst] as
        QuadFace["corners"];
    const points = corners.map(id => source.geometry.vertices[id]!);
    const normal = points[1]!.clone().sub(points[0]!)
        .cross(points[2]!.clone().sub(points[0]!));
    const area = normal.length();
    if (!(area > 0)) return undefined;
    normal.divideScalar(area);

    if (points.some(point => Math.abs(point.clone().sub(points[0]!)
        .dot(normal)) > tolerance)) return undefined;

    const edges = points.map((point, i) =>
        points[(i + 1) % 4]!.clone().sub(point)
    );
    const lengths = edges.map(edge => edge.length());
    if (lengths.some(length => !(length > tolerance))) return undefined;

    const cornerSines: number[] = [];
    for (let i = 0; i < 4; i++) {
        const turn = edges[i]!.clone().cross(edges[(i + 1) % 4]!)
            .dot(normal);
        const sin = turn / (
            lengths[i]! * lengths[(i + 1) % 4]!
        );
        if (!(sin > Math.sin(angleTolerance))) return undefined;
        cornerSines.push(sin);
    }
    // High-quality, near-rectangular and similarly sized pairs take
    // precedence. Selection remains deterministic across runs.
    const quality = Math.min(...cornerSines) *
        (Math.min(...lengths) / Math.max(...lengths));

    return {
        first: firstId,
        second: secondId,
        corners,
        uvs: [
            cornerUV(first, a!).clone(),
            cornerUV(second, oppositeSecond).clone(),
            cornerUV(first, c!).clone(),
            cornerUV(first, oppositeFirst).clone()
        ],
        surface: first.surface,
        ...(first.smoothingGroup === undefined ? {} :
            {smoothingGroup: first.smoothingGroup}),
        quality
    };
}

/**
 * Recover genuinely authored quads by pairing selected coplanar
 * triangles across their original diagonal. The new quad uses exactly
 * the original two rendering triangles, UV corners and construction
 * vertices: no approximation, silent welding, or invented grid.
 *
 * The operation is a scoped local topology edit, not automatic quad
 * retopology. Unpaired triangles remain actual authored triangles,
 * unless requireComplete requests an explicitly complete patch.
 * Existing named boundaries and charted patches are reissued only
 * where they remain meaningful.
 */
export function reconstructPatchQuads(
    source: GeometryResult,
    selection: QuadReconstructionSelection,
    options: QuadReconstructionOptions = {}
): GeometryResult {
    if (!source?.geometry || !Array.isArray(source.geometry.triangles) ||
        !selection || typeof options !== "object" || !options) {
        fail("invalid-input", "Expected an owned source, selection and options");
    }
    const policy = resolvePrecision(options.precision);
    if (options.requireComplete !== undefined &&
        typeof options.requireComplete !== "boolean") {
        fail("invalid-input", "requireComplete must be a boolean");
    }
    const topology = topologyOf(source);
    const priorOpen = topology.openBoundaries().length;
    const priorConnected = topology.connectedComponents().length;

    let selected: readonly FaceRef[];
    if (typeof selection === "string") {
        if (!selection.trim() || !source.regions[selection]?.length) {
            fail("invalid-input", "Unknown or empty selected surface region");
        }
        selected = source.regions[selection]!;
    } else {
        assertSelectionOwner(source, selection);
        if (!Array.isArray(selection.faces) ||
            !selection.faces.length || !selection.chart ||
            !patchChartMatches(source, selection, policy)) {
            fail("invalid-input", "Selected charted patch is not valid on the source");
        }
        selected = selection.faces;
    }

    const picked = new Set<number>();
    for (const ref of selected) {
        if (ref.kind === "quad") {
            if (!source.geometry.quads[ref.index]) {
                fail("invalid-input", "Selected quad is missing");
            }
        } else if (ref.kind === "triangle") {
            if (!source.geometry.triangles[ref.index] ||
                picked.has(ref.index)) {
                fail("invalid-input", "Selected triangle is missing or repeated");
            }
            picked.add(ref.index);
        } else {
            fail("invalid-input", "Unknown selected face kind");
        }
    }
    if (picked.size < 2) {
        fail("unsupported-topology", "Selection has fewer than two triangles");
    }

    const vertices = source.geometry.vertices;
    const extent = new THREE.Box3().setFromPoints(vertices)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);

    const pairs: QuadCandidate[] = [];
    const encountered = new Set<string>();
    for (const id of picked) {
        const face = source.geometry.triangles[id]!;
        for (let i = 0; i < 3; i++) {
            const a = face.corners[i]!;
            const b = face.corners[(i + 1) % 3]!;
            for (const use of topology.edgeUses(a, b)) {
                if (use.face.kind !== "triangle" ||
                    use.face.index === id || !picked.has(use.face.index)) {
                    continue;
                }
                const other = use.face.index;
                const canonical = Math.min(id, other) + ":" +
                    Math.max(id, other);
                if (encountered.has(canonical)) continue;
                encountered.add(canonical);
                const available = candidate(id, other, source,
                    tolerance, policy.angle);
                if (available) pairs.push(available);
            }
        }
    }
    pairs.sort((a, b) =>
        b.quality - a.quality ||
        a.first - b.first ||
        a.second - b.second
    );

    const assigned = new Set<number>();
    const chosen: QuadCandidate[] = [];
    for (const pair of pairs) {
        if (assigned.has(pair.first) || assigned.has(pair.second)) continue;
        assigned.add(pair.first);
        assigned.add(pair.second);
        chosen.push(pair);
    }
    if (!chosen.length) {
        fail("unsupported-topology", "No planar convex, UV-compatible triangle pairs");
    }
    if (options.requireComplete && assigned.size !== picked.size) {
        fail("unsupported-topology", "Selected triangles cannot all become valid quads");
    }

    const quads: QuadFace[] = source.geometry.quads.map(face => ({
        corners: [...face.corners] as QuadFace["corners"],
        uvs: face.uvs.map(uv => uv.clone()) as QuadFace["uvs"],
        surface: face.surface,
        ...(face.smoothingGroup === undefined ? {} :
            {smoothingGroup: face.smoothingGroup})
    }));
    const mapped = new Map<string, FaceRef[]>();
    source.geometry.quads.forEach((_, index) =>
        mapped.set("quad:" + index, [{kind: "quad", index}])
    );

    for (const pair of chosen) {
        const ref: FaceRef = {kind: "quad", index: quads.push({
            corners: [...pair.corners],
            uvs: pair.uvs.map(uv => uv.clone()) as QuadFace["uvs"],
            surface: pair.surface,
            ...(pair.smoothingGroup === undefined ? {} :
                {smoothingGroup: pair.smoothingGroup})
        }) - 1};
        mapped.set("triangle:" + pair.first, [ref]);
        mapped.set("triangle:" + pair.second, [ref]);
    }

    const triangles: TriangleFace[] = [];
    source.geometry.triangles.forEach((face, index) => {
        if (assigned.has(index)) return;
        const ref: FaceRef = {kind: "triangle", index: triangles.push({
            corners: [...face.corners] as TriangleFace["corners"],
            uvs: face.uvs.map(uv => uv.clone()) as TriangleFace["uvs"],
            surface: face.surface,
            ...(face.smoothingGroup === undefined ? {} :
                {smoothingGroup: face.smoothingGroup})
        }) - 1};
        mapped.set("triangle:" + index, [ref]);
    });

    const result = geometryResult({vertices, quads, triangles}, policy);
    const nextTopology = topologyOf(result);
    if (nextTopology.openBoundaries().length !== priorOpen ||
        nextTopology.connectedComponents().length !== priorConnected) {
        fail("invalid-topology", "Quad reconstruction changed mesh connectivity");
    }

    const boundaries: Record<string, ReturnType<typeof transferBoundary>> =
        Object.create(null);
    for (const [name, refs] of Object.entries(source.boundaries)) {
        const survivors = refs.flatMap(ref =>
            transferBoundary(source, result, ref, id => id)
        );
        if (survivors.length) boundaries[name] = survivors;
    }

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, selections] of Object.entries(source.patches ?? {})) {
        for (const patch of selections) {
            assertSelectionOwner(source, patch);
            const refs = new Map<string, FaceRef>();
            for (const face of patch.faces) {
                for (const mappedFace of mapped.get(faceKey(face)) ?? []) {
                    refs.set(faceKey(mappedFace), mappedFace);
                }
            }
            const candidatePatch: SurfacePatchRef = {
                owner: result.id,
                chart: patch.chart,
                faces: [...refs.values()]
            };
            if (patchChartMatches(result, candidatePatch, policy)) {
                (patches[name] ??= []).push(candidatePatch);
            }
        }
    }
    return {
        ...result, boundaries,
        ...(Object.keys(patches).length ? {patches} : {})
    };
}
