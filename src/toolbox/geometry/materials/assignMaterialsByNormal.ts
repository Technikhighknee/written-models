import * as THREE from "three";

// Normal classification uses geometry-local coordinates, not world space.
// Callers must account for mesh transforms when choosing the reference axes.

export type MaterialResolver = (normal: THREE.Vector3) => number;

export function assignMaterialsByNormal<T extends THREE.BufferGeometry>(
    geometry: T,
    resolveMaterial: MaterialResolver
): T {
    const positions = geometry.getAttribute("position");
    const originalIndex = geometry.getIndex();

    if (!positions) {
        throw new Error("Geometry has no positions");
    }

    const count = originalIndex?.count ?? positions.count;

    if (count % 3 !== 0) {
        throw new Error("Geometry must contain triangles");
    }

    const groups = new Map<number, number[]>();

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < count; i += 3) {
        const ia = originalIndex?.getX(i) ?? i;
        const ib = originalIndex?.getX(i + 1) ?? i + 1;
        const ic = originalIndex?.getX(i + 2) ?? i + 2;

        a.fromBufferAttribute(positions, ia);
        b.fromBufferAttribute(positions, ib);
        c.fromBufferAttribute(positions, ic);

        normal.crossVectors(
            ab.subVectors(b, a),
            ac.subVectors(c, a)
        ).normalize();

        const materialIndex = resolveMaterial(normal);

        if (!Number.isInteger(materialIndex) || materialIndex < 0) {
            throw new RangeError("Invalid material index");
        }

        if (!groups.has(materialIndex)) {
            groups.set(materialIndex, []);
        }

        groups.get(materialIndex)!.push(ia, ib, ic);
    }

    const indices: number[] = [];

    geometry.clearGroups();

    for (const [materialIndex, faces] of groups) {
        geometry.addGroup(
            indices.length,
            faces.length,
            materialIndex
        );

        for (const index of faces) {
            indices.push(index);
        }
    }

    geometry.setIndex(indices);

    return geometry;
}
