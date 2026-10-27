import * as THREE from "three";
import { bakePbrMaps } from "../../toolbox/texturing/bakePbrMaps";
import { tileableNoise } from "../../toolbox/texturing/tileableNoise";

export interface BladeSteel {
    body: THREE.MeshStandardMaterial;
    edge: THREE.MeshStandardMaterial;
}

/**
 * Quiet, worked steel rather than chrome or fantasy silver.
 * The same grain/abrasion scale serves knife blades, chisels and tools.
 */
let shared: BladeSteel | undefined;

export function bladeSteel(): BladeSteel {
    if (shared) return shared;

    const maps = bakePbrMaps({
        width: 192,
        height: 512,
        tileWidth: 0.085,
        tileLength: 0.30,
        sample(u, v) {
            const coarse = tileableNoise(u, v, 12, 21, 301);
            const fine = tileableNoise(u, v, 63, 89, 707);
            // Lengthwise grinding marks, with a restrained forged mottling.
            const grain = Math.sin(
                2 * Math.PI * (v * 117 + 0.1 * Math.sin(2 * Math.PI * u * 9))
            );
            const wear = 0.65 * coarse + 0.35 * fine;
            const tone = Math.max(-1, Math.min(1, wear * 0.48 + grain * 0.13));
            const grey = 143 + 14 * tone;
            return {
                color: [
                    grey * 0.96,
                    grey,
                    grey * 1.035
                ] as const,
                roughness: Math.max(0.3, Math.min(0.73,
                    0.49 + 0.08 * coarse + 0.018 * grain
                )),
                height: 0.0000013 * fine + 0.0000007 * grain +
                    0.0000023 * coarse
            };
        }
    });

    const body = new THREE.MeshStandardMaterial({
        name: "Worked Carbon Steel · Blade",
        color: "#e3e5e4",
        metalness: 0.62,
        roughness: 1,
        map: maps.color,
        normalMap: maps.normal,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughnessMap: maps.roughness
    });

    // Freshly sharpened edge planes have the same metal and map, but catch
    // a little more light than the broad, oxidized faces.
    const edge = body.clone();
    edge.name = "Worked Carbon Steel · Sharpened Edges";
    edge.color.set("#ffffff");

    return shared = { body, edge };
}
