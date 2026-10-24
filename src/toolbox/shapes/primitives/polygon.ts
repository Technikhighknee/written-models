import * as THREE from "three";

export function polygon(
    points: readonly (readonly [number, number])[]
): THREE.Shape {
    if (points.length < 3) {
        throw new Error("A polygon requires at least 3 points.");
    }

    const shape = new THREE.Shape();

    shape.moveTo(...points[0]!);

    for (const point of points.slice(1)) {
        shape.lineTo(...point);
    }

    shape.closePath();

    return shape;
}
