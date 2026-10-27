import * as THREE from "three";

/**
 * A right-handed local frame at any surface contact.
 * Local +Y points outward from the surface. Local +X follows the supplied
 * in-plane hint (projected onto the tangent plane); +Z completes the basis.
 *
 * Unlike a generic two-vector rotation, this also fixes the rotation
 * AROUND the normal: rectangular mounts do not arbitrarily flip sideways.
 */
export function contactFrame(
    point: THREE.Vector3Like,
    normal: THREE.Vector3Like,
    tangentHint: THREE.Vector3Like
): THREE.Matrix4 {
    const vectors = [point, normal, tangentHint];
    if (vectors.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) {
        throw new RangeError("Invalid contact frame coordinates");
    }
    const y = new THREE.Vector3(normal.x, normal.y, normal.z);
    const x = new THREE.Vector3(
        tangentHint.x, tangentHint.y, tangentHint.z
    );
    if (y.lengthSq() < 1e-16 || x.lengthSq() < 1e-16) {
        throw new RangeError("Invalid contact frame axes");
    }
    y.normalize();
    x.addScaledVector(y, -x.dot(y));
    if (x.lengthSq() < 1e-16) {
        throw new RangeError("Frame tangent must not be parallel to normal");
    }
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    return new THREE.Matrix4().makeBasis(x, y, z).setPosition(
        point.x, point.y, point.z
    );
}
