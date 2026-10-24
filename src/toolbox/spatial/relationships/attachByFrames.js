import * as THREE from "three";

/**
 * Attaches a child to a parent by aligning two local frames.
 * 
 * parentFrame is expressed in the parent's local space.
 * childFrame is expressed in the child's local space.
 * 
 * The child becomes a child of the parent, so the attachment
 * remains intact under subsequent parent transformations.
 * 
 * @param {THREE.Object3D} parent 
 * @param {THREE.Object3D} child 
 * @param {THREE.Matrix4} parentFrame 
 * @param {THREE.Matrix4} childFrame
 * @returns {THREE.Object3D} 
 */
export function attachByFrames(
    parent, child,
    parentFrame, childFrame
) {
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
