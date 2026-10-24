import * as THREE from "three";

export function getBounds(
    object: THREE.Object3D
): THREE.Box3 {
    object.updateWorldMatrix(true, true);

    const bounds = new THREE.Box3().setFromObject(object, true);

    if (bounds.isEmpty()) {
        throw new Error("Cannot measure an empty object");
    }

    return bounds;
}
