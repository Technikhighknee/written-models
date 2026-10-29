import * as THREE from "three";

export interface EllipticalRingOptions {
    center: THREE.Vector3Like;
    /** First in-plane direction (cosine component). */
    axisU: THREE.Vector3Like;
    /** Perpendicular in-plane direction (sine component). */
    axisV: THREE.Vector3Like;
    radiusU: number;
    radiusV: number;
    segments?: number;
    phase?: number;
}

/**
 * An authored elliptical cross-section in any 3D plane.
 *
 * The choice and order of axes control winding. Supply the same axes
 * and segment count for all stations of a loft; their indices then
 * follow one another without triangulated seams or intermediate caps.
 *
 * Useful for handles, collars, lathed fittings, shaft joints, and
 * elliptical sections of a bent bar.
 */
export function ellipticalRing({
    center, axisU, axisV, radiusU, radiusV,
    segments = 12, phase = 0
}: EllipticalRingOptions): THREE.Vector3[] {
    const coordinates = [
        center.x, center.y, center.z,
        axisU.x, axisU.y, axisU.z,
        axisV.x, axisV.y, axisV.z,
        radiusU, radiusV, phase
    ];

    if (
        coordinates.some(value => !Number.isFinite(value)) ||
        radiusU <= 0 || radiusV <= 0 ||
        !Number.isInteger(segments) || segments < 3
    ) {
        throw new RangeError("Invalid elliptical ring parameters");
    }

    const u = new THREE.Vector3(axisU.x, axisU.y, axisU.z);
    const v = new THREE.Vector3(axisV.x, axisV.y, axisV.z);
    if (
        u.lengthSq() < 1e-16 || v.lengthSq() < 1e-16 ||
        Math.abs(u.normalize().dot(v.normalize())) > 1e-6
    ) {
        throw new RangeError("Elliptical ring axes must be perpendicular");
    }

    const origin = new THREE.Vector3(center.x, center.y, center.z);
    return Array.from({ length: segments }, (_, index) => {
        const angle = phase + 2 * Math.PI * index / segments;
        return origin.clone()
            .addScaledVector(u, radiusU * Math.cos(angle))
            .addScaledVector(v, radiusV * Math.sin(angle));
    });
}
