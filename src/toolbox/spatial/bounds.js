import * as THREE from "three";

/**
 * @param {THREE.Object3D} object 
 * @returns {THREE.Box3}
 */
export function getBounds(object) {
    object.updateWorldMatrix(true, true);

    const bounds = new THREE.Box3().setFromObject(
        object, true
    );

    if (bounds.isEmpty()) {
        throw new Error("Cannot measure an emty object");
    }

    return bounds;
}