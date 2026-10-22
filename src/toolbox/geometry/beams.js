import * as THREE from "three";

/**
 * @param {THREE.Vector3Like} start 
 * @param {THREE.Vector3Like} end 
 * @param {number} width 
 * @param {number} depth 
 * @param {THREE.Material} material 
 * @returns {THREE.Mesh}
 */
export function createBeamBetween(start, end, width, depth, material) {
    const direction = new THREE.Vector3()
        .subVectors(end, start);
    
    const length = direction.length();

    if (length <= 0) {
        throw new Error("Beam requires two distinct points");
    }

    const geometry = new THREE.BoxGeometry(width, length, depth);

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