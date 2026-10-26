import * as THREE from "three";
import { getControlMesh, getControlVertexIds } from "../mesh/toBufferGeometry";

export type VertexDeformer = (
    position: THREE.Vector3,
    index: number
) => void;

/**
 * Deform a construction-backed render mesh without losing its topology.
 *
 * Each authored vertex is displaced ONCE. Every GPU duplicate at material,
 * UV or hard-normal boundaries then follows its common source vertex.
 * Native BufferGeometry without authored topology remains supported.
 */
export function warpGeometry<T extends THREE.BufferGeometry>(
    geometry: T,
    deform: VertexDeformer
): T {
    const positions = geometry.getAttribute("position");

    if (!positions || positions.itemSize !== 3) {
        throw new Error("Geometry requires 3D positions");
    }

    const mesh = getControlMesh(geometry);
    const mapping = getControlVertexIds(geometry);
    if (mesh !== undefined && mapping !== undefined) {
        if (mapping.length !== positions.count) {
            throw new Error("Geometry no longer matches its control vertices");
        }

        const displaced = mesh.vertices.map((original, index) => {
            const point = original.clone();
            deform(point, index);
            if (![point.x, point.y, point.z].every(Number.isFinite)) {
                throw new RangeError("Deformation produced invalid coordinates");
            }
            return point;
        });

        for (let i = 0; i < displaced.length; i++) {
            mesh.vertices[i]!.copy(displaced[i]!);
        }
        for (let i = 0; i < mapping.length; i++) {
            const point = displaced[mapping[i]!]!;
            positions.setXYZ(i, point.x, point.y, point.z);
        }
    } else {
        // Legacy third-party geometry: preserve the original behavior.
        const point = new THREE.Vector3();
        const displaced: THREE.Vector3[] = [];

        for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i);
            deform(point, i);
            if (![point.x, point.y, point.z].every(Number.isFinite)) {
                throw new RangeError("Deformation produced invalid coordinates");
            }
            displaced.push(point.clone());
        }
        for (let i = 0; i < displaced.length; i++) {
            const updated = displaced[i]!;
            positions.setXYZ(i, updated.x, updated.y, updated.z);
        }
    }

    if (positions instanceof THREE.InterleavedBufferAttribute) {
        positions.data.needsUpdate = true;
    } else {
        positions.needsUpdate = true;
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
}
