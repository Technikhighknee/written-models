import * as THREE from "three";
import {
    assertAffineTransform,
    DEFAULT_GEOMETRY_PRECISION
} from "../../geometry/kernel/precision";

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

/**
 * Compose a descendant's local-to-ancestor frame without depending on
 * stale matrixWorld values or current world-space parent transforms.
 */
export function frameFromAncestor(
    ancestor: THREE.Object3D,
    descendant: THREE.Object3D
): THREE.Matrix4 {
    const chain: THREE.Object3D[] = [];
    let current: THREE.Object3D | null = descendant;

    while (current && current !== ancestor) {
        chain.unshift(current);
        current = current.parent;
    }
    if (current !== ancestor) {
        throw new Error("Frame owner is outside the requested hierarchy");
    }

    const frame = new THREE.Matrix4();
    for (const object of chain) {
        if (object.matrixAutoUpdate) object.updateMatrix();
        frame.multiply(object.matrix);
    }
    return frame;
}

/** Convert a frame from object-local coordinates to world coordinates. */
export function frameToWorld(
    object: THREE.Object3D,
    localFrame: THREE.Matrix4 = new THREE.Matrix4()
): THREE.Matrix4 {
    object.updateWorldMatrix(true, false);
    return object.matrixWorld.clone().multiply(localFrame);
}

/** Convert a world-space frame into an object's local coordinates. */
export function frameToLocal(
    object: THREE.Object3D,
    worldFrame: THREE.Matrix4
): THREE.Matrix4 {
    object.updateWorldMatrix(true, false);
    assertAffineTransform(
        object.matrixWorld, "frameToLocal", DEFAULT_GEOMETRY_PRECISION
    );
    return object.matrixWorld.clone().invert().multiply(worldFrame);
}
