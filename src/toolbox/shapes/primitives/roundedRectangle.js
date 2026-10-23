import * as THREE from "three";
import { rectangle } from "./rectangle.js";

/**
 * @param {number} width 
 * @param {number} depth 
 * @param {number} radius 
 */
export function roundedRectangle(width, depth, radius) {
    if (
        width <= 0 ||
        depth <= 0 ||
        radius < 0 ||
        radius > Math.min(width, depth) / 2
    ) {
        throw new RangeError("Invalid rounded rectangle dimensions");
    }

    if (radius === 0) {
        console.warn("Could just use a normal rectangle roughly", Error().stack.split("\n")[2] || "at ... you know what? nevermind");
        return rectangle(width, depth);
    }

    const hw = width / 2;
    const hd = depth / 2;

    const shape = new THREE.Shape();

    shape.moveTo(-hw + radius, -hd);
    
    shape.lineTo(hw - radius, -hd);
    shape.absarc(
        hw - radius, -hd + radius, radius,
        -Math.PI / 2, 0, false
    );

    shape.lineTo(hw, hd - radius);
    shape.absarc(
        hw - radius, hd -radius, radius,
        0, Math.PI / 2, false
    );
    
    shape.lineTo(-hw + radius, hd);
    shape.absarc(
        -hw + radius, hd - radius, radius,
        Math.PI / 2, Math.PI, false
    );

    shape.lineTo(-hw, -hd + radius);
    shape.absarc(
        -hw + radius, -hd + radius, radius,
        Math.PI, Math.PI * 1.5, false
    );

    shape.closePath();
    return shape;
}