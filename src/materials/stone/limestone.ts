import * as THREE from "three";

import { bakePbrMaps } from "../../toolbox/texturing/bakePbrMaps";
import { palette } from "../../toolbox/texturing/fields";
import { fractalNoise, tileableNoise } from "../../toolbox/texturing/tileableNoise";

const STONE_COLORS = [
    [0, [82, 80, 72]],
    [0.35, [118, 115, 102]],
    [0.7, [150, 143, 125]],
    [1, [174, 165, 143]]
] as const;

const TINTS = [
    "#fff5e6", "#eee9df", "#e9e5d9", "#f0e8da", "#e5e4dd",
    "#c4c9bf", "#bdc2b7"
] as const;

let variants: THREE.MeshStandardMaterial[] | undefined;

/** One mineral surface recipe, shared by all stones in the well. */
export function limestoneVariant(index: number): THREE.MeshStandardMaterial {
    if (!Number.isInteger(index) || index < 0 || index >= TINTS.length) {
        throw new RangeError("Unknown limestone finish");
    }

    if (!variants) {
        const maps = bakePbrMaps({
            width: 256,
            height: 256,
            tileWidth: 0.55,
            tileLength: 0.55,
            sample(u, v) {
                const body = fractalNoise(u, v, 3, 3, 4, 73);
                const grain = fractalNoise(u, v, 13, 12, 3, 89);
                const pores = tileableNoise(u, v, 77, 81, 117);
                const tone = Math.max(0, Math.min(1,
                    0.57 + body * 0.21 + grain * 0.16 + pores * 0.045
                ));

                return {
                    color: palette(STONE_COLORS, tone),
                    roughness: Math.max(0.83, Math.min(1,
                        0.92 + grain * 0.05 + pores * 0.025
                    )),
                    height: body * 0.00028 + grain * 0.00013 +
                        pores * 0.000035
                };
            }
        });

        variants = TINTS.map((tint, i) => new THREE.MeshStandardMaterial({
            name: "Weathered Limestone · " + (i + 1),
            color: tint,
            map: maps.color,
            roughnessMap: maps.roughness,
            normalMap: maps.normal,
            normalScale: new THREE.Vector2(0.85, 0.85),
            roughness: 1,
            metalness: 0
        }));
    }

    return variants[index]!;
}
