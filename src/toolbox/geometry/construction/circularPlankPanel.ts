import * as THREE from "three";
import { extrude } from "../../shapes/operations/extrude";

export interface CircularPlankPanelOptions {
    planks: number;
    thickness: number;
    radialSegments?: number;
}

type Point = readonly [number, number];

/**
 * Cut a circular panel into independent parallel boards.
 *
 * The boards share exactly the same cutting lines. They touch without
 * gaps, while the assembled outline retains a single circular silhouette.
 * Each returned solid has planar faces and real edge thickness.
 *
 * This is useful for coopered barrel heads, round wooden tabletops and
 * other panels whose boards are trimmed together after assembly.
 */
export function circularPlankPanel(
    radius: number,
    {
        planks,
        thickness,
        radialSegments = 48
    }: CircularPlankPanelOptions
): THREE.ExtrudeGeometry[] {
    if (
        !Number.isFinite(radius) || radius <= 0 ||
        !Number.isFinite(thickness) || thickness <= 0 ||
        !Number.isInteger(planks) || planks < 2 ||
        !Number.isInteger(radialSegments) || radialSegments < 8
    ) {
        throw new RangeError("Invalid circular plank panel dimensions");
    }

    // Build the perimeter once. All planks are then clipped against
    // this same polygon, so no independently rounded ends can drift apart.
    const circle: Point[] = Array.from(
        { length: radialSegments },
        (_, i) => {
            const angle = (i * Math.PI * 2) / radialSegments;
            return [
                radius * Math.cos(angle),
                radius * Math.sin(angle)
            ];
        }
    );

    const cuts = Array.from(
        { length: planks + 1 },
        (_, i) => -radius + (2 * radius * i) / planks
    );

    const pieces: THREE.ExtrudeGeometry[] = [];

    for (let i = 0; i < planks; i++) {
        const clipped = clipAtX(
            clipAtX(circle, cuts[i]!, true),
            cuts[i + 1]!,
            false
        );

        // Avoid passing a seam endpoint twice to Shape / ExtrudeGeometry.
        const outline = removeConsecutiveDuplicates(clipped, radius * 1e-10);

        if (outline.length < 3) {
            throw new RangeError("Panel plank has no usable area");
        }

        const shape = new THREE.Shape();
        shape.moveTo(...outline[0]!);

        for (const point of outline.slice(1)) {
            shape.lineTo(...point);
        }

        shape.closePath();
        pieces.push(extrude(shape, { thickness, curveSegments: 1 }));
    }

    return pieces;
}

function clipAtX(
    polygon: readonly Point[],
    boundary: number,
    keepRight: boolean
): Point[] {
    const result: Point[] = [];

    for (let i = 0; i < polygon.length; i++) {
        const start = polygon[i]!;
        const end = polygon[(i + 1) % polygon.length]!;
        const startInside = keepRight
            ? start[0] >= boundary
            : start[0] <= boundary;
        const endInside = keepRight
            ? end[0] >= boundary
            : end[0] <= boundary;

        if (startInside !== endInside) {
            const t = (boundary - start[0]) / (end[0] - start[0]);
            result.push([
                boundary,
                start[1] + t * (end[1] - start[1])
            ]);
        }

        if (endInside) result.push(end);
    }

    return result;
}

function removeConsecutiveDuplicates(
    points: readonly Point[],
    epsilon: number
): Point[] {
    const unique: Point[] = [];

    for (const point of points) {
        const previous = unique.at(-1);

        if (
            !previous ||
            Math.hypot(point[0] - previous[0], point[1] - previous[1]) > epsilon
        ) {
            unique.push(point);
        }
    }

    if (unique.length > 1) {
        const first = unique[0]!;
        const last = unique.at(-1)!;

        if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= epsilon) {
            unique.pop();
        }
    }

    return unique;
}
