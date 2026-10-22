import * as THREE from "three";

/**
 * @param {Array<[number, number]>} points 
 * @returns {THREE.Shape}
 */
export function polygon(points) {
    if (!Array.isArray(points) || points.length < 3) {
        throw new Error("A polygon requires at least 3 points.");
    }

    const shape = new THREE.Shape();

    shape.moveTo(...points[0]);

    for (const point of points.slice(1)) {
        shape.lineTo(...point);
    }

    shape.closePath();

    return shape;
}
