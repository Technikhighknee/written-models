import type { Shape } from "three";
import { polygon } from "./polygon";

export function rectangle(
    width: number, 
    depth: number
): Shape {
    const hw = width / 2;
    const hd = depth / 2;

    return polygon([
        [-hw, -hd],
        [ hw, -hd],
        [ hw,  hd],
        [-hw,  hd]
    ]);
}
