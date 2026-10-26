import * as THREE from "three";
import { extrude } from "../../shapes/operations/extrude";
import {
    seamedPlankExtrusion,
    getPlankLongitudinalStations
} from "./seamedPlankExtrusion";

export interface HandFittedPanelOptions {
    seed: number;
    /** Lateral drift of the SHARED joinery edges (meters). */
    edgeWander: number;
    /** Gentle cupping/twist of each plank between its two fitted edges. */
    crown: number;
    /** Tiny worn patches at the exposed seams; never a through-gap. */
    edgeWear: number;
    /** Longitudinal control divisions to support the worked surface. */
    longitudinalSegments?: number;
    /** Max world-space deviation of the fitted surface from its mesh. */
    maxDeviation?: number;
}

export interface CircularPlankPanelOptions {
    planks: number;
    thickness: number;
    radialSegments?: number;
    /** Relative widths of the fitted boards; normalized to fill the disk. */
    widthWeights?: readonly number[];
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
        radialSegments = 48,
        widthWeights
    }: CircularPlankPanelOptions
): THREE.ExtrudeGeometry[] {
    validatePanel(radius, planks, thickness, radialSegments, widthWeights);

    const outlines = circularPlankOutlines(radius, planks, radialSegments, widthWeights);
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
        widthWeights,
        shoulderWidth,
        recessDepth,
        grooveFloorWidth = 0,
        handFitted
    }: CircularPlankPanelOptions & {
        shoulderWidth: number;
        recessDepth: number;
        grooveFloorWidth?: number;
        handFitted?: HandFittedPanelOptions;
    }
): THREE.BufferGeometry[] {
    validatePanel(radius, planks, thickness, radialSegments, widthWeights);

    if (
        !Number.isFinite(shoulderWidth) ||
        !Number.isFinite(recessDepth) ||
        shoulderWidth <= 0 ||
        recessDepth <= 0 ||
        recessDepth >= thickness / 2 ||
        !Number.isFinite(grooveFloorWidth) ||
        grooveFloorWidth < 0 ||
        grooveFloorWidth >= shoulderWidth ||
        shoulderWidth * 2 >= Math.min(...(widthWeights ?? Array(planks).fill(1))) *
            (2 * radius / (widthWeights?.reduce((sum, w) => sum + w, 0) ?? planks))
    ) {
        throw new RangeError("Invalid circular plank joint relief");
    }

    const cuts = panelCuts(radius, planks, widthWeights);
    const outlines = circularPlankOutlines(radius, planks, radialSegments, widthWeights);

    if (handFitted) {
        const { seed, edgeWander, crown, edgeWear, longitudinalSegments = 8,
            maxDeviation } = handFitted;
        const smallestWidth = Math.min(
            ...cuts.slice(1).map((cut, i) => cut - cuts[i]!)
        );
        if (
            !Number.isInteger(seed) ||
            ![edgeWander, crown, edgeWear].every(Number.isFinite) ||
            edgeWander < 0 || edgeWander >= smallestWidth * 0.12 ||
            crown < 0 || crown >= thickness * 0.2 ||
            edgeWear < 0 || edgeWear >= thickness / 2 - recessDepth ||
            !Number.isInteger(longitudinalSegments) ||
            longitudinalSegments < 2 || longitudinalSegments > 32 ||
            (maxDeviation !== undefined &&
                (!Number.isFinite(maxDeviation) || maxDeviation <= 0))
        ) {
            throw new RangeError("Invalid hand-fitted panel dimensions");
        }
    }

    // The joinery is ONE shared profile per internal seam, not separate
    // random displacement for either adjacent plank. Every edge still mates.
    const smooth = (t: number): number => {
        const x = Math.max(0, Math.min(1, t));
        return x * x * (3 - 2 * x);
    };

    const vary = (index: number, channel: number): number => {
        const seed = handFitted?.seed ?? 0;
        let h = Math.imul(seed + 67, 0x9e3779b1) ^
            Math.imul(index + 1, 0x85ebca6b) ^
            Math.imul(channel + 1, 0xc2b2ae35);
        h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
        h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
        return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
    };

    const wander = (seam: number, z: number): number => {
        if (!handFitted || seam === 0 || seam === planks) return 0;
        const along = z / radius;
        return handFitted.edgeWander * (
            0.62 * Math.sin(along * Math.PI * 0.85 + vary(seam, 1) * Math.PI) +
            0.27 * Math.sin(along * Math.PI * 1.9 + vary(seam, 2) * Math.PI) +
            0.11 * along * vary(seam, 3)
        );
    };

    const build = (sharedStations?: readonly number[]): THREE.BufferGeometry[] =>
        outlines.map((outline, index) => {
        const left = cuts[index]!;
        const right = cuts[index + 1]!;

        return seamedPlankExtrusion(outline, {
            thickness,
            shoulderWidth,
            recessDepth,
            grooveFloorWidth,
            seamAtStart: index > 0,
            seamAtEnd: index < planks - 1,
            longitudinalSegments: handFitted?.maxDeviation === undefined
                ? (handFitted?.longitudinalSegments ?? 1) : 1,
            ...(sharedStations ? { longitudinalStations: sharedStations }
                : handFitted && handFitted.maxDeviation !== undefined ? {
                    adaptiveLongitudinal: {
                        maxDeviation: handFitted.maxDeviation,
                        maxDepth: 5
                    }
                } : {}),
            deform: handFitted ? p => {
                const t = Math.max(0, Math.min(1, (p.x - left) / (right - left)));
                // Preserve the exact circular trim: all deformation fades
                // to zero where the face meets its outside cut.
                const fade = smooth(
                    (radius - Math.hypot(p.x, p.z)) / (radius * 0.15)
                );
                const x = p.x + fade * (
                    (1 - t) * wander(index, p.z) +
                    t * wander(index + 1, p.z)
                );

                // A timber board can cup and twist slightly, but its
                // long contacting edges still meet their neighbors.
                const bow = handFitted.crown * Math.sin(Math.PI * t) * (
                    0.65 * vary(index, 4) +
                    0.45 * vary(index, 5) * p.z / radius +
                    0.2 * vary(index, 6) *
                        Math.sin(p.z * Math.PI / radius)
                );

                // Worn notches happen in a few places along real joints,
                // rather than painting a uniform black barcode.
                const wearAt = (seam: number): number => {
                    const center = vary(seam, 7) * radius * 0.52;
                    const span = radius * (0.1 + 0.045 * (vary(seam, 8) + 1));
                    const distance = (p.z - center) / span;
                    return Math.exp(-distance * distance * 2);
                };
                const wear = handFitted.edgeWear * fade * Math.max(
                    index > 0 ? Math.pow(1 - t, 7) * wearAt(index) : 0,
                    index < planks - 1 ? Math.pow(t, 7) * wearAt(index + 1) : 0
                );

                return {
                    x,
                    y: p.y + bow * fade - Math.sign(p.y) * wear,
                    z: p.z
                };
            } : undefined
        });
    });

    const firstPass = build();
    if (!handFitted || handFitted.maxDeviation === undefined) {
        return firstPass;
    }

    // Collect the adaptive stations of every board before assembling the
    // panel. Shared joinery cannot use separate longitudinal partitions:
    // differently tessellated contact faces create tiny T-junctions.
    const shared = [...new Set(
        firstPass.flatMap(geometry =>
            getPlankLongitudinalStations(geometry) ?? []
        )
    )].sort((a, b) => a - b);

    if (firstPass.every(geometry => {
        const own = getPlankLongitudinalStations(geometry) ?? [];
        return own.length === shared.length &&
            own.every((t, i) => t === shared[i]);
    })) {
        return firstPass;
    }

    for (const geometry of firstPass) geometry.dispose();
    return build(shared);
}

