import { polygon } from "./polygon.js";

/**
 * @param {number} width 
 * @param {number} depth 
 */
export function rectangle(width, depth) {
    const hw = width / 2;
    const hd = depth / 2;

    return polygon([
        [-hw, -hd],
        [ hw, -hd],
        [ hw,  hd],
        [-hw,  hd]
    ]);
}