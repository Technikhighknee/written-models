import * as THREE from "three";
import { bakePbrMaps } from "../../toolbox/texturing/bakePbrMaps";
import { tileableNoise } from "../../toolbox/texturing/tileableNoise";

export interface StonewareMaterials {
    body: THREE.MeshStandardMaterial;
    lip: THREE.MeshStandardMaterial;
}

let cached: StonewareMaterials | undefined;

/**
 * Pale, unglazed high-fired stoneware: restrained warm clay fluctuations,
 * fine mineral specks and a dry satin-matte surface. No modern shiny glaze,
 * painted medallions or conspicuous repeated marble/swirl pattern.
 *
 * General material for cups, jars, bottles and utilitarian pottery.
 */
export function paleStoneware(): StonewareMaterials {
    if (cached) return cached;

    const maps = bakePbrMaps({
        width: 256,
        height: 512,
        tileWidth: 0.18,
        tileLength: 0.28,
        sample(u, v) {
            const fired = tileableNoise(u, v, 9, 13, 137);
            const clay = tileableNoise(u, v, 39, 57, 253);
            const particles = tileableNoise(u, v, 112, 149, 421);
            const wash = 2.5 * fired + 1.8 * clay;
            const minerals = particles > 0.72 ? -11 * (particles - 0.72) : 0;
            return {
                color: [
                    195 + wash + minerals,
                    181 + wash * 0.91 + minerals,
                    158 + wash * 0.8 + minerals
                ] as const,
                roughness: Math.max(0.75, Math.min(0.96,
                    0.86 + fired * 0.032 + clay * 0.027)),
                height: 0.000008 * clay + 0.000004 * particles
            };
        }
    });

    const body = new THREE.MeshStandardMaterial({
        name: "Pale Stoneware · Unglazed",
        color: "#f1ece4",
        metalness: 0,
        roughness: 1,
        map: maps.color,
        roughnessMap: maps.roughness,
        normalMap: maps.normal,
        normalScale: new THREE.Vector2(0.45, 0.45)
    });

    const lip = body.clone();
    lip.name = "Pale Stoneware · Worn Lip";
    lip.color.set("#fff5e6");
    return cached = {body, lip};
}
