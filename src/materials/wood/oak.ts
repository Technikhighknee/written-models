import * as THREE from "three";
import { bakePbrMaps } from "../../toolbox/texturing/bakePbrMaps";
import { oakFace, oakEndGrain } from "./oakSurface";

export interface OakMaterials {
    /** Across the fibers in U, along the fibers in V. */
    face: THREE.MeshStandardMaterial;
    light: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
    aged: THREE.MeshStandardMaterial;
    endGrain: THREE.MeshStandardMaterial;
    /** Same PBR maps; enable exported vertex colors for per-piece variation. */
    tinted: {
        face: THREE.MeshStandardMaterial;
        endGrain: THREE.MeshStandardMaterial;
    };
}

let cached: OakMaterials | undefined;

/** All three wooden models share these authored PBR maps and finishes. */
export function oak(): OakMaterials {
    if (cached) return cached;

    const faces = bakePbrMaps({
        width: 512,
        height: 1024,
        tileWidth: 0.32,
        tileLength: 1.6,
        sample: oakFace
    });

    const ends = bakePbrMaps({
        width: 256,
        height: 256,
        tileWidth: 0.20,
        tileLength: 0.20,
        sample: oakEndGrain
    });

    function finish(
        name: string,
        maps: typeof faces,
        tint = "#ffffff"
    ): THREE.MeshStandardMaterial {
        return new THREE.MeshStandardMaterial({
            name,
            color: tint,
            map: maps.color,
            roughnessMap: maps.roughness,
            normalMap: maps.normal,
            normalScale: new THREE.Vector2(0.6, 0.6),
            metalness: 0,
            roughness: 1
        });
    }

    const natural = finish("Oak · Natural", faces);
    const endGrain = finish("Oak · End Grain", ends);
    const tintedFace = natural.clone();
    tintedFace.name = "Oak · Natural (Vertex Tinted)";
    tintedFace.vertexColors = true;
    const tintedEndGrain = endGrain.clone();
    tintedEndGrain.name = "Oak · End Grain (Vertex Tinted)";
    tintedEndGrain.vertexColors = true;

    cached = {
        face: natural,
        light: finish("Oak · Light", faces, "#f1e9dc"),
        dark: finish("Oak · Dark", faces, "#b6a28e"),
        aged: finish("Oak · Aged", faces, "#d1c5b4"),
        endGrain,
        tinted: {
            face: tintedFace,
            endGrain: tintedEndGrain
        }
    };

    return cached;
}
