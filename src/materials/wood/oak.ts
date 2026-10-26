import * as THREE from "three";
import { bakePbrMaps } from "../../toolbox/texturing/bakePbrMaps";
import { makeOakFace, makeOakEndGrain, makeOakBoardFace } from "./oakSurface";

export interface OakMaterials {
    /** U across the fibers, V along them. Both UVs are measured in meters. */
    face: THREE.MeshStandardMaterial;
    light: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
    aged: THREE.MeshStandardMaterial;
    endGrain: THREE.MeshStandardMaterial;
    tinted: {
        face: THREE.MeshStandardMaterial;
        endGrain: THREE.MeshStandardMaterial;
    };
}

const cuts = new Map<number, OakMaterials>();

/** Canonical oak material; unchanged API for existing models. */
export function oak(): OakMaterials {
    return oakVariant(0);
}

/**
 * Deterministic cuts of the SAME oak species. They share palette, scale,
 * structure and lighting response, but not a recognizable repeating knot.
 * A caller picks a small, reusable set of seeds and assigns UV windows.
 *
 * Materials/maps are created once per seed and cached across all models.
 */
export function oakVariant(seed: number): OakMaterials {
    if (!Number.isInteger(seed) || seed < 0 || seed > 10000) {
        throw new RangeError("Invalid oak cut seed");
    }

    const existing = cuts.get(seed);
    if (existing) return existing;

    // One full board fits into a tile. The old texture repeated every 1.6m
    // and stamped the same knots onto each stave; now unique seeds and
    // longer grain flow remove both repetition mechanisms.
    const faces = bakePbrMaps({
        width: 320,
        height: 768,
        tileWidth: 0.48,
        tileLength: 2.6,
        sample: makeOakFace(seed)
    });

    // End grain is quieter and never a centered bulls-eye.
    const ends = bakePbrMaps({
        width: 192,
        height: 192,
        tileWidth: 0.26,
        tileLength: 0.26,
        sample: makeOakEndGrain(seed)
    });

    function material(
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
            roughness: 1,
            metalness: 0
        });
    }

    const face = material(`Oak Cut ${seed} · Natural`, faces);
    const endGrain = material(`Oak Cut ${seed} · End Grain`, ends);
    const tintedFace = face.clone();
    tintedFace.vertexColors = true;
    tintedFace.name = `Oak Cut ${seed} · Tinted`;
    const tintedEnd = endGrain.clone();
    tintedEnd.vertexColors = true;
    tintedEnd.name = `Oak Cut ${seed} · Tinted End Grain`;

    const family: OakMaterials = {
        face,
        light: material(`Oak Cut ${seed} · Light`, faces, "#f1e9dc"),
        dark: material(`Oak Cut ${seed} · Dark`, faces, "#b6a28e"),
        aged: material(`Oak Cut ${seed} · Aged`, faces, "#d1c5b4"),
        endGrain,
        tinted: { face: tintedFace, endGrain: tintedEnd }
    };

    cuts.set(seed, family);
    return family;
}

/**
 * Calm, planed broad face for a tabletop or other wide timber.
 *
 * This has a subtler, continuously flowing grain FIGURE, not a different
 * wood species.
 * It also suits the underside, exposed lengthwise edges, and planed
 * furniture framing. The true cross-cut ends always use endGrain.
 *
 * Create these maps lazily: barrel staves should not pay for a tabletop
 * texture, and materials for equal seeds are shared across models.
 */
const boardFaceCuts = new Map<number, THREE.MeshStandardMaterial>();

export function oakBoardFace(seed: number): THREE.MeshStandardMaterial {
    const existing = boardFaceCuts.get(seed);
    if (existing) return existing;

    const oakCut = oakVariant(seed); // Also validates seed.
    const maps = bakePbrMaps({
        width: 320,
        height: 768,
        tileWidth: 0.48,
        tileLength: 2.6,
        sample: makeOakBoardFace(seed)
    });

    const face = oakCut.tinted.face.clone();
    face.name = `Oak Cut ${seed} · Planed Broad Face`;
    face.map = maps.color;
    face.roughnessMap = maps.roughness;
    face.normalMap = maps.normal;
    // Inherits vertexColors and the same PBR/normal strength as the family.
    boardFaceCuts.set(seed, face);
    return face;
}
