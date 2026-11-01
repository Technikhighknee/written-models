import * as THREE from "three";

import { bakePbrMaps } from "../../toolbox/texturing/bakePbrMaps";

export type CanvasDye = "madder-red" | "unbleached";

const colors: Record<CanvasDye, readonly [number, number, number]> = {
    "madder-red": [120, 54, 44],
    unbleached: [195, 172, 131]
};

const cached = new Map<CanvasDye, THREE.MeshStandardMaterial>();

/** Muted woven linen, visible from both sides of a thin canvas. */
export function wovenCanvas(dye: CanvasDye): THREE.MeshStandardMaterial {
    const existing = cached.get(dye);
    if (existing) return existing;

    const base = colors[dye];
    const maps = bakePbrMaps({
        width: 256,
        height: 256,
        tileWidth: 0.4,
        tileLength: 0.4,
        sample(u, v) {
            // Fine fibre structure; larger cloth folds belong to the mesh.
            const warp = Math.sin(u * Math.PI * 2 * 57);
            const weft = Math.sin(v * Math.PI * 2 * 61);
            const faded = 0.026 * Math.sin(2 * Math.PI * (u + v)) +
                0.014 * Math.sin(4 * Math.PI * u) * Math.sin(2 * Math.PI * v);
            const shade = 1 + faded + (warp + weft) * 0.012;

            return {
                color: [
                    base[0] * shade,
                    base[1] * shade,
                    base[2] * shade
                ],
                roughness: 0.95 + 0.015 * warp * weft,
                height: 0.000012 * (warp + weft)
            };
        }
    });

    const material = new THREE.MeshStandardMaterial({
        name: dye === "madder-red"
            ? "Madder-dyed Woven Canvas"
            : "Unbleached Woven Canvas",
        map: maps.color,
        roughnessMap: maps.roughness,
        normalMap: maps.normal,
        normalScale: new THREE.Vector2(0.22, 0.22),
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide
    });
    cached.set(dye, material);
    return material;
}
