import * as THREE from "three";

/** A single, shared iron finish for straps, hoops and other hardware. */
let shared: THREE.MeshStandardMaterial | undefined;

export function wroughtIron(): THREE.MeshStandardMaterial {
    return shared ??= new THREE.MeshStandardMaterial({
        name: "Wrought Iron · Dark",
        color: "#5c5a55",
        metalness: 0.64,
        roughness: 0.73
    });
}
