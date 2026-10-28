import * as THREE from "three";
import { GeometryOperationError } from "./GeometryOperationError";

export interface GeometryPrecision {
    absoluteLength: number;
    relativeLength: number;
    angle: number;
}

export const DEFAULT_GEOMETRY_PRECISION: Readonly<GeometryPrecision> =
    Object.freeze({
        absoluteLength: 1e-9,
        relativeLength: 1e-9,
        angle: 1e-7
    });

export function resolvePrecision(
    precision: GeometryPrecision = DEFAULT_GEOMETRY_PRECISION
): GeometryPrecision {
    if (
        !precision ||
        !Number.isFinite(precision.absoluteLength) ||
        precision.absoluteLength <= 0 ||
        !Number.isFinite(precision.relativeLength) ||
        precision.relativeLength < 0 ||
        !Number.isFinite(precision.angle) ||
        precision.angle <= 0 ||
        precision.angle >= Math.PI / 2
    ) {
        throw new GeometryOperationError(
            "precision", "invalid-input", "Invalid geometry precision"
        );
    }

    return { ...precision };
}

/** Uses the extent participating in this operation, not world position. */
export function lengthTolerance(
    precision: GeometryPrecision,
    extentMeters: number
): number {
    if (!Number.isFinite(extentMeters) || extentMeters < 0) {
        throw new GeometryOperationError(
            "precision", "invalid-input", "Invalid geometry extent"
        );
    }

    return Math.max(
        precision.absoluteLength,
        precision.relativeLength * extentMeters
    );
}

/** Validate an affine transform by normalized, not absolute determinant. */
export function assertAffineTransform(
    matrix: THREE.Matrix4,
    operation: string,
    precision: GeometryPrecision
): void {
    const e = matrix.elements;

    if (
        !e.every(Number.isFinite) ||
        e[3] !== 0 || e[7] !== 0 || e[11] !== 0 || e[15] !== 1
    ) {
        throw new GeometryOperationError(
            operation, "invalid-input", "Expected a finite affine transform"
        );
    }

    const x = new THREE.Vector3(e[0], e[1], e[2]);
    const y = new THREE.Vector3(e[4], e[5], e[6]);
    const z = new THREE.Vector3(e[8], e[9], e[10]);
    const lengths = [x.length(), y.length(), z.length()];

    if (lengths.some(length => !(length > 0))) {
        throw new GeometryOperationError(
            operation, "invalid-input", "Noninvertible affine transform"
        );
    }

    const volumeScale = x.dot(new THREE.Vector3().crossVectors(y, z)) /
        (lengths[0]! * lengths[1]! * lengths[2]!);

    if (!Number.isFinite(volumeScale) ||
        Math.abs(volumeScale) <= Math.sin(precision.angle)) {
        throw new GeometryOperationError(
            operation, "invalid-input", "Near-singular affine transform"
        );
    }
}

/** Validate triangles using physical edges and angles, not a fixed area cutoff. */
export function triangleQuality(
    a: THREE.Vector3Like,
    b: THREE.Vector3Like,
    c: THREE.Vector3Like,
    precision: GeometryPrecision
): boolean {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const bc = new THREE.Vector3().subVectors(c, b);
    const first = ab.length();
    const second = ac.length();
    const third = bc.length();
    const extent = Math.max(first, second, third);
    const tolerance = lengthTolerance(precision, extent);

    if (![first, second, third].every(length =>
        Number.isFinite(length) && length > tolerance
    )) return false;

    const areaTwice = new THREE.Vector3().crossVectors(ab, ac).length();
    return Number.isFinite(areaTwice) &&
        areaTwice / (first * second) > Math.sin(precision.angle);
}
