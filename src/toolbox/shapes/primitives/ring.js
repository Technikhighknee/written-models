import * as THREE from "three";

/**
 * @param {number} innerRadius 
 * @param {number} outerRadius
 * @returns {THREE.Shape} 
 */
export function ring(innerRadius, outerRadius) {
    if (
        !Number.isFinite(innerRadius) ||
        !Number.isFinite(outerRadius) ||
        innerRadius <= 0 ||
        outerRadius <= innerRadius
    ) {
        throw new RangeError("Invalid ring radii");
    }

    const shape = new THREE.Shape();

    shape.absarc(
        0, 0, outerRadius,
        0, Math.PI * 2, false
    );

    const hole = new THREE.Path();

    hole.absarc(
        0, 0, innerRadius,
        0, Math.PI * 2, true
    );

    shape.holes.push(hole);

    return shape;
}