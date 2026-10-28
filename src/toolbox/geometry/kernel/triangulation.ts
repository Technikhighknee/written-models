import type { MeshData } from "../mesh/MeshData";
import type { FaceRef } from "./GeometryResult";

export interface AuthoredTriangle {
    /** Construction-vertex IDs, never render-vertex IDs. */
    readonly vertices: readonly [number, number, number];
    readonly face: FaceRef;
    /** Indices into the original face's corner and UV arrays. */
    readonly faceCorners: readonly [number, number, number];
}

const FIRST = [0, 1, 2] as const;
const SECOND = [0, 2, 3] as const;

/** The single triangulation policy used by rendering and geometric queries. */
export function triangulateAuthoredFaces(mesh: MeshData): AuthoredTriangle[] {
    const triangles: AuthoredTriangle[] = [];

    function append(
        corners: readonly number[],
        face: FaceRef,
        local: readonly [number, number, number]
    ): void {
        triangles.push({
            vertices: [
                corners[local[0]]!,
                corners[local[1]]!,
                corners[local[2]]!
            ],
            face: { ...face },
            faceCorners: [...local]
        });
    }

    mesh.quads.forEach((quad, index) => {
        const face: FaceRef = { kind: "quad", index };
        append(quad.corners, face, FIRST);
        append(quad.corners, face, SECOND);
    });
    (mesh.triangles ?? []).forEach((triangle, index) => {
        append(triangle.corners, { kind: "triangle", index }, FIRST);
    });

    return triangles;
}
