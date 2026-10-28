import * as THREE from "three";
import {getControlMesh} from "../mesh/toBufferGeometry";
import type {ContactPlane} from "./sectionsBetweenPlanes";

/**
 * Find an actual planar side of an authored support mesh facing a direction.
 * This uses the construction faces, not a guessed axis-aligned bounding box.
 */
export function supportFacePlane(
    target: THREE.Mesh,
    toward: THREE.Vector3Like
): ContactPlane {
    const mesh = getControlMesh(target.geometry);
    if (!mesh) {
        throw new RangeError("Support has no authored control geometry");
    }
    const direction = new THREE.Vector3(toward.x, toward.y, toward.z);
    if (![direction.x, direction.y, direction.z].every(Number.isFinite) ||
        direction.lengthSq() < 1e-12) {
        throw new RangeError("Invalid support-facing direction");
    }
    direction.normalize();
    target.updateWorldMatrix(true, false);

    const center = new THREE.Vector3();
    for (const vertex of mesh.vertices) {
        center.add(vertex);
    }
    center.divideScalar(mesh.vertices.length).applyMatrix4(target.matrixWorld);

    let best: ContactPlane | undefined;
    let alignment = 0.9;

    for (const face of mesh.quads) {
        if (!face.surface.startsWith("side-")) continue;
        const [a, b, c, d] = face.corners.map(index =>
            mesh.vertices[index]!.clone().applyMatrix4(target.matrixWorld)
        );
        const normal = b!.clone().sub(a!).cross(c!.clone().sub(a!));
        if (normal.lengthSq() < 1e-16) continue;
        normal.normalize();
        if (Math.abs(normal.dot(d!.clone().sub(a!))) > 1e-6) continue;

        const faceCenter = a!.clone().add(b!).add(c!).add(d!).multiplyScalar(0.25);
        if (normal.dot(faceCenter.clone().sub(center)) < 0) normal.negate();

        const score = normal.dot(direction);
        if (score > alignment) {
            alignment = score;
            best = {point: faceCenter, normal};
        }
    }

    if (!best) {
        throw new RangeError("No planar support face matches the direction");
    }
    return best;
}

/**
 * Intersect a requested joint centerline with a real support-face plane.
 * The point is moved only along the supplied axis; its other coordinates
 * remain exactly where the assembly designer placed the joint.
 */
export function pointOnContactPlane(
    plane: ContactPlane,
    near: THREE.Vector3Like,
    axis: THREE.Vector3Like
): THREE.Vector3 {
    const normal = new THREE.Vector3(
        plane.normal.x, plane.normal.y, plane.normal.z
    ).normalize();
    const point = new THREE.Vector3(near.x, near.y, near.z);
    const direction = new THREE.Vector3(axis.x, axis.y, axis.z);
    const denominator = direction.dot(normal);
    if (![...point.toArray(), ...direction.toArray()].every(Number.isFinite) ||
        Math.abs(denominator) < 0.05) {
        throw new RangeError("Joint centerline is parallel to its contact plane");
    }
    const support = new THREE.Vector3(
        plane.point.x, plane.point.y, plane.point.z
    );
    return point.addScaledVector(
        direction, normal.dot(support.sub(point)) / denominator
    );
}
