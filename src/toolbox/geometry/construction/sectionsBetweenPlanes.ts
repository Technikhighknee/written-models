import * as THREE from "three";

export interface ContactPlane {
    point: THREE.Vector3Like;
    /** Unit-independent normal pointing out of the support. */
    normal: THREE.Vector3Like;
}

export interface SectionsBetweenPlanesOptions {
    start: ContactPlane;
    end: ContactPlane;
    /** Arbitrary closed cross-section in the beam-local XZ plane. */
    section: readonly THREE.Vector2Like[];
}

/**
 * Fit any planar section between two support planes.
 *
 * Rays through corresponding cross-section corners travel along the
 * centerline. Each endpoint intersects its own target plane exactly.
 * A shared calculation works for beams, braces, struts, pipes, bars
 * and asymmetric polygonal profiles, without assuming timber or quads.
 *
 * The returned rings are expressed in the caller's coordinate system.
 * Pass them as authored sections to loftSectionWalls and finish the
 * selected ends with capBoundary.
 */
export function sectionsBetweenPlanes({
    start, end, section
}: SectionsBetweenPlanesOptions): [
    startSection: THREE.Vector3[], endSection: THREE.Vector3[]
] {
    const startPoint = new THREE.Vector3(
        start.point.x, start.point.y, start.point.z
    );
    const endPoint = new THREE.Vector3(
        end.point.x, end.point.y, end.point.z
    );
    const startNormal = new THREE.Vector3(
        start.normal.x, start.normal.y, start.normal.z
    );
    const endNormal = new THREE.Vector3(
        end.normal.x, end.normal.y, end.normal.z
    );
    if (section.length < 3 ||
        [...startPoint.toArray(), ...endPoint.toArray(),
            ...startNormal.toArray(), ...endNormal.toArray()]
            .some(value => !Number.isFinite(value)) ||
        section.some(p => ![p.x, p.y].every(Number.isFinite)) ||
        startNormal.lengthSq() < 1e-16 ||
        endNormal.lengthSq() < 1e-16) {
        throw new RangeError("Invalid section or contact planes");
    }

    const axis = endPoint.clone().sub(startPoint);
    const length = axis.length();
    if (length <= 1e-8) {
        throw new RangeError("Contact planes must be separated");
    }
    axis.divideScalar(length);
    startNormal.normalize();
    endNormal.normalize();

    const startDot = axis.dot(startNormal);
    const endDot = axis.dot(endNormal);
    // Near-grazing intersections magnify geometric error without bound.
    if (startDot < 0.05 || endDot > -0.05) {
        throw new RangeError("Both contact planes must face the free span");
    }

    const rotate = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), axis
    );
    const startSection: THREE.Vector3[] = [];
    const endSection: THREE.Vector3[] = [];
    for (const p of section) {
        const offset = new THREE.Vector3(p.x, 0, p.y)
            .applyQuaternion(rotate);
        const origin = startPoint.clone().add(offset);
        const alongStart = startNormal.dot(
            startPoint.clone().sub(origin)
        ) / startDot;
        const alongEnd = endNormal.dot(
            endPoint.clone().sub(origin)
        ) / endDot;
        if (!Number.isFinite(alongStart) ||
            !Number.isFinite(alongEnd) ||
            alongEnd - alongStart <= 1e-6) {
            throw new RangeError("Fitted cross-sections intersect or invert");
        }
        startSection.push(origin.clone().addScaledVector(axis, alongStart));
        endSection.push(origin.clone().addScaledVector(axis, alongEnd));
    }

    return [startSection, endSection];
}
