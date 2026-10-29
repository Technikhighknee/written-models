import * as THREE from "three";
import { attachAtFrames } from "./attachAtFrames";

/** Attach using parent-local and child-local contact frames. */
export function attachByFrames<T extends THREE.Object3D>(
    parent: THREE.Object3D,
    child: T,
    parentFrame: THREE.Matrix4,
    childFrame: THREE.Matrix4
): T {
    return attachAtFrames({
        parent,
        child,
        parentFrame,
        childFrame
    });
}
