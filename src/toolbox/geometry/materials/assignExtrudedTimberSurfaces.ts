import * as THREE from "three";

/**
 * Classifies an already extruded plank by its fiber direction.
 * Cap faces are broad grain. Only sidewall edges pointing ALONG the
 * grain axis expose a true cut end; parallel sidewalls remain long grain.
 *
 * Preserves the nonindexed triangle order and stores the original sidewall
 * range so the Quads viewer can still recover the extrusion's control edges.
 *
 * Material slot 0 = long grain, slot 1 = end grain.
 */
export function assignExtrudedTimberSurfaces<T extends THREE.ExtrudeGeometry>(
    geometry: T,
    grainAxis: THREE.Vector3Like,
    cutThreshold = 0.68
): T {
    const axis = new THREE.Vector3(grainAxis.x, grainAxis.y, grainAxis.z);
    const position = geometry.getAttribute("position");

    if (
        axis.lengthSq() <= 0 ||
        ![axis.x, axis.y, axis.z].every(Number.isFinite) ||
        !Number.isFinite(cutThreshold) ||
        cutThreshold <= 0 || cutThreshold >= 1 ||
        geometry.getIndex() !== null ||
        !position
    ) {
        throw new RangeError("Invalid extruded timber");
    }
    axis.normalize();

    const cap = geometry.groups.find(group => group.materialIndex === 0);
    const side = geometry.groups.find(group => group.materialIndex === 1);

    if (!cap || !side || side.count % 6 !== 0) {
        throw new Error("Expected ordinary ExtrudeGeometry cap and sidewall groups");
    }

    geometry.userData.controlSidewalls = {
        start: side.start,
        count: side.count
    };
    geometry.clearGroups();
    geometry.addGroup(cap.start, cap.count, 0);

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();

    let start = side.start;
    let previous = -1;

    for (let i = side.start; i < side.start + side.count; i += 6) {
        a.fromBufferAttribute(position, i);
        b.fromBufferAttribute(position, i + 1);
        c.fromBufferAttribute(position, i + 2);
        normal.crossVectors(
            edge1.subVectors(b, a),
            edge2.subVectors(c, a)
        ).normalize();

        const material = Math.abs(normal.dot(axis)) >= cutThreshold ? 1 : 0;

        if (previous >= 0 && material !== previous) {
            geometry.addGroup(start, i - start, previous);
            start = i;
        }
        previous = material;
    }

    if (previous >= 0) {
        geometry.addGroup(start, side.start + side.count - start, previous);
    }

    return geometry;
}
