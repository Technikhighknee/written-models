import * as THREE from "three";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import {
    surfaceTriangles,
    type SurfaceTarget,
    type WorldSurfaceTriangle
} from "./surfaceTriangles";
import { surfaceClearance } from "./surfaceClearance";

export interface ExteriorPlacementOptions {
    /** Required clearance in world metres, on the support's outward side. */
    minimum: number;
    precision?: GeometryPrecision;
}

export interface ExteriorPlacementResult {
    exterior: boolean;
    intersects: boolean;
    ambiguous: boolean;
    /** Smallest measured outward normal component at tested stations. */
    minimumSignedDistance: number;
}

function stationSide(
    point: THREE.Vector3,
    support: readonly WorldSurfaceTriangle[],
    tolerance: number
): { signed: number; ambiguous: boolean } {
    const nearest = new THREE.Vector3();
    let best = Infinity;
    let minSign = Infinity;
    let maxSign = -Infinity;

    for (const face of support) {
        const [a, b, c] = face.points;
        new THREE.Triangle(a, b, c)
            .closestPointToPoint(point, nearest);
        const delta = point.clone().sub(nearest);
        const distance = delta.length();

        if (distance < best - tolerance) {
            best = distance;
            minSign = maxSign = delta.dot(face.normal);
        } else if (distance <= best + tolerance) {
            const signed = delta.dot(face.normal);
            minSign = Math.min(minSign, signed);
            maxSign = Math.max(maxSign, signed);
        }
    }

    return {
        signed: minSign,
        ambiguous: minSign <= tolerance && maxSign >= -tolerance
    };
}

/**
 * Check the *orientation* of a fitted candidate against its support.
 *
 * This is deliberately separate from unsigned triangle clearance:
 * an internal nested band can have exactly the same unsigned clearance
 * as an external one. For open/nonmanifold supports this is a local
 * normal-side diagnostic, not a proof of solid containment.
 *
 * Triangle edges and interiors are checked for crossings by
 * surfaceClearance; vertices, edge midpoints and face centroids are
 * tested for the outward side.
 */
export function verifyExteriorPlacement(
    candidate: SurfaceTarget,
    support: SurfaceTarget,
    options: ExteriorPlacementOptions
): ExteriorPlacementResult {
    if (!options || !Number.isFinite(options.minimum) ||
        options.minimum < 0) {
        throw new GeometryOperationError(
            "verifyExteriorPlacement", "invalid-input",
            "Minimum outward clearance must be finite and nonnegative"
        );
    }

    const precision = resolvePrecision(options.precision);
    const a = surfaceTriangles(candidate, precision, "verifyExteriorPlacement");
    const b = surfaceTriangles(support, precision, "verifyExteriorPlacement");

    if (!a.length || !b.length) {
        throw new GeometryOperationError(
            "verifyExteriorPlacement", "invalid-input",
            "Exterior placement requires two nonempty surfaces"
        );
    }

    const bounds = new THREE.Box3().setFromPoints(
        [...a, ...b].flatMap(face => face.points)
    );
    const tolerance = lengthTolerance(
        precision, bounds.getSize(new THREE.Vector3()).length()
    );
    const clearance = surfaceClearance(candidate, support, {
        minimum: options.minimum,
        precision
    });

    let smallest = Infinity;
    let ambiguous = false;

    for (const face of a) {
        const points = face.points;
        const samples = [
            ...points,
            points[0].clone().add(points[1]).multiplyScalar(0.5),
            points[1].clone().add(points[2]).multiplyScalar(0.5),
            points[2].clone().add(points[0]).multiplyScalar(0.5),
            points[0].clone().add(points[1]).add(points[2])
                .multiplyScalar(1 / 3)
        ];

        for (const sample of samples) {
            const side = stationSide(sample, b, tolerance);
            smallest = Math.min(smallest, side.signed);
            ambiguous ||= side.ambiguous;
        }
    }

    return {
        exterior: !clearance.intersects &&
            clearance.meetsMinimum && !ambiguous &&
            smallest + tolerance >= options.minimum &&
            smallest > tolerance,
        intersects: clearance.intersects,
        ambiguous,
        minimumSignedDistance: smallest
    };
}
