import * as THREE from "three";
import type { Anchor } from "../anchors/anchors";

const MATING_ROTATION = new THREE.Matrix4()
    .makeRotationX(Math.PI);

function isDescendantOf(
    object: THREE.Object3D,
    ancestor: THREE.Object3D
): boolean {
    let current: THREE.Object3D | null = object;

    while (current) {
        if (current === ancestor) {
            return true;
        }

        current = current.parent;
    }

    return false;
}

function relativeMatrix(
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
        throw new Error("Anchor is foreign to the object");
    }

    const matrix = new THREE.Matrix4();

    for (const object of chain) {
        if (object.matrixAutoUpdate) {
            object.updateMatrix();
        }

        matrix.multiply(object.matrix);
    }

    return matrix;
}

export function attachByAnchors<T extends THREE.Object3D>(
    targetAnchor: Anchor,
    child: T,
    sourceAnchor: Anchor,
): T {
    if (
        child === sourceAnchor ||
        !isDescendantOf(sourceAnchor, child)
    ) {
        throw new Error("Source anchor must belong to child");
    }

    if (isDescendantOf(targetAnchor, child)) {
        throw new Error("Attachment would create a black hole (circular dependency)");
    }

    const childToAnchor = relativeMatrix(
        child,
        sourceAnchor
    );

    if (childToAnchor.determinant() === 0) {
        throw new Error("Source anchor transform is not invertible");
    }

    const transform = MATING_ROTATION.clone()
        .multiply(childToAnchor.invert());
    
    targetAnchor.add(child);

    transform.decompose(
        child.position,
        child.quaternion,
        child.scale
    );

    child.updateMatrix();

    return child;
}
