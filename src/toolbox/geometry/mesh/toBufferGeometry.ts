import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "./MeshData";

type Face = QuadFace | TriangleFace;

const QUAD_TRIANGLES = [
    [0, 1, 2],
    [0, 2, 3]
] as const;

const controlMeshes = new WeakMap<THREE.BufferGeometry, MeshData>();
const controlVertexIds = new WeakMap<THREE.BufferGeometry, readonly number[]>();

/** GPU vertex to original construction vertex, including UV/normal splits. */
export function getControlVertexIds(
    geometry: THREE.BufferGeometry
): readonly number[] | undefined {
    return controlVertexIds.get(geometry);
}

export function getControlMesh(
    geometry: THREE.BufferGeometry
): MeshData | undefined {
    return controlMeshes.get(geometry);
}

/**
 * Render authored quads and genuine triangles with the same UV, material
 * and smoothing rules. A triangle from a mismatched loft cap remains a
 * triangle in the control mesh; no fake degenerates are introduced.
 */
export function toBufferGeometry(
    mesh: MeshData,
    materialBySurface: Readonly<Record<string, number>>
): THREE.BufferGeometry {
    const byMaterial = new Map<number, Face[]>();
    const smoothNormals = new Map<string, Map<number, THREE.Vector3>>();

    for (const face of [...mesh.quads, ...(mesh.triangles ?? [])]) {
        const materialIndex = materialBySurface[face.surface];
        if (
            typeof materialIndex !== "number" ||
            !Number.isInteger(materialIndex) ||
            materialIndex < 0
        ) {
            throw new RangeError(`Invalid material for surface ${face.surface}`);
        }

        for (const index of face.corners) {
            const vertex = mesh.vertices[index];
            if (
                !Number.isInteger(index) ||
                !vertex ||
                ![vertex.x, vertex.y, vertex.z].every(Number.isFinite)
            ) {
                throw new RangeError("Invalid mesh vertex");
            }
        }

        for (const uv of face.uvs) {
            if (!Number.isFinite(uv.x) || !Number.isFinite(uv.y)) {
                throw new RangeError("Invalid mesh UV");
            }
        }

        const [ia, ib, ic] = face.corners;
        const a = mesh.vertices[ia]!;
        const b = mesh.vertices[ib]!;
        const c = mesh.vertices[ic]!;
        const normal = new THREE.Vector3()
            .subVectors(b, a)
            .cross(new THREE.Vector3().subVectors(c, a));

        if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() === 0) {
            throw new RangeError("Degenerate mesh face");
        }

        if (face.corners.length === 4) {
            const d = mesh.vertices[face.corners[3]]!;
            const second = new THREE.Vector3()
                .subVectors(c, a)
                .cross(new THREE.Vector3().subVectors(d, a));

            if (!Number.isFinite(second.lengthSq()) || second.lengthSq() === 0) {
                throw new RangeError("Degenerate mesh quad");
            }
            normal.add(second);
        }

        if (face.smoothingGroup !== undefined) {
            if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() === 0) {
                throw new RangeError("Invalid face normal");
            }

            let accumulated = smoothNormals.get(face.smoothingGroup);
            if (!accumulated) {
                accumulated = new Map();
                smoothNormals.set(face.smoothingGroup, accumulated);
            }

            for (const index of face.corners) {
                const previous = accumulated.get(index);
                if (previous) previous.add(normal);
                else accumulated.set(index, normal.clone());
            }
        }

        let surfaces = byMaterial.get(materialIndex);
        if (!surfaces) {
            surfaces = [];
            byMaterial.set(materialIndex, surfaces);
        }
        surfaces.push(face);
    }

    for (const accumulated of smoothNormals.values()) {
        for (const normal of accumulated.values()) {
            if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() === 0) {
                throw new RangeError("Cannot calculate smooth normal");
            }
            normal.normalize();
        }
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const sourceVertexIds: number[] = [];
    const indices: number[] = [];
    const vertexCache = new Map<string, number>();
    const geometry = new THREE.BufferGeometry();

    for (const [materialIndex, faces] of byMaterial) {
        const start = indices.length;

        for (const face of faces) {
            const tris: readonly (readonly [number, number, number])[] =
                face.corners.length === 4 ? QUAD_TRIANGLES : [[0, 1, 2]];

            for (const triangle of tris) {
                const [i0, i1, i2] = triangle;
                const a = mesh.vertices[face.corners[i0]!]!;
                const b = mesh.vertices[face.corners[i1]!]!;
                const c = mesh.vertices[face.corners[i2]!]!;

                const flatNormal = new THREE.Vector3()
                    .subVectors(b, a)
                    .cross(new THREE.Vector3().subVectors(c, a))
                    .normalize();

                for (const corner of triangle) {
                    const vertexIndex = face.corners[corner]!;
                    const vertex = mesh.vertices[vertexIndex]!;
                    const uv = face.uvs[corner]!;
                    const smoothing = face.smoothingGroup;
                    const normal = smoothing === undefined
                        ? flatNormal
                        : smoothNormals.get(smoothing)!.get(vertexIndex)!;

                    // Smooth vertices may be shared only if all authored
                    // vertex identities, materials, groups and UVs agree.
                    const key = smoothing === undefined
                        ? null
                        : JSON.stringify([
                            materialIndex, smoothing, vertexIndex, uv.x, uv.y
                        ]);

                    let index = key === null ? undefined : vertexCache.get(key);
                    if (index === undefined) {
                        index = positions.length / 3;
                        positions.push(vertex.x, vertex.y, vertex.z);
                        normals.push(normal.x, normal.y, normal.z);
                        uvs.push(uv.x, uv.y);
                        sourceVertexIds.push(vertexIndex);
                        if (key !== null) vertexCache.set(key, index);
                    }
                    indices.push(index);
                }
            }
        }

        geometry.addGroup(start, indices.length - start, materialIndex);
    }

    geometry.setAttribute(
        "position", new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
        "normal", new THREE.Float32BufferAttribute(normals, 3)
    );
    geometry.setAttribute(
        "uv", new THREE.Float32BufferAttribute(uvs, 2)
    );
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    controlMeshes.set(geometry, mesh);
    controlVertexIds.set(geometry, sourceVertexIds);
    return geometry;
}
