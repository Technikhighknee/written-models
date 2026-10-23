import * as THREE from "three";

export function extrude(shape, {
    thickness, 
    bevel = null,
    curveSegments = 32 
} = {}) {
    const bevelSize = bevel?.size ?? 0;
    const bevelThickness = bevel?.thickness ?? 0;

    const depth = thickness - 2 * bevelThickness;

    if (
        !Number.isFinite(depth) ||
        depth <= 0 ||
        bevelSize < 0 ||
        bevelThickness < 0
    ) {
        throw new RangeError("Invalid extrusion dimensions");
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth, bevelSize, bevelThickness, curveSegments,
        bevelEnabled: bevelSize > 0 && bevelThickness > 0,
        bevelSegments: 1,
    });

    geometry.translate(0, 0, -depth / 2);
    geometry.rotateX(-Math.PI / 2);

    return geometry;
}