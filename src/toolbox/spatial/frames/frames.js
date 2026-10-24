import * as THREE from "three";

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);


/**
 * Creates a ridgid local reference frame.
 * 
 * The resulting matrix describes a position and orientation
 * relative to the coordinate system of its owning object.
 * 
 * @param {THREE.Vector3} position 
 * @param {THREE.Quaternion} rotation 
 * @returns {THREE.Matrix4}
 */
export function createFrame(
    position = new THREE.Vector3(),
    rotation = new THREE.Quaternion()
) {
    return new THREE.Matrix4().compose(
        position, rotation, UNIT_SCALE 
    );
}
