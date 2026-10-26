import * as THREE from "three";
import { extrude } from "../../shapes/operations/extrude";
import { seamedPlankExtrusion } from "./seamedPlankExtrusion";

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
    validatePanel(radius, planks, thickness, radialSegments);

    const outlines = circularPlankOutlines(radius, planks, radialSegments);
    const pieces: THREE.ExtrudeGeometry[] = [];

    for (const outline of outlines) {
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


/**
 * Closed, visibly seamed version of circularPlankPanel(). The solid side
 * walls of adjacent planks still meet all the way through the middle of
 * their thickness; only the visible broad faces are recessed at the joints.
 *
 * Reuses the same shared clipped circular outlines as the plain panel.
 * Returned geometries contain long-grain material slot 0 and end-grain
 * slot 1, ready for the existing wood material families.
 */
export function groovedCircularPlankPanel(
    radius: number,
    {
        planks,
        thickness,
        radialSegments = 48,
        shoulderWidth,
        recessDepth
    }: CircularPlankPanelOptions & {
        shoulderWidth: number;
        recessDepth: number;
    }
): THREE.BufferGeometry[] {
    validatePanel(radius, planks, thickness, radialSegments);

    if (
        !Number.isFinite(shoulderWidth) ||
        !Number.isFinite(recessDepth) ||
        shoulderWidth <= 0 ||
        recessDepth <= 0 ||
        recessDepth >= thickness / 2 ||
        shoulderWidth >= radius / planks
    ) {
        throw new RangeError("Invalid circular plank joint relief");
    }

    const outlines = circularPlankOutlines(radius, planks, radialSegments);
    return outlines.map((outline, index) =>
        seamedPlankExtrusion(outline, {
            thickness,
            shoulderWidth,
            recessDepth,
            seamAtStart: index > 0,
            seamAtEnd: index < planks - 1
        })
    );
}

/**
 * Clip once against exactly the same perimeter for every independent
 * plank. Neighboring outlines therefore share the very same seam location.
 */
function circularPlankOutlines(
    radius: number,
    planks: number,
    radialSegments: number
): Point[][] {
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

    return Array.from({ length: planks }, (_, i) => {
        const clipped = clipAtX(
            clipAtX(circle, cuts[i]!, true),
            cuts[i + 1]!,
            false
        );

        const outline = removeConsecutiveDuplicates(
            clipped, radius * 1e-10
        );

        if (outline.length < 3) {
            throw new RangeError("Panel plank has no usable area");
        }
        return outline;
    });
}

function validatePanel(
    radius: number, planks: number, thickness: number, radialSegments: number
): void {
    if (
        !Number.isFinite(radius) || radius <= 0 ||
        !Number.isFinite(thickness) || thickness <= 0 ||
        !Number.isInteger(planks) || planks < 2 ||
        !Number.isInteger(radialSegments) || radialSegments < 8
    ) {
        throw new RangeError("Invalid circular plank panel dimensions");
    }
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
