import * as THREE from "three";
import { boxMesh, BOX_SURFACES } from "./boxMesh";
import { toBufferGeometry } from "../mesh/toBufferGeometry";

export function createBeamBetween(
    start: THREE.Vector3Like,
    end: THREE.Vector3Like,
    width: number,
    depth: number,
    material: THREE.Material | THREE.Material[]
): THREE.Mesh {
    const direction = new THREE.Vector3()
        .subVectors(end, start);
    
    const length = direction.length();

    if (length <= 0) {
        throw new Error("Beam requires two distinct points");
    }

    const geometry = toBufferGeometry(
        boxMesh({ width, height: length, depth }),
        BOX_SURFACES
    );

    const beam = new THREE.Mesh(geometry, material);

    // Position at the middlepoint
    beam.position
        .copy(start)
        .add(end)
        .multiplyScalar(0.5);
    
    // Align the local Y-axis with the direction
    beam.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize()
    );

    return beam;
}
