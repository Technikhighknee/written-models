import * as THREE from "three";

/** A single, shared iron finish for straps, hoops and other hardware. */
let shared: THREE.MeshStandardMaterial | undefined;

export function wroughtIron(): THREE.MeshStandardMaterial {
    return shared ??= new THREE.MeshStandardMaterial({
        name: "Wrought Iron · Dark",
        color: "#484b4d",
        metalness: 0.8,
        roughness: 0.4
    });
}
