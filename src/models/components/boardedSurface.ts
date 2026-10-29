import * as THREE from "three";

import { loftBoard } from "../../toolbox/geometry/construction/loftBoard";
import { geometryResult, type GeometryResult } from "../../toolbox/geometry/kernel/GeometryResult";
import { adaptiveStations } from "../../toolbox/geometry/topology/adaptiveStations";
import { weightedCuts } from "../../toolbox/spatial/layout/weightedCuts";
import { seededVariation } from "../../toolbox/spatial/layout/seededVariation";

export interface BoardedSurfaceOptions {
    length: number;
    width: number;
    thickness: number;
    weights: readonly number[];
    gap: number;
    chamfer: number;
    crown: number;
    seed: number;
    edgeWander: number;
    endStagger: number;
    cornerWear: number;
    thicknessVariation: number;
    chamferVariation: number;
}

interface BoardShape {
    sectionAt(t: number): {
        outer: THREE.Vector3[];
        inner: THREE.Vector3[];
    };
    stations: readonly number[];
}

/**
 * A model-owned recipe for individually hand-worked boards. Their edges
 * are sampled from common seams: neighbors cannot independently invent
 * positions along the same joint.
 *
 * Sampling and mesh construction remain common geometric operations;
 * this file owns only the woodworker's design of the section profiles.
 */
export function boardedSurface({
    length, width, thickness, weights, gap, chamfer, crown,
    seed, edgeWander, endStagger, cornerWear,
    thicknessVariation, chamferVariation
}: BoardedSurfaceOptions): GeometryResult[] {
    const count = weights.length;
    if (
        count < 1 || !Number.isInteger(seed) ||
        [length, width, thickness, gap, chamfer, crown,
            edgeWander, endStagger, cornerWear, thicknessVariation,
            chamferVariation].some(value => !Number.isFinite(value)) ||
        length <= 0 || width <= 0 || thickness <= 0 ||
        weights.some(value => !Number.isFinite(value) || value <= 0) ||
        gap < 0 || gap * (count - 1) >= width ||
        chamfer < 0 || crown < 0 ||
        chamferVariation < 0 || chamferVariation > 0.5
    ) {
        throw new RangeError("Invalid boarded surface dimensions");
    }

    const cuts = weightedCuts(
        0, width - gap * (count - 1), count, weights
    );
    const widths = cuts.slice(1).map((cut, i) => cut - cuts[i]!);
    const minWidth = Math.min(...widths);
    if (
        edgeWander >= minWidth * 0.1 ||
        endStagger >= length * 0.08 ||
        cornerWear >= minWidth * 0.08 ||
        thicknessVariation >= thickness * 0.1
    ) {
        throw new RangeError("Board wear exceeds the available material");
    }

    const boundaries = [-width / 2];
    let cursor = -width / 2;

    for (let i = 0; i < count - 1; i++) {
        cursor += widths[i]! + gap / 2;
        boundaries.push(cursor);
        cursor += gap / 2;
    }
    boundaries.push(width / 2);

    const edges = boundaries.map((base, index) => {
        const taper = seededVariation(seed, index, 1) * edgeWander * 0.5;
        const bow = seededVariation(seed, index, 2) * edgeWander;
        const wobble = seededVariation(seed, index, 3) * edgeWander * 0.3;

        return (progress: number): number =>
            base + taper * (2 * progress - 1) +
            bow * Math.sin(Math.PI * progress) ** 2 +
            wobble * Math.sin(2 * Math.PI * progress);
    });

    const wear = (index: number, channel: number): number => {
        const value = seededVariation(seed, index, channel);
        return value > -0.18
            ? cornerWear * (0.3 + 0.7 * Math.abs(value))
            : 0;
    };
    const cornerExtent = 0.045;

    const shapes: BoardShape[] = widths.map((_, index) => {
        const startOffset = seededVariation(seed, index, 10) * endStagger;
        const startSkew = seededVariation(seed, index, 11) *
            endStagger * 0.35;
        const endOffset = seededVariation(seed, index, 12) * endStagger;
        const endSkew = seededVariation(seed, index, 13) *
            endStagger * 0.35;
        const startCorners = [
            wear(index, 20), wear(index, 21)
        ] as const;
        const endCorners = [
            wear(index, 22), wear(index, 23)
        ] as const;
        const thicknessOffset = seededVariation(seed, index, 30) *
            thicknessVariation;
        const variationPhase = seededVariation(seed, index, 31) * Math.PI;

        const sectionAt = (progress: number) => {
            const nearStart = Math.max(0, 1 - progress / cornerExtent) ** 2;
            const nearEnd = Math.max(0, 1 - (1 - progress) / cornerExtent) ** 2;
            const left = edges[index]!(progress) +
                (index === 0 ? 0 : gap / 2) +
                startCorners[0] * nearStart + endCorners[0] * nearEnd;
            const right = edges[index + 1]!(progress) -
                (index === count - 1 ? 0 : gap / 2) -
                startCorners[1] * nearStart - endCorners[1] * nearEnd;
            const bevel = chamfer * (1 + chamferVariation *
                Math.sin(2 * Math.PI * progress + variationPhase));

            if (
                !(right - left > Math.max(bevel * 4, 1e-5)) ||
                bevel >= (thickness + thicknessOffset) / 2
            ) {
                throw new RangeError("Board's hand-worked edges intersect");
            }

            const baseX = -length / 2 + length * progress +
                startOffset * (1 - progress) + endOffset * progress;
            const skew = startSkew * (1 - progress) +
                endSkew * progress;
            const positions = bevel > 0
                ? [left, left + bevel, (left + right) / 2,
                    right - bevel, right]
                : [left, (left + right) / 2, right];
            const last = positions.length - 1;
            const topY = thickness / 2 + thicknessOffset;
            const bottomY = -thickness / 2;

            return {
                outer: positions.map((z, position) => {
                    const across = position / last;
                    return new THREE.Vector3(
                        baseX + skew * (across - 0.5),
                        topY + crown * Math.sin(Math.PI * across) ** 2 -
                            (position === 0 || position === last
                                ? bevel : 0),
                        z
                    );
                }),
                inner: positions.map((z, position) => {
                    const across = position / last;
                    return new THREE.Vector3(
                        baseX + skew * (across - 0.5),
                        bottomY + (position === 0 || position === last
                            ? bevel : 0),
                        z
                    );
                })
            };
        };

        const hasWear = [...startCorners, ...endCorners]
            .some(value => value > 0);
        const stations = adaptiveStations(
            progress => {
                const section = sectionAt(progress);
                return [...section.outer, ...section.inner];
            },
            {
                maxDeviation: 0.00045,
                maxDepth: 6,
                ...(hasWear ? {
                    knots: [cornerExtent, 1 - cornerExtent]
                } : {})
            }
        );

        return { sectionAt, stations };
    });

    // All boards use the union of the actual sampled longitudinal
    // coordinates, including the two worn ends of each neighboring board.
    const shared = [...new Set(shapes.flatMap(shape =>
        [...shape.stations]
    ))].sort((a, b) => a - b);

    return shapes.map(shape => geometryResult(
        loftBoard(shared.map(shape.sectionAt))
    ));
}
