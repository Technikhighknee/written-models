import * as THREE from "three";

// A minor technical quirk: Normals are evaluated in the local geometry coordinates.
// This is find for the current use case, but it's something to keep in mind if the
// function later encounters geometries that have already been transformed.
// TODO: Reread this at some point before you find yourself wondering, "WTF is going on here?"

/**
 * @param {THREE.BufferGeometry} geometry 
 * @param {(normal: THREE.Vector3) => number} resolveMaterial
 * @returns {THREE.BufferGeometry} 
 */
export function assignMaterialsByNormal(geometry, resolveMaterial) {
    const positions = geometry.getAttribute("position");
    const originalIndex = geometry.getIndex();

    if (!positions) {
        throw new Error("Geometry has no positions");
    }

    const count = originalIndex?.count ?? positions.count;

    if (count % 3 !== 0) {
        throw new Error("Geometry must contain triangles");
    }

    const groups = new Map();

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let i = 0; i < count; i += 3) {
        const ia = originalIndex?.getX(i) ?? i;
        const ib = originalIndex?.getX(i +1 ) ?? i + 1;
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

        groups.get(materialIndex).push(ia, ib, ic);
    }

    const indices = [];

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
