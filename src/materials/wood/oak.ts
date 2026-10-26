import * as THREE from "three";
import { bakePbrMaps } from "../../toolbox/texturing/bakePbrMaps";

export interface OakMaterials {
    /** Shared grain direction: U goes across the board, V along its length. */
    face: THREE.MeshStandardMaterial;
    light: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
    aged: THREE.MeshStandardMaterial;
    /** Distinct end-grain texture, not stretched longitudinal grain. */
    endGrain: THREE.MeshStandardMaterial;
}

let cached: OakMaterials | undefined;

const TAU = Math.PI * 2;

function grain(u: number, v: number) {
    // All frequencies are integral, so the 2D field repeats seamlessly.
    // Localized distortions are authored into the grain rather than
    // generating unrelated color and bump noise.
    const du = Math.abs(u - 0.67);
    const dv = Math.abs(v - 0.58);
    const wrappedU = Math.min(du, 1 - du);
    const wrappedV = Math.min(dv, 1 - dv);
    const knot = Math.exp(
        -((wrappedU / 0.10) ** 2 + (wrappedV / 0.085) ** 2) * 1.5
    );
    const drift =
        0.028 * Math.sin(TAU * v) +
        0.008 * Math.sin(TAU * (3 * v + u)) +
        0.04 * knot * Math.sin(TAU * (v - 0.58));

    const band = Math.sin(TAU * (19 * u + 19 * drift));
    const fine = Math.sin(TAU * (53 * u + 53 * drift));
    const pores = Math.sin(TAU * (82 * u + 3 * v)) *
        Math.sin(TAU * (37 * v - 2 * u));
    return { band, fine, pores, knot };
}

/**
 * Shared, hand-authored PBR oak family. All models receive the exact same
 * canvases and materials, not duplicated per-model texture allocations.
 *
 * UVs are expressed in meters. One repeat spans 24 cm across the grain
 * and 90 cm along it. Texture repetition is handled by the material.
 */
export function oak(): OakMaterials {
    if (cached) return cached;

    const faceMaps = bakePbrMaps({
        width: 256,
        height: 512,
        tileWidth: 0.24,
        tileLength: 0.90,
        sample(u, v) {
            const { band, fine, pores, knot } = grain(u, v);
            const shade = band * 12 + fine * 5 + pores * 1.8 - knot * 15;

            return {
                color: [
                    159 + shade,
                    111 + shade * 0.78,
                    68 + shade * 0.5
                ],
                roughness: 0.83 + 0.025 * fine + 0.02 * pores,
                height: 0.000025 * band + 0.000006 * fine +
                    0.000002 * pores - 0.000013 * knot
            };
        }
    });

    const endMaps = bakePbrMaps({
        width: 192,
        height: 192,
        tileWidth: 0.18,
        tileLength: 0.18,
        sample(u, v) {
            // A periodic radial field with concentric growth rings.
            const radius = Math.sqrt(
                2 + Math.cos(TAU * u) + Math.cos(TAU * v)
            );
            const rings = Math.sin(radius * 36 + Math.sin(TAU * u) * 1.3);
            const rays = Math.cos(TAU * (11 * u + 13 * v)) * 0.15;
            const shade = rings * 12 + rays * 8;

            return {
                color: [
                    132 + shade,
                    87 + shade * 0.75,
                    51 + shade * 0.55
                ],
                roughness: 0.91 + rings * 0.025,
                height: rings * 0.000012 + rays * 0.000003
            };
        }
    });

    function material(
        name: string,
        maps: typeof faceMaps,
        tint = "#ffffff"
    ): THREE.MeshStandardMaterial {
        return new THREE.MeshStandardMaterial({
            name,
            color: tint,
            map: maps.color,
            roughnessMap: maps.roughness,
            normalMap: maps.normal,
            normalScale: new THREE.Vector2(0.6, 0.6),
            roughness: 1,
            metalness: 0
        });
    }

    cached = {
        face: material("Oak · Natural", faceMaps),
        light: material("Oak · Light", faceMaps, "#f1e6d6"),
        dark: material("Oak · Dark", faceMaps, "#b9a28c"),
        aged: material("Oak · Aged", faceMaps, "#d5c3ab"),
        endGrain: material("Oak · End Grain", endMaps)
    };

    return cached;
}
