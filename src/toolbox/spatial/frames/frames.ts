import * as THREE from "three";

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

export function createFrame(
    position: THREE.Vector3 = new THREE.Vector3(),
    rotation: THREE.Quaternion = new THREE.Quaternion
): THREE.Matrix4 {
    return new THREE.Matrix4().compose(
        position,
        rotation,
        UNIT_SCALE
    );
}
