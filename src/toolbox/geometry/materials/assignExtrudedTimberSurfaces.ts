import * as THREE from "three";
import { classifyExtrudedSurfaces } from "./classifyExtrudedSurfaces";

/**
 * Timber convenience adapter for a generic extrusion-face orientation
 * classifier: broad faces and long-grain sides use slot 0, genuine
 * transverse cuts use slot 1.
 */
export function assignExtrudedTimberSurfaces<T extends THREE.BufferGeometry>(
    geometry: T,
    grainAxis: THREE.Vector3Like,
    cutThreshold = 0.68
): T {
    return classifyExtrudedSurfaces(geometry, {
        axis: grainAxis,
        threshold: cutThreshold,
        capMaterial: 0,
        alignedMaterial: 1,
        transverseMaterial: 0
    });
}
