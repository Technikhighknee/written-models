import * as THREE from "three";

export function attachByFrames<T extends THREE.Object3D>(
    parent: THREE.Object3D, 
    child: T,
    parentFrame: THREE.Matrix4, 
    childFrame: THREE.Matrix4
): T {
    // An object cannot be attached beneath one of its descendants.
    // Object3D.add() does not reject this and would corrupt traversal.
    let ancestor: THREE.Object3D | null = parent;
    while (ancestor) {
        if (ancestor === child) {
            throw new Error("Attachment would create a black hole (circular dependency)");
        }
        ancestor = ancestor.parent;
    }

    if (
        parentFrame.determinant() === 0 ||
        childFrame.determinant() === 0
    ) {
        throw new Error("Attachment frames must be invertible");
    }

    const transform = parentFrame.clone()
        .multiply(childFrame.clone().invert());
    
    parent.add(child);

    transform.decompose(
        child.position,
        child.quaternion,
        child.scale
    );

    child.updateMatrix();

    return child;
}
