import { partitionConvexPolygon } from "../../toolbox/shapes/operations/clipConvexPolygon";
import { weightedCuts } from "../../toolbox/spatial/layout/weightedCuts";
import { seededVariation } from "../../toolbox/spatial/layout/seededVariation";
import {
    seamedPlankExtrusionData,
    type PlankVertex
} from "../../toolbox/geometry/construction/seamedPlankExtrusion";
import {
    geometryResult, type GeometryResult
} from "../../toolbox/geometry/kernel/GeometryResult";

export interface HandFittedHeadOptions {
    seed: number;
    edgeWander: number;
    crown: number;
    edgeWear: number;
    longitudinalSegments?: number;
    maxDeviation?: number;
}

export interface CooperedHeadOptions {
    planks: number;
    thickness: number;
    radialSegments?: number;
    widthWeights?: readonly number[];
    shoulderWidth: number;
    recessDepth: number;
    grooveFloorWidth?: number;
    handFitted?: HandFittedHeadOptions;
    detailedFace?: "top" | "bottom" | "both";
}

type Point = readonly [number, number];

/**
 * Model-owned assembly of five trimmed boards and their worked seams.
 * Common clipping, station sampling and authored mesh assembly stay in
 * the toolbox, while the cooper specifies the joints and their wear.
 */
export function cooperedHead(
    radius: number,
    {
        planks,
        thickness,
        radialSegments = 48,
        widthWeights,
        shoulderWidth,
        recessDepth,
        grooveFloorWidth = 0,
        handFitted,
        detailedFace = "both"
    }: CooperedHeadOptions
): GeometryResult[] {
    validatePanel(radius, planks, thickness, radialSegments, widthWeights);

    if (
        !Number.isFinite(shoulderWidth) ||
        !Number.isFinite(recessDepth) ||
        !["top", "bottom", "both"].includes(detailedFace) ||
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

    const vary = (index: number, channel: number): number =>
        seededVariation(handFitted?.seed ?? 0, index, channel);

    const wander = (seam: number, z: number): number => {
        if (!handFitted || seam === 0 || seam === planks) return 0;
        const along = z / radius;
        return handFitted.edgeWander * (
            0.62 * Math.sin(along * Math.PI * 0.85 + vary(seam, 1) * Math.PI) +
            0.27 * Math.sin(along * Math.PI * 1.9 + vary(seam, 2) * Math.PI) +
            0.11 * along * vary(seam, 3)
        );
    };

    const build = (sharedStations?: readonly number[]) =>
        outlines.map((outline, index) => {
        const left = cuts[index]!;
        const right = cuts[index + 1]!;

        return seamedPlankExtrusionData(outline, {
            thickness,
            shoulderWidth,
            recessDepth,
            grooveFloorWidth,
            seamAtStart: index > 0,
            seamAtEnd: index < planks - 1,
            detailedFace,
            longitudinalSegments: handFitted?.maxDeviation === undefined
                ? (handFitted?.longitudinalSegments ?? 1) : 1,
            ...(sharedStations ? { longitudinalStations: sharedStations }
                : handFitted && handFitted.maxDeviation !== undefined ? {
                    adaptiveLongitudinal: {
                        maxDeviation: handFitted.maxDeviation,
                        maxDepth: 5
                    }
                } : {}),
            ...(handFitted ? {
                deform: (p: Readonly<PlankVertex>) => {
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

                // A recessed face is still geometrically closed, but its
                // unseen back needs neither cupping nor worn groove relief.
                const workedFace = detailedFace === "both" ||
                    (detailedFace === "top" ? p.y > 0 : p.y < 0);

                return {
                    x,
                    y: p.y + (workedFace
                        ? bow * fade - Math.sign(p.y) * wear : 0),
                    z: p.z
                };
            }
            } : {})
        });
    });

    const firstPass = build();
    if (!handFitted || handFitted.maxDeviation === undefined) {
        return firstPass.map(piece => geometryResult(piece.geometry));
    }

    // Collect the adaptive stations of every board before assembling the
    // panel. Shared joinery cannot use separate longitudinal partitions:
    // differently tessellated contact faces create tiny T-junctions.
    const shared = [...new Set(
        firstPass.flatMap(piece => piece.stations)
    )].sort((a, b) => a - b);

    if (firstPass.every(piece => {
        const own = piece.stations;
        return own.length === shared.length &&
            own.every((t, i) => t === shared[i]);
    })) {
        return firstPass.map(piece => geometryResult(piece.geometry));
    }

    return build(shared).map(piece => geometryResult(piece.geometry));
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

    return partitionConvexPolygon(circle, cuts);

}

/** Shared cut positions for all faces and all deformation profiles. */
function panelCuts(
    radius: number,
    planks: number,
    widthWeights?: readonly number[]
): number[] {
    return weightedCuts(-radius, radius, planks, widthWeights);
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