/**
 * Clip once against exactly the same perimeter for every independent
 * plank. Neighboring outlines therefore share the very same seam location.
 */
function circularPlankOutlines(
    radius: number,
    planks: number,
    radialSegments: number,
    widthWeights?: readonly number[]
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

    const cuts = panelCuts(radius, planks, widthWeights);

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

/** Shared cut positions for all faces and all deformation profiles. */
function panelCuts(
    radius: number,
    planks: number,
    widthWeights?: readonly number[]
): number[] {
    const weights = widthWeights ?? Array.from({ length: planks }, () => 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const cuts = [-radius];

    for (let i = 0; i < planks - 1; i++) {
        cuts.push(cuts[i]! + 2 * radius * weights[i]! / totalWeight);
    }
    cuts.push(radius);
    return cuts;
}

function validatePanel(
    radius: number,
    planks: number,
    thickness: number,
    radialSegments: number,
    widthWeights?: readonly number[]
): void {
    if (
        !Number.isFinite(radius) || radius <= 0 ||
        !Number.isFinite(thickness) || thickness <= 0 ||
        !Number.isInteger(planks) || planks < 2 ||
        !Number.isInteger(radialSegments) || radialSegments < 8 ||
        (widthWeights !== undefined && (
            widthWeights.length !== planks ||
            widthWeights.some(w => !Number.isFinite(w) || w <= 0)
        ))
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
