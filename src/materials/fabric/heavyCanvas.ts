import * as THREE from "three";

export interface HeavyCanvasMaterials {
    outside: THREE.MeshStandardMaterial;
    inside: THREE.MeshStandardMaterial;
    hem: THREE.MeshStandardMaterial;
}

let cached: HeavyCanvasMaterials | undefined;

/** Undyed, weathered linen: matte outside, darker underside and cut edges. */
export function heavyCanvas(): HeavyCanvasMaterials {
    if (cached) return cached;

    const outside = new THREE.MeshStandardMaterial({
        name: "Heavy Linen · Sunlit",
        color: "#c1ad8a",
        roughness: 0.98,
        metalness: 0
    });
    const inside = outside.clone();
    inside.name = "Heavy Linen · Underside";
    inside.color.set("#ad9878");

    const hem = outside.clone();
    hem.name = "Heavy Linen · Folded Edge";
    hem.color.set("#b6a17f");

    cached = {outside, inside, hem};
    return cached;
}
