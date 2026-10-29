import * as THREE from "three";
import {
    assertAffineTransform,
    DEFAULT_GEOMETRY_PRECISION
} from "../../geometry/kernel/precision";

export interface FrameAttachmentOptions<T extends THREE.Object3D> {
    parent: THREE.Object3D;
    child: T;
    /** Contact frame in parent-local coordinates. */
    parentFrame: THREE.Matrix4;
    /** Contact frame in child-local coordinates. */
    childFrame: THREE.Matrix4;
    /** Optional contact-to-contact mapping, in parent-frame coordinates. */
    matingTransform?: THREE.Matrix4;
}

function validate(matrix: THREE.Matrix4, name: string): void {
    if (!(matrix instanceof THREE.Matrix4)) {
        throw new RangeError(`Invalid attachment matrix: ${name}`);
    }
    assertAffineTransform(
        matrix, "attachAtFrames", DEFAULT_GEOMETRY_PRECISION
    );
}

/**
 * Place a child's local contact frame onto a parent's contact frame.
 * The hierarchy is changed only after every transform and cycle
 * invariant has passed validation.
 */
export function attachAtFrames<T extends THREE.Object3D>({
    parent,
    child,
    parentFrame,
    childFrame,
    matingTransform = new THREE.Matrix4()
}: FrameAttachmentOptions<T>): T {
    if (!(parent instanceof THREE.Object3D) ||
        !(child instanceof THREE.Object3D)) {
        throw new RangeError("An attachment needs two scene objects");
    }

    let ancestor: THREE.Object3D | null = parent;
    while (ancestor) {
        if (ancestor === child) {
            throw new Error("Attachment would create a hierarchy cycle");
        }
        ancestor = ancestor.parent;
    }

    validate(parentFrame, "parentFrame");
    validate(childFrame, "childFrame");
    validate(matingTransform, "matingTransform");

    const childToParent = parentFrame.clone()
        .multiply(matingTransform)
        .multiply(childFrame.clone().invert());
    validate(childToParent, "childToParent");

    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    childToParent.decompose(position, rotation, scale);

    // Scene Object3D TRS cannot represent shear. Refuse to silently
    // misalign attachments when combining nonuniform scaled frames.
    const recovered = new THREE.Matrix4().compose(
        position, rotation, scale
    );
    const values = childToParent.elements;
    const error = Math.max(...values.map((value, index) =>
        Math.abs(value - recovered.elements[index]!)
    ));
    const magnitude = Math.max(1, ...values.map(Math.abs));
    if (
        ![...position.toArray(), ...rotation.toArray(), ...scale.toArray()]
            .every(Number.isFinite) ||
        !Number.isFinite(error) ||
        error > 1e-9 * magnitude
    ) {
        throw new RangeError(
            "Attachment transform contains shear unsupported by Object3D"
        );
    }

    parent.add(child);
    child.position.copy(position);
    child.quaternion.copy(rotation);
    child.scale.copy(scale);
    child.updateMatrix();
    return child;
}
