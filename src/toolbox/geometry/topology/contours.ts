import * as THREE from "three";
import type { Profile2 } from "../definitions/geometry";

export type ContourWinding = "clockwise" | "counterclockwise";

/**
 * Remove consecutive duplicate stations and a repeated closing point.
 * No sorting, shape simplification, or change in winding is performed.
 */
export function cleanContour2(
    points: readonly THREE.Vector2Like[],
    tolerance = 1e-10
): THREE.Vector2[] {
    if (
        !Array.isArray(points) ||
        !Number.isFinite(tolerance) ||
        tolerance < 0 ||
        points.some(point =>
            !point || ![point.x, point.y].every(Number.isFinite)
        )
    ) {
        throw new RangeError("Invalid closed contour");
    }

    const squared = tolerance * tolerance;
    const cleaned: THREE.Vector2[] = [];

    for (const point of points) {
        const next = new THREE.Vector2(point.x, point.y);

        if (
            cleaned.length === 0 ||
            next.distanceToSquared(cleaned[cleaned.length - 1]!) > squared
        ) {
            cleaned.push(next);
        }
    }

    while (
        cleaned.length > 1 &&
        cleaned[0]!.distanceToSquared(cleaned[cleaned.length - 1]!) <= squared
    ) {
        cleaned.pop();
    }

    if (
        cleaned.length < 3 ||
        Math.abs(THREE.ShapeUtils.area(cleaned)) <= squared
    ) {
        throw new RangeError("Collapsed closed contour");
    }

    return cleaned;
}

/** Determine winding without modifying the source's seam or station order. */
export function contourWinding(
    points: readonly THREE.Vector2Like[]
): ContourWinding {
    if (points.length < 3) {
        throw new RangeError("Contour must have at least three points");
    }

    // Translate before the shoelace sum to avoid multiplying huge
    // world-space positions when the actual profile is small.
    const origin = points[0]!;
    let doubledArea = 0;

    for (let i = 1; i < points.length - 1; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        doubledArea += (a.x - origin.x) * (b.y - origin.y) -
            (a.y - origin.y) * (b.x - origin.x);
    }

    if (!Number.isFinite(doubledArea) || doubledArea === 0) {
        throw new RangeError("Contour has no defined winding");
    }

    return doubledArea > 0 ? "counterclockwise" : "clockwise";
}

/**
 * Orient a cleaned contour while preserving the authored first station.
 * The seam remains at index zero even when winding is reversed.
 */
export function orientContour2(
    points: readonly THREE.Vector2Like[],
    winding: ContourWinding,
    tolerance = 1e-10
): THREE.Vector2[] {
    if (winding !== "clockwise" && winding !== "counterclockwise") {
        throw new RangeError("Invalid contour winding");
    }

    const cleaned = cleanContour2(points, tolerance);

    if (contourWinding(cleaned) !== winding) {
        return [cleaned[0]!, ...cleaned.slice(1).reverse()];
    }

    return cleaned;
}

/** Outer and hole winding follows the shared CCW/CW profile convention. */
export function orientProfile2(
    profile: Profile2,
    tolerance = 1e-10
): Profile2 {
    if (!profile.outer.closed ||
        profile.holes?.some(hole => !hole.closed)) {
        throw new RangeError("Profile requires closed contours");
    }

    return {
        outer: {
            points: orientContour2(
                profile.outer.points, "counterclockwise", tolerance
            ),
            closed: true
        },
        ...(profile.holes === undefined ? {} : {
            holes: profile.holes.map(hole => ({
                points: orientContour2(
                    hole.points, "clockwise", tolerance
                ),
                closed: true
            }))
        })
    };
}

/**
 * Union already authored station sequences, preserving exact parameters.
 * Consumers must use the resulting list when they share an interface.
 */
export function mergeStations(
    stationSets: readonly (readonly number[])[]
): number[] {
    if (stationSets.length === 0) {
        throw new RangeError("No station sets to merge");
    }

    for (const stations of stationSets) {
        if (
            stations.length < 2 ||
            stations[0] !== 0 ||
            stations.at(-1) !== 1 ||
            stations.some((t, index) =>
                !Number.isFinite(t) ||
                t < 0 || t > 1 ||
                (index > 0 && t <= stations[index - 1]!)
            )
        ) {
            throw new RangeError("Invalid sampling stations");
        }
    }

    return [...new Set(stationSets.flat())].sort((a, b) => a - b);
}
