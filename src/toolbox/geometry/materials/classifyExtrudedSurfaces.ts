import * as THREE from "three";

export interface ExtrudedSurfaceClassification {
    /** Reference direction expressed in geometry-local coordinates. */
    axis: THREE.Vector3Like;
    /** Absolute face-normal alignment needed for the oriented surface. */
    threshold?: number;
    /** Existing draw group used by the 2D extrusion's broad caps. */
    capGroup?: number;
    /** Existing draw group used by the extrusion's sidewall quads. */
    sideGroup?: number;
    capMaterial?: number;
    alignedMaterial?: number;
    transverseMaterial?: number;
}

/**
 * Reclassify an already-extruded shape's material groups by the direction
 * of its side faces, without any assumption about timber/grain.
 *
 * An oriented cut face, an end of a masonry slab, and the cross-grain
 * of a plank are the same geometric classification problem.
 *
 * Geometry is unchanged. This operation modifies draw groups/indices,
 * not the source control mesh, and expects ordinary two-group extrusion
 * topology (one cap group plus side quads encoded as triangle pairs).
 */
export function classifyExtrudedSurfaces<T extends THREE.BufferGeometry>(
    geometry: T,
    {
        axis, threshold = 0.68,
        capGroup = 0, sideGroup = 1,
        capMaterial = 0,
        alignedMaterial = 1, transverseMaterial = 0
    }: ExtrudedSurfaceClassification
): T {
    const direction = new THREE.Vector3(axis.x, axis.y, axis.z);
    const position = geometry.getAttribute("position");
    if (![direction.x, direction.y, direction.z, threshold].every(Number.isFinite) ||
        direction.lengthSq() < 1e-16 ||
        threshold <= 0 || threshold >= 1 ||
        ![capGroup, sideGroup, capMaterial, alignedMaterial,
            transverseMaterial].every(x => Number.isInteger(x) && x >= 0) ||
        !position) {
        throw new RangeError("Invalid extrusion surface classification");
    }
    direction.normalize();
    const cap = geometry.groups.find(g => g.materialIndex === capGroup);
    const side = geometry.groups.find(g => g.materialIndex === sideGroup);
    if (!cap || !side || side.count % 6 !== 0) {
        throw new RangeError("Expected a cap group and quad-paired sidewalls");
    }

    const indexed = geometry.getIndex();
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const c = new THREE.Vector3(), edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3(), normal = new THREE.Vector3();
    geometry.clearGroups();
    geometry.addGroup(cap.start, cap.count, capMaterial);

    let runStart = side.start, lastMaterial = -1;
    for (let i = side.start; i < side.start + side.count; i += 6) {
        a.fromBufferAttribute(position, indexed?.getX(i) ?? i);
        b.fromBufferAttribute(position, indexed?.getX(i + 1) ?? i + 1);
        c.fromBufferAttribute(position, indexed?.getX(i + 2) ?? i + 2);
        normal.crossVectors(
            edge1.subVectors(b, a), edge2.subVectors(c, a)
        ).normalize();
        const material = Math.abs(normal.dot(direction)) >= threshold
            ? alignedMaterial : transverseMaterial;
        if (lastMaterial >= 0 && material !== lastMaterial) {
            geometry.addGroup(runStart, i - runStart, lastMaterial);
            runStart = i;
        }
        lastMaterial = material;
    }
    if (lastMaterial >= 0) {
        geometry.addGroup(
            runStart, side.start + side.count - runStart, lastMaterial
        );
    }
    return geometry;
}
