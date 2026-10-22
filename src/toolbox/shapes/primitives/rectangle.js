import * as THREE from "three";

/**
 * @param {number} width 
 * @param {number} depth 
 */
export function rectangle(width, depth) {
    const hw = width / 2;
    const hd = depth / 2;

    const shape = new THREE.Shape();

    shape.moveTo(-hw, -hd);
    shape.lineTo( hw, -hd);
    shape.lineTo( hw,  hd);
    shape.lineTo(-hw,  hd);
    shape.closePath();

    return shape;
}