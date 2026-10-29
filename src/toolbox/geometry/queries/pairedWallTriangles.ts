import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import {
    GeometryOperationError,
    type FaceRef
} from "../kernel/GeometryResult";

export interface PairedWallFace {
    corners: readonly number[];
    reference: FaceRef;
}

function invalid(reason: "invalid-input" | "unsupported-topology",
    message: string, index: number): never {
    throw new GeometryOperationError(
        "cavitySectionsFromSurfaces", reason, message,
        { face: { kind: "triangle", index } }
    );
}

/**
 * Recover a planar longitudinal cell from two triangle faces only when
 * each has exactly one matching diagonal partner. Adjacent triangles
 * with ambiguous shared vertical edges are deliberately rejected.
 */
export function pairedWallTriangles(
    mesh: MeshData,
    indices: readonly number[],
    vertices: readonly THREE.Vector3[],
    offset: number,
    tolerance: number
): PairedWallFace[] {
    const triangles = mesh.triangles ?? [];
    const candidates = new Map<number, { partner: number; ring: number[] }[]>();

    for (const index of indices) {
        const face = triangles[index];
        if (!face || face.corners.length !== 3 ||
            face.corners.some(vertex =>
                !Number.isInteger(vertex) ||
                vertex < 0 || vertex >= mesh.vertices.length)) {
            invalid("invalid-input", "Invalid inner-wall triangle", index);
        }
    }

    for (let i = 0; i < indices.length; i++) {
        const ia = indices[i]!;
        const a = triangles[ia]!;
        for (let j = i + 1; j < indices.length; j++) {
            const ib = indices[j]!;
            const b = triangles[ib]!;
            const common = a.corners.filter(id => b.corners.includes(id));
            const ids = [...new Set([...a.corners, ...b.corners])];

            if (common.length !== 2 || ids.length !== 4 ||
                Math.abs(vertices[offset + common[0]!]!.y -
                    vertices[offset + common[1]!]!.y) <= tolerance) {
                continue;
            }

            const rows = ids.map(id => vertices[offset + id]!.y);
            const bottom = Math.min(...rows);
            const top = Math.max(...rows);
            if (top - bottom <= tolerance ||
                rows.filter(y => Math.abs(y - bottom) <= tolerance).length !== 2 ||
                rows.filter(y => Math.abs(y - top) <= tolerance).length !== 2) {
                continue;
            }

            const point = (id: number): THREE.Vector3 =>
                vertices[offset + id]!;
            const normal = (face: typeof a): THREE.Vector3 =>
                new THREE.Vector3()
                    .subVectors(point(face.corners[1]!), point(face.corners[0]!))
                    .cross(new THREE.Vector3().subVectors(
                        point(face.corners[2]!), point(face.corners[0]!)
                    ));
            const na = normal(a);
            const nb = normal(b);
            if (
                na.length() <= tolerance * tolerance ||
                nb.length() <= tolerance * tolerance ||
                na.dot(nb) < (1 - 1e-7) * na.length() * nb.length()
            ) continue;

            const edges = new Map<string, {
                corners: readonly [number, number];
                count: number;
            }>();
            for (const face of [a, b]) {
                for (let edge = 0; edge < 3; edge++) {
                    const first = face.corners[edge]!;
                    const last = face.corners[(edge + 1) % 3]!;
                    const key = [first, last].sort((x, y) => x - y).join(":");
                    const previous = edges.get(key);
                    if (previous) previous.count++;
                    else edges.set(key, { corners: [first, last], count: 1 });
                }
            }

            const boundary = [...edges.values()]
                .filter(edge => edge.count === 1)
                .map(edge => edge.corners);
            if (boundary.length !== 4) continue;

            const graph = new Map<number, number[]>();
            for (const [first, last] of boundary) {
                (graph.get(first) ?? graph.set(first, [])
                    .get(first)!).push(last);
                (graph.get(last) ?? graph.set(last, [])
                    .get(last)!).push(first);
            }
            if (graph.size !== 4 ||
                [...graph.values()].some(neighbors => neighbors.length !== 2)) {
                continue;
            }

            const ring = [ids[0]!];
            let previous = -1;
            let current = ring[0]!;
            for (let step = 0; step < 3; step++) {
                const next = graph.get(current)!.find(id => id !== previous);
                if (next === undefined || ring.includes(next)) break;
                ring.push(next);
                previous = current;
                current = next;
            }
            if (ring.length !== 4 ||
                !graph.get(ring[3]!)!.includes(ring[0]!)) {
                continue;
            }

            const add = (index: number, partner: number): void => {
                (candidates.get(index) ?? candidates.set(index, [])
                    .get(index)!).push({ partner, ring });
            };
            add(ia, ib);
            add(ib, ia);
        }
    }

    const used = new Set<number>();
    const result: PairedWallFace[] = [];

    for (const index of indices) {
        if (used.has(index)) continue;
        const matches = candidates.get(index) ?? [];
        if (matches.length !== 1 ||
            candidates.get(matches[0]!.partner)?.length !== 1) {
            invalid("unsupported-topology",
                "Wall triangles have missing or ambiguous diagonal provenance",
                index);
        }
        const match = matches[0]!;
        used.add(index);
        used.add(match.partner);
        result.push({
            corners: match.ring,
            reference: { kind: "triangle", index }
        });
    }
    return result;
}
