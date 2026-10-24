import * as THREE from "three";

export function attachByFrames<T extends THREE.Object3D>(
    parent: THREE.Object3D, 
    child: T,
    parentFrame: THREE.Matrix4, 
    childFrame: THREE.Matrix4
): T {
    if (parent === child) {
        throw new Error("Nope. Refusing to glue an object to itself");
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
