import * as THREE from "three";
import type { MeshData } from "./MeshData";

export function toBufferGeometry(
    mesh: MeshData,
    materialBySurface: Readonly<Record<string, number>>
): THREE.BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];

    const geometry = new THREE.BufferGeometry();

    const triangleCorners = [0, 1, 2, 0, 2, 3] as const;

    for (const quad of mesh.quads) {
        const materialIndex = materialBySurface[quad.surface];

        if (materialIndex === undefined) {
            throw new Error(
                `No material assigned to surface ${quad.surface}`
            );
        }

        const start = positions.length / 3;

        for (const corner of triangleCorners) {
            const vertex = mesh.vertices[quad.corners[corner]];
            const uv = quad.uvs[corner];

            if (!vertex) {
                throw new Error("Invalid mesh vertex index");
            }

            positions.push(
                vertex.x,
                vertex.y,
                vertex.z
            );

            uvs.push(uv.x, uv.y);
        }

        geometry.addGroup(start, 6, materialIndex);
    }

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(uvs, 2)
    );

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
}
