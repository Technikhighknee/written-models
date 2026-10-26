import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftSections } from "./loftSections";

/** A supporting surface, in the same coordinate space as the beam. */
export interface BeamContactPlane {
    point: THREE.Vector3Like;
    /** Normal pointing OUT of the support, toward the exposed beam. */
    normal: THREE.Vector3Like;
}

export interface BeamBetweenPlanesOptions {
    start: BeamContactPlane;
    end: BeamContactPlane;
    width: number;
    depth: number;
}

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const MIN_CONTACT_COSINE = 0.05;

/**
 * Builds a closed, quad-only beam fitted exactly against two planes.
 *
 * A regular box cut perpendicular to its own axis cannot sit flush against
 * BOTH a horizontal foot and a vertical upright. Here every cross-section
 * corner travels parallel to the beam axis until it hits its actual contact
 * plane. No visual overlapping, guessed extensions or boolean operations.
 *
 * The planes' outward normals must face the exposed span. Both normals and
 * contact points may be arbitrarily oriented, as long as the beam axis
 * crosses each plane transversely. The control mesh retains real end-grain
 * faces ("cap-start", "cap-end") and physical meter UVs along the fiber.
 */
export function beamBetweenPlanes({
    start,
    end,
    width,
    depth
}: BeamBetweenPlanesOptions): MeshData {
    const startPoint = new THREE.Vector3(start.point.x, start.point.y, start.point.z);
    const endPoint = new THREE.Vector3(end.point.x, end.point.y, end.point.z);
    const startNormal = new THREE.Vector3(start.normal.x, start.normal.y, start.normal.z);
    const endNormal = new THREE.Vector3(end.normal.x, end.normal.y, end.normal.z);

    if (
        ![width, depth, ...startPoint.toArray(), ...endPoint.toArray(),
            ...startNormal.toArray(), ...endNormal.toArray()]
            .every(Number.isFinite) ||
        width <= 0 || depth <= 0 ||
        startNormal.lengthSq() < 1e-12 ||
        endNormal.lengthSq() < 1e-12
    ) {
        throw new RangeError("Invalid beam dimensions or contact planes");
    }

    const axis = endPoint.clone().sub(startPoint);
    const length = axis.length();

    if (length <= 1e-8) {
        throw new RangeError("Beam contact points must be distinct");
    }

    axis.divideScalar(length);
    startNormal.normalize();
    endNormal.normalize();

    const startDot = axis.dot(startNormal);
    const endDot = axis.dot(endNormal);

    if (startDot < MIN_CONTACT_COSINE || endDot > -MIN_CONTACT_COSINE) {
        throw new RangeError(
            "Contact planes must face the exposed span and intersect the beam axis"
        );
    }

    // Beam-local +Y follows the centerline; XY/Z cross-section is constant
    // along the beam even when the end cuts have different slopes.
    const rotation = new THREE.Quaternion()
        .setFromUnitVectors(AXIS_Y, axis);

    const offsets = [
        new THREE.Vector3(-width / 2, 0, -depth / 2),
        new THREE.Vector3(-width / 2, 0, depth / 2),
        new THREE.Vector3(width / 2, 0, depth / 2),
        new THREE.Vector3(width / 2, 0, -depth / 2)
    ].map(offset => offset.applyQuaternion(rotation));

    const startSection: THREE.Vector3[] = [];
    const endSection: THREE.Vector3[] = [];

    for (const offset of offsets) {
        const rayOrigin = startPoint.clone().add(offset);

        const alongStart = startNormal.dot(
            startPoint.clone().sub(rayOrigin)
        ) / startDot;
        const alongEnd = endNormal.dot(
            endPoint.clone().sub(rayOrigin)
        ) / endDot;

        if (
            !Number.isFinite(alongStart) ||
            !Number.isFinite(alongEnd) ||
            alongEnd - alongStart <= 1e-6
        ) {
            throw new RangeError("Beam cuts intersect or invert the timber");
        }

        startSection.push(rayOrigin.clone().addScaledVector(axis, alongStart));
        endSection.push(rayOrigin.clone().addScaledVector(axis, alongEnd));
    }

    return loftSections([startSection, endSection]);
}
