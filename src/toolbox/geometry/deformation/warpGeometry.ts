import * as THREE from "three";

export type VertexDeformer = (
    position: THREE.Vector3,
    index: number
) => void;

export function warpGeometry<T extends THREE.BufferGeometry>(
    geometry: T,
    deform: VertexDeformer
): T {
    const positions = geometry.getAttribute("position");

    if (!positions || positions.itemSize !== 3) {
        throw new Error("Geometry requires 3D positions");
    }

    const point = new THREE.Vector3();
    const transformed = new Float32Array(positions.count * 3);

    for (let i = 0; i < positions.count; i++) {
        point.set(
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i)
        );

        deform(point, i);

        if (
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            !Number.isFinite(point.z)
        ) {
            throw new RangeError("Deformation produced invalid coordinates");
        }

        const offset = i * 3;

        transformed[offset] = point.x;
        transformed[offset + 1] = point.y;
        transformed[offset + 2] = point.z;
    }

    for (let i = 0; i < positions.count; i++) {
        const offset = i * 3;

        positions.setXYZ(
            i,
            transformed[offset]!,
            transformed[offset + 1]!,
            transformed[offset + 2]!
        );
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
