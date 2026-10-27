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
            // Plain workshop steel has subdued grinding marks without
            // the conspicuous bands of pattern-welded blades.
            const forging = tileableNoise(u, v, 13, 11, 301);
            const finish = tileableNoise(u, v, 39, 27, 707);
            // Narrow variations across U persist along V: grinding strokes
            // follow the length of the blade, without waves or flowing bands.
            const lengthwise = tileableNoise(u, v, 78, 3, 907);
            const micro = tileableNoise(u, v, 96, 43, 1201);

            // Keep color almost uniform. Fine scratches catch light via
            // roughness and normal maps, not conspicuous etched contrasts.
            const grey = 150 + 3.5 * forging + 1.8 * finish +
                1.2 * lengthwise;
            return {
                color: [grey, grey + 1, grey + 2] as const,
                roughness: Math.max(0.48, Math.min(0.64,
                    0.55 + 0.02 * forging + 0.012 * finish +
                    0.01 * lengthwise
                )),
                height: 0.0000006 * lengthwise +
                    0.0000003 * micro + 0.0000003 * finish
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
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughnessMap: maps.roughness
    });

    // Freshly sharpened edge planes have the same metal and map, but catch
    // a little more light than the broad, oxidized faces.
    const edge = body.clone();
    edge.name = "Worked Carbon Steel · Sharpened Edges";
    edge.color.set("#ffffff");

    return shared = { body, edge };
}
