import * as THREE from "three";
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
import { triangulateAuthoredFaces } from "../kernel/triangulation";

export interface GeometryJoinOptions {
    weld: readonly {
        firstPart: number;
        first: BoundaryRef;
        secondPart: number;
        second: BoundaryRef;
    }[];
    precision?: GeometryPrecision;
}

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "degenerate-geometry" | "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("joinGeometry", reason, message);
}

function edgeKey(a: number, b: number): string {
    return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

function faceEdges(corners: readonly number[]): [number, number][] {
    return corners.map((from, i) => [
        from, corners[(i + 1) % corners.length]!
    ]);
}

function selectedEdges(boundary: BoundaryRef): [number, number][] {
    const ids = boundary.vertices;

    return ids.slice(0, boundary.closed ? ids.length : -1)
        .map((from, i) => [from, ids[(i + 1) % ids.length]!] as [number, number]);
}

function validateBoundary(
    source: GeometryResult,
    boundary: BoundaryRef
): Map<string, { from: number; to: number }> {
    assertSelectionOwner(source, boundary);
    const ids = boundary.vertices;

    if (
        typeof boundary.closed !== "boolean" ||
        ids.length < (boundary.closed ? 3 : 2) ||
        new Set(ids).size !== ids.length ||
        ids.some(id =>
            !Number.isInteger(id) ||
            id < 0 || id >= source.geometry.vertices.length
        )
    ) {
        fail("invalid-input", "Weld requires a valid ordered boundary chain");
    }

    const topo = topologyOf(source);
    const edges = new Map<string, { from: number; to: number }>();

    for (const [from, to] of selectedEdges(boundary)) {
        const uses = topo.edgeUses(from, to);

        if (uses.length !== 1) {
            fail("invalid-topology", "Weld selection contains a non-open edge");
        }

        edges.set(edgeKey(from, to), {
            from: uses[0]!.from,
            to: uses[0]!.to
        });
    }

    // A selection is one coherent run of the actual mesh boundary,
    // not a set of unrelated open edges with an arbitrary ordering.
    if (!topo.openBoundaries().some(rim => {
        const rimEdges = new Set(selectedEdges(rim)
            .map(([a, b]) => edgeKey(a, b)));
        return selectedEdges(boundary).every(([a, b]) =>
            rimEdges.has(edgeKey(a, b))
        );
    })) {
        fail("invalid-topology", "Weld selection is not one open boundary chain");
    }

    return edges;
}

class WeldGroups {
    readonly parent: number[];
    private readonly parts: Map<number, Set<number>>;

    constructor(readonly owners: readonly number[]) {
        this.parent = owners.map((_, i) => i);
        this.parts = new Map(owners.map((owner, i) => [i, new Set([owner])]));
    }

    find(index: number): number {
        let root = index;
        while (this.parent[root] !== root) root = this.parent[root]!;
        while (this.parent[index] !== index) {
            const next = this.parent[index]!;
            this.parent[index] = root;
            index = next;
        }
        return root;
    }

    join(first: number, second: number): void {
        const a = this.find(first);
        const b = this.find(second);

        if (a === b) return;

        // Distinct vertices already belonging to the same input part
        // cannot become one vertex through a cycle of other welds.
        const firstParts = this.parts.get(a)!;
        const secondParts = this.parts.get(b)!;

        for (const owner of secondParts) {
            if (firstParts.has(owner)) {
                fail("invalid-topology", "Weld cycle identifies distinct vertices of one part");
            }
        }

        this.parent[b] = a;
        for (const owner of secondParts) firstParts.add(owner);
        this.parts.delete(b);
    }
}

function validateFans(mesh: MeshData): void {
    const edges = new Map<string, { from: number; to: number; face: number }[]>();
    const incident = new Map<number, Set<number>>();
    let faceIndex = 0;

    for (const face of [...mesh.quads, ...(mesh.triangles ?? [])]) {
        for (const id of face.corners) {
            const uses = incident.get(id) ?? new Set<number>();
            uses.add(faceIndex);
            incident.set(id, uses);
        }

        for (const [from, to] of faceEdges(face.corners)) {
            const id = edgeKey(from, to);
            const uses = edges.get(id) ?? [];
            uses.push({ from, to, face: faceIndex });
            edges.set(id, uses);
        }

        faceIndex++;
    }

    const adjacency = new Map<number, Map<number, Set<number>>>();
    const boundaryCounts = new Map<number, number>();

    for (const uses of edges.values()) {
        if (
            uses.length > 2 ||
            (uses.length === 2 &&
                (uses[0]!.from !== uses[1]!.to ||
                    uses[0]!.to !== uses[1]!.from))
        ) {
            fail("invalid-topology", "Nonmanifold or inconsistently oriented joined edge");
        }

        if (uses.length === 1) {
            for (const id of [uses[0]!.from, uses[0]!.to]) {
                boundaryCounts.set(id, (boundaryCounts.get(id) ?? 0) + 1);
            }
            continue;
        }

        for (const id of [uses[0]!.from, uses[0]!.to]) {
            const neighbors = adjacency.get(id) ?? new Map<number, Set<number>>();
            for (const use of uses) {
                const peers = neighbors.get(use.face) ?? new Set<number>();
                peers.add(uses.find(other => other.face !== use.face)!.face);
                neighbors.set(use.face, peers);
            }
            adjacency.set(id, neighbors);
        }
    }

    for (const [id, faces] of incident) {
        const boundaryCount = boundaryCounts.get(id) ?? 0;

        if (boundaryCount !== 0 && boundaryCount !== 2) {
            fail("invalid-topology", "Nonmanifold vertex boundary fan");
        }

        const neighbors = adjacency.get(id) ?? new Map();
        const visited = new Set<number>();
        const pending = [faces.values().next().value as number];

        while (pending.length) {
            const face = pending.pop()!;
            if (visited.has(face)) continue;
            visited.add(face);
            for (const adjacent of neighbors.get(face) ?? []) {
                if (!visited.has(adjacent)) pending.push(adjacent);
            }
        }

        if (visited.size !== faces.size) {
            fail("invalid-topology", "Disconnected face fans share a joined vertex");
        }
    }
}

/**
 * Combine authored parts and weld only explicitly paired open edges.
 * All face-corner UVs, regions and distinct construction faces survive.
 * Named consumed rims are dropped; all other named chains are reissued
 * with the new owner and namespaced by part index when names collide.
 */
export function joinGeometry(
    parts: readonly GeometryResult[],
    options: GeometryJoinOptions
): GeometryResult {
    const policy = resolvePrecision(options?.precision);

    if (
        !Array.isArray(parts) || parts.length < 2 ||
        !Array.isArray(options?.weld) ||
        parts.some(part => !part?.geometry || !part.id) ||
        new Set(parts.map(part => part.id)).size !== parts.length
    ) {
        fail("invalid-input", "Join requires distinct authored parts and weld declarations");
    }

    const vertexOffsets: number[] = [];
    const quadOffsets: number[] = [];
    const triangleOffsets: number[] = [];
    const positions: THREE.Vector3[] = [];
    const owners: number[] = [];
    let q = 0;
    let t = 0;

    for (let part = 0; part < parts.length; part++) {
        const source = parts[part]!;
        vertexOffsets.push(positions.length);
        quadOffsets.push(q);
        triangleOffsets.push(t);
        q += source.geometry.quads.length;
        t += source.geometry.triangles?.length ?? 0;

        topologyOf(source).openBoundaries();

        for (const vertex of source.geometry.vertices) {
            positions.push(vertex.clone());
            owners.push(part);
        }
    }

    const extent = new THREE.Box3().setFromPoints(positions)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);
    const union = new WeldGroups(owners);
    const consumed = new Map<number, Set<string>>();
    const declared = new Map<string, number>();

    for (const pair of options.weld) {
        const { firstPart, secondPart, first, second } = pair;

        if (
            !Number.isInteger(firstPart) || !Number.isInteger(secondPart) ||
            firstPart < 0 || secondPart < 0 ||
            firstPart >= parts.length || secondPart >= parts.length ||
            firstPart === secondPart
        ) {
            fail("invalid-input", "Weld must identify two different source parts");
        }

        const sourceA = parts[firstPart]!;
        const sourceB = parts[secondPart]!;
        const edgesA = validateBoundary(sourceA, first);
        const edgesB = validateBoundary(sourceB, second);

        if (
            first.closed !== second.closed ||
            first.vertices.length !== second.vertices.length
        ) {
            fail("invalid-input", "Weld boundaries have incompatible sample counts");
        }

        const firstIds = first.vertices;
        const secondIds = second.vertices;
        const candidates: number[][] = [];

        // A periodic seam is allowed to have a different start index.
        // Every candidate must still use an actual vertex, not a newly
        // projected/interpolated point.
        for (let offset = 0; offset < secondIds.length; offset++) {
            const mapping = firstIds.map(id =>
                secondIds[(offset + secondIds.length -
                    firstIds.indexOf(id)) % secondIds.length]!
            );

            if (!first.closed && offset !== secondIds.length - 1) continue;

            if (mapping.every((partner, i) => {
                const a = positions[vertexOffsets[firstPart]! + firstIds[i]!]!;
                const b = positions[vertexOffsets[secondPart]! + partner]!;
                return a.distanceTo(b) <= tolerance;
            })) {
                candidates.push(mapping);
            }
        }

        if (candidates.length !== 1) {
            fail(
                candidates.length ? "unsupported-topology" : "invalid-input",
                "Weld requires one unambiguous reversed geometric correspondence"
            );
        }

        const matched = candidates[0]!;
        const mapped = new Map(firstIds.map((id, i) => [id, matched[i]!]));

        for (const [a, b] of selectedEdges(first)) {
            const c = mapped.get(a)!;
            const d = mapped.get(b)!;
            const left = edgesA.get(edgeKey(a, b));
            const right = edgesB.get(edgeKey(c, d));

            if (!left || !right) {
                fail("invalid-topology", "Mapped weld boundary lacks matching edges");
            }

            // Opposite directed uses after mapping are required for a
            // manifold seam, independent of each selection's own order.
            const aTo = mapped.get(left!.from)!;
            const bTo = mapped.get(left!.to)!;
            if (right!.from !== bTo || right!.to !== aTo) {
                fail("invalid-topology", "Welded edge uses have the same winding");
            }

            for (const [part, from, to] of [
                [firstPart, a, b],
                [secondPart, c, d]
            ]) {
                const id = `${part}:${edgeKey(from, to)}`;
                if (declared.has(id)) {
                    fail("invalid-topology", "An open edge is welded more than once");
                }
                declared.set(id, 1);
                const used = consumed.get(part) ?? new Set<string>();
                used.add(edgeKey(from, to));
                consumed.set(part, used);
            }
        }

        for (let i = 0; i < firstIds.length; i++) {
            const a = vertexOffsets[firstPart]! + firstIds[i]!;
            const b = vertexOffsets[secondPart]! + matched[i]!;
            union.join(a, b);
        }
    }

    // All transitive matches must agree with one single physical
    // position. Otherwise a chain of near matches can accumulate drift.
    const members = new Map<number, number[]>();

    positions.forEach((_, id) => {
        const root = union.find(id);
        const group = members.get(root) ?? [];
        group.push(id);
        members.set(root, group);
    });

    for (const group of members.values()) {
        for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
                if (positions[group[i]!]!.distanceTo(positions[group[j]!]!) >
                    tolerance) {
                    fail("invalid-topology", "Weld cycle has inconsistent vertex positions");
                }
            }
        }
    }

    const map = Array<number>(positions.length);
    const vertices: THREE.Vector3[] = [];
    const roots = new Map<number, number>();

    positions.forEach((point, id) => {
        const root = union.find(id);
        let mapped = roots.get(root);

        if (mapped === undefined) {
            mapped = vertices.length;
            vertices.push(positions[root]!.clone());
            roots.set(root, mapped);
        }

        map[id] = mapped;
    });

    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    const remap = (part: number, face: QuadFace | TriangleFace) =>
        face.corners.map(id => map[vertexOffsets[part]! + id]!) as number[];

    for (let part = 0; part < parts.length; part++) {
        const source = parts[part]!.geometry;

        for (const face of source.quads) {
            quads.push({
                ...face,
                corners: remap(part, face) as QuadFace["corners"]
            });
        }

        for (const face of source.triangles ?? []) {
            triangles.push({
                ...face,
                corners: remap(part, face) as TriangleFace["corners"]
            });
        }
    }

    const mesh: MeshData = { vertices, quads, triangles };

    // Detect duplicated coincident authored triangle surfaces even when
    // parts deliberately avoided declaring their overlapping rims.
    const duplicate = new Set<string>();
    const origin = vertices[0] ?? new THREE.Vector3();
    const pointKey = (point: THREE.Vector3): string => [
        point.x - origin.x, point.y - origin.y, point.z - origin.z
    ].map(value => Math.round(value / tolerance)).join(":");

    for (const triangle of triangulateAuthoredFaces(mesh)) {
        const id = triangle.vertices.map(index =>
            pointKey(vertices[index]!)
        ).sort().join("|");

        if (duplicate.has(id)) {
            fail("invalid-topology", "Duplicate coincident authored faces");
        }
        duplicate.add(id);
    }

    let result: GeometryResult;

    try {
        result = geometryResult(mesh, policy);
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                "joinGeometry", error.reason, error.message, error.context
            );
        }
        throw error;
    }

    validateFans(result.geometry);
    topologyOf(result).openBoundaries();

    const nameCounts = new Map<string, number>();

    for (const source of parts) {
        for (const name of Object.keys(source.boundaries)) {
            nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
        }
    }

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);

    for (let part = 0; part < parts.length; part++) {
        const source = parts[part]!;
        const used = consumed.get(part) ?? new Set<string>();
        const remapId = (id: number) => map[vertexOffsets[part]! + id]!;

        for (const [name, chains] of Object.entries(source.boundaries)) {
            const survivors = chains.filter(chain => {
                assertSelectionOwner(source, chain);

                return selectedEdges(chain).every(([a, b]) =>
                    !used.has(edgeKey(a, b))
                );
            });

            if (!survivors.length) continue;
            const key = (nameCounts.get(name) ?? 0) > 1
                ? `${part}:${name}` : name;

            boundaries[key] = survivors.map(chain => ({
                owner: result.id,
                vertices: chain.vertices.map(remapId),
                closed: chain.closed
            }));
        }

        for (const [name, selections] of Object.entries(source.patches ?? {})) {
            const key = `${part}:${name}`;

            for (const patch of selections) {
                assertSelectionOwner(source, patch);

                const faces: FaceRef[] = patch.faces.map(face => ({
                    kind: face.kind,
                    index: face.index + (face.kind === "quad"
                        ? quadOffsets[part]! : triangleOffsets[part]!)
                }));

                // A moved welded corner invalidates the chart's exact
                // mapping. Such a patch must be rebuilt by its caller.
                const moved = patch.faces.some(face => {
                    const authored = face.kind === "quad"
                        ? source.geometry.quads[face.index]
                        : source.geometry.triangles?.[face.index];

                    if (!authored) fail("invalid-input", "Patch references missing source face");

                    return authored.corners.some(id =>
                        !positions[vertexOffsets[part]! + id]!.equals(
                            vertices[remapId(id)]!
                        )
                    );
                });

                if (!moved) {
                    (patches[key] ??= []).push({
                        owner: result.id,
                        faces,
                        chart: patch.chart
                    });
                }
            }
        }
    }

    return {
        ...result,
        boundaries,
        ...(Object.keys(patches).length ? { patches } : {})
    };
}
