
import * as THREE from "three";
import type { MeshData, QuadFace } from "./MeshData";

const TRIANGLES = [
    [0, 1, 2],
    [0, 2, 3]
] as const;

export function toBufferGeometry(
    mesh: MeshData,
    materialBySurface: Readonly<Record<string, number>>
): THREE.BufferGeometry {
    const byMaterial = new Map<number, QuadFace[]>();

    const smoothNormals = new Map<
        string,
        Map<number, THREE.Vector3>
    >();

    // First pass: validate quads and calculate smooth normals.
    for (const quad of mesh.quads) {
        const materialIndex = materialBySurface[quad.surface];

        if (
            typeof materialIndex !== "number" ||
            !Number.isInteger(materialIndex) ||
            materialIndex < 0
        ) {
            throw new RangeError(
                `Invalid material for surface ${quad.surface}`
            );
        }

        for (const index of quad.corners) {
            const vertex = mesh.vertices[index];

            if (
                !Number.isInteger(index) ||
                !vertex ||
                ![vertex.x, vertex.y, vertex.z]
                    .every(Number.isFinite)
            ) {
                throw new RangeError("Invalid mesh vertex");
            }
        }

        for (const uv of quad.uvs) {
            if (
                !Number.isFinite(uv.x) ||
                !Number.isFinite(uv.y)
            ) {
                throw new RangeError("Invalid mesh UV");
            }
        }

        const [ia, ib, ic, id] = quad.corners;

        const a = mesh.vertices[ia]!;
        const b = mesh.vertices[ib]!;
        const c = mesh.vertices[ic]!;
        const d = mesh.vertices[id]!;

        const ab = new THREE.Vector3().subVectors(b, a);
        const ac = new THREE.Vector3().subVectors(c, a);
        const ad = new THREE.Vector3().subVectors(d, a);

        const first = new THREE.Vector3()
            .crossVectors(ab, ac);

        const second = new THREE.Vector3()
            .crossVectors(ac, ad);

        if (
            !Number.isFinite(first.lengthSq()) ||
            !Number.isFinite(second.lengthSq()) ||
            first.lengthSq() === 0 ||
            second.lengthSq() === 0
        ) {
            throw new RangeError("Degenerate mesh quad");
        }

        const group = quad.smoothingGroup;

        if (group !== undefined) {
            // Both triangles contribute one area-weighted
            // normal for the original quad.
            const normal = first.add(second);

            if (
                !Number.isFinite(normal.lengthSq()) ||
                normal.lengthSq() === 0
            ) {
                throw new RangeError("Invalid quad normal");
            }

            let accumulated = smoothNormals.get(group);

            if (!accumulated) {
                accumulated = new Map();
                smoothNormals.set(group, accumulated);
            }

            for (const index of quad.corners) {
                const existing = accumulated.get(index);

                if (existing) {
                    existing.add(normal);
                } else {
                    accumulated.set(index, normal.clone());
                }
            }
        }

        let faces = byMaterial.get(materialIndex);

        if (!faces) {
            faces = [];
            byMaterial.set(materialIndex, faces);
        }

        faces.push(quad);
    }

    // Normalize after all adjacent quads contributed.
    for (const group of smoothNormals.values()) {
        for (const normal of group.values()) {
            if (
                !Number.isFinite(normal.lengthSq()) ||
                normal.lengthSq() === 0
            ) {
                throw new RangeError(
                    "Cannot calculate smooth normal"
                );
            }

            normal.normalize();
        }
    }

    // Second pass: build the render mesh.
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const vertexCache = new Map<string, number>();
    const geometry = new THREE.BufferGeometry();

    for (const [materialIndex, quads] of byMaterial) {
        const start = indices.length;

        for (const quad of quads) {
            for (const triangle of TRIANGLES) {
                const [i0, i1, i2] = triangle;

                const a = mesh.vertices[quad.corners[i0]]!;
                const b = mesh.vertices[quad.corners[i1]]!;
                const c = mesh.vertices[quad.corners[i2]]!;

                const flatNormal = new THREE.Vector3()
                    .subVectors(b, a)
                    .cross(
                        new THREE.Vector3().subVectors(c, a)
                    )
                    .normalize();

                for (const corner of triangle) {
                    const vertexIndex = quad.corners[corner];
                    const vertex = mesh.vertices[vertexIndex]!;
                    const uv = quad.uvs[corner];

                    const group = quad.smoothingGroup;

                    const normal = group === undefined
                        ? flatNormal
                        : smoothNormals.get(group)!.get(vertexIndex)!;

                    // Different UVs, materials or smoothing
                    // groups require separate render vertices.
                    const key = group === undefined
                        ? null
                        : JSON.stringify([
                            materialIndex,
                            group,
                            vertexIndex,
                            uv.x,
                            uv.y
                        ]);

                    let index = key === null
                        ? undefined
                        : vertexCache.get(key);

                    if (index === undefined) {
                        index = positions.length / 3;

                        positions.push(
                            vertex.x,
                            vertex.y,
                            vertex.z
                        );

                        normals.push(
                            normal.x,
                            normal.y,
                            normal.z
                        );

                        uvs.push(uv.x, uv.y);

                        if (key !== null) {
                            vertexCache.set(key, index);
                        }
                    }

                    indices.push(index);
                }
            }
        }

        geometry.addGroup(
            start,
            indices.length - start,
            materialIndex
        );
    }

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(normals, 3)
    );

    geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(uvs, 2)
    );

    geometry.setIndex(indices);

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
}
