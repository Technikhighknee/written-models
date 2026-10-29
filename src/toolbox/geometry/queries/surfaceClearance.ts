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

export interface ClearanceOptions {
    /** Required unsigned surface-to-surface distance, in world metres. */
    minimum: number;
    precision?: GeometryPrecision;
}

export interface ClearanceResult {
    closestDistance: number;
    /** Finite triangles touch or cross, within the configured tolerance. */
    intersects: boolean;
    meetsMinimum: boolean;
}

type Triangle = WorldSurfaceTriangle["points"];
const EDGES = [[0, 1], [1, 2], [2, 0]] as const;

function closestOnTriangle(point: THREE.Vector3, triangle: Triangle): THREE.Vector3 {
    return new THREE.Triangle(...triangle)
        .closestPointToPoint(point, new THREE.Vector3());
}

/** Clamped closest points on two finite segments, including parallel edges. */
function segmentDistanceSq(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    q0: THREE.Vector3,
    q1: THREE.Vector3
): number {
    const u = p1.clone().sub(p0);
    const v = q1.clone().sub(q0);
    const w = p0.clone().sub(q0);
    const a = u.dot(u);
    const b = u.dot(v);
    const c = v.dot(v);
    const d = u.dot(w);
    const e = v.dot(w);
    const determinant = a * c - b * b;
    const scale = a * c;
    let s: number;
    let t: number;

    // The triangle validator guarantees nonzero edge lengths.
    if (determinant <= Number.EPSILON * scale) {
        s = 0;
        t = THREE.MathUtils.clamp(e / c, 0, 1);
    } else {
        s = THREE.MathUtils.clamp((b * e - c * d) / determinant, 0, 1);
        t = THREE.MathUtils.clamp((a * e - b * d) / determinant, 0, 1);

        // Re-clamp against the other segment after constraining either end.
        s = THREE.MathUtils.clamp((b * t - d) / a, 0, 1);
        t = THREE.MathUtils.clamp((b * s + e) / c, 0, 1);
    }

    return p0.clone().addScaledVector(u, s)
        .distanceToSquared(q0.clone().addScaledVector(v, t));
}

/** An edge can pierce the interior of a triangle without either end touching it. */
function edgePiercesTriangle(
    start: THREE.Vector3,
    end: THREE.Vector3,
    triangle: Triangle,
    tolerance: number
): boolean {
    const [a, b, c] = triangle;
    const normal = new THREE.Vector3().subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const first = start.clone().sub(a).dot(normal);
    const last = end.clone().sub(a).dot(normal);

    if ((first > tolerance && last > tolerance) ||
        (first < -tolerance && last < -tolerance) ||
        Math.abs(first - last) <= tolerance) {
        return false;
    }

    const t = first / (first - last);
    if (t < 0 || t > 1) return false;

    const contact = start.clone()
        .lerp(end, t);
    const weights = THREE.Triangle.getBarycoord(
        contact, a, b, c, new THREE.Vector3()
    );
    if (!weights) return false;

    const extent = Math.max(
        a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)
    );
    const error = tolerance / extent;
    return weights.x >= -error &&
        weights.y >= -error &&
        weights.z >= -error;
}

function triangleDistanceSq(
    first: Triangle,
    second: Triangle,
    tolerance: number
): number {
    // Crossing interiors matter even when all six vertices have clearance.
    for (const [i, j] of EDGES) {
        if (edgePiercesTriangle(
            first[i], first[j], second, tolerance
        ) || edgePiercesTriangle(
            second[i], second[j], first, tolerance
        )) return 0;
    }

    let closest = Infinity;

    for (const point of first) {
        closest = Math.min(closest, point.distanceToSquared(
            closestOnTriangle(point, second)
        ));
    }
    for (const point of second) {
        closest = Math.min(closest, point.distanceToSquared(
            closestOnTriangle(point, first)
        ));
    }

    // Also handles coplanar crossing edges and skew closest approaches.
    for (const [i, j] of EDGES) {
        for (const [k, l] of EDGES) {
            closest = Math.min(closest, segmentDistanceSq(
                first[i], first[j], second[k], second[l]
            ));
        }
    }

    return closest;
}

function boxDistanceSq(a: THREE.Box3, b: THREE.Box3): number {
    let distance = 0;
    for (const axis of ["x", "y", "z"] as const) {
        const gap = Math.max(
            0,
            a.min[axis] - b.max[axis],
            b.min[axis] - a.max[axis]
        );
        distance += gap * gap;
    }
    return distance;
}

export function triangleSurfaceDistance(
    first: readonly WorldSurfaceTriangle[],
    second: readonly WorldSurfaceTriangle[],
    tolerance: number
): number {
    if (!first.length || !second.length) {
        throw new GeometryOperationError(
            "surfaceClearance", "invalid-input",
            "Clearance requires two nonempty finite surfaces"
        );
    }

    const boxes = second.map(face =>
        new THREE.Box3().setFromPoints([...face.points])
    );
    let distanceSq = Infinity;

    for (const triangle of first) {
        const bounds = new THREE.Box3().setFromPoints([...triangle.points]);

        for (let i = 0; i < second.length; i++) {
            if (boxDistanceSq(bounds, boxes[i]!) > distanceSq) continue;
            distanceSq = Math.min(distanceSq, triangleDistanceSq(
                triangle.points, second[i]!.points, tolerance
            ));
            if (distanceSq === 0) return 0;
        }
    }

    return Math.sqrt(distanceSq);
}

/**
 * The unsigned distance between finite authored triangle surfaces.
 * Includes face interiors, edge crossings and coplanar overlaps.
 * It says nothing about whether one nonintersecting solid contains another.
 */
export function surfaceClearance(
    first: SurfaceTarget,
    second: SurfaceTarget,
    options: ClearanceOptions
): ClearanceResult {
    if (!options || !Number.isFinite(options.minimum) ||
        options.minimum < 0) {
        throw new GeometryOperationError(
            "surfaceClearance", "invalid-input",
            "Minimum clearance must be finite and nonnegative"
        );
    }

    const policy = resolvePrecision(options.precision);
    const a = surfaceTriangles(first, policy, "surfaceClearance");
    const b = surfaceTriangles(second, policy, "surfaceClearance");
    const positions = [...a, ...b].flatMap(face => face.points);
    const extent = new THREE.Box3().setFromPoints(positions)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);
    const actual = triangleSurfaceDistance(a, b, tolerance);
    const intersects = actual <= tolerance;
    const closestDistance = intersects ? 0 : actual;

    return {
        closestDistance,
        intersects,
        meetsMinimum: closestDistance + tolerance >= options.minimum
    };
}
