import type { MeshData } from "../mesh/MeshData";
import { profiledBoard } from "./profiledBoard";
import { straightBoard } from "./straightBoard";

export interface HandWorkedPanelOptions {
    /** Stable imperfections: the same seed always produces the same cuts. */
    seed: number;
    /** Maximum slow drift of a shared long edge, in meters. */
    edgeWander: number;
    /** Maximum offset of each board end from the nominal crosscut. */
    endStagger: number;
    /** Maximum small inward loss at the four corners of a board. */
    cornerWear: number;
    /** Maximum departure of the top face from the nominal thickness. */
    thicknessVariation: number;
    /** Relative chamfer modulation (0..0.5). */
    chamferVariation?: number;
}

export interface BoardPanelOptions {
    length: number;
    width: number;
    thickness: number;
    count: number;
    /** Relative plank widths, normalized to fill the complete panel. */
    widthWeights?: readonly number[];
    /** A real open gap, if desired. Zero joins the board edges. */
    gap?: number;
    chamfer?: number;
    crown?: number;
    /** Hand-worked construction; omitted for perfectly straight boards. */
    handWorked?: HandWorkedPanelOptions;
}

function variation(seed: number, index: number, channel: number): number {
    let h = Math.imul(seed + 67, 0x9e3779b1) ^
        Math.imul(index + 1, 0x85ebca6b) ^
        Math.imul(channel + 1, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
}

/**
 * A panel of separate, closed, all-quad wooden boards along local X.
 *
 * For hand-worked panels, internal edges are shared profiles. Neighboring
 * boards therefore stay fitted as the width tapers or bows. Only purposeful
 * tiny losses at the four end corners open a joint. Nothing overlaps and no
 * random noise is added after topology/UV generation.
 *
 * Works for tabletops, doors, shop counters, floors and similar surfaces.
 */
export function boardPanel({
    length, width, thickness, count,
    widthWeights,
    gap = 0,
    chamfer = 0,
    crown = 0,
    handWorked
}: BoardPanelOptions): MeshData[] {
    if (
        !Number.isInteger(count) || count < 1 ||
        ![length, width, thickness, gap, chamfer, crown].every(Number.isFinite) ||
        length <= 0 || width <= 0 || thickness <= 0 ||
        gap < 0 || gap * (count - 1) >= width ||
        (widthWeights !== undefined && (
            widthWeights.length !== count ||
            widthWeights.some(weight => !Number.isFinite(weight) || weight <= 0)
        ))
    ) {
        throw new RangeError("Invalid board panel layout");
    }

    const available = width - gap * (count - 1);
    const weights = widthWeights ?? Array.from({ length: count }, () => 1);
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    const widths = weights.map(weight => available * weight / totalWeight);

    if (handWorked) {
        const {
            seed, edgeWander, endStagger, cornerWear,
            thicknessVariation, chamferVariation = 0.25
        } = handWorked;
        const minWidth = Math.min(...widths);

        if (
            !Number.isInteger(seed) ||
            ![edgeWander, endStagger, cornerWear, thicknessVariation,
                chamferVariation].every(Number.isFinite) ||
            edgeWander < 0 || edgeWander >= minWidth * 0.1 ||
            endStagger < 0 || endStagger >= length * 0.08 ||
            cornerWear < 0 || cornerWear >= minWidth * 0.08 ||
            thicknessVariation < 0 || thicknessVariation >= thickness * 0.1 ||
            chamferVariation < 0 || chamferVariation > 0.5
        ) {
            throw new RangeError("Invalid hand-worked panel proportions");
        }

        // A seam is a single shared shape, regardless of whether the
        // panel leaves a small constant assembly gap on either side of it.
        // Centers lie midway in each gap; outermost boundaries are exact.
        const boundaries = [-width / 2];
        let cursor = -width / 2;
        for (let i = 0; i < count - 1; i++) {
            cursor += widths[i]! + gap / 2;
            boundaries.push(cursor);
            cursor += gap / 2;
        }
        boundaries.push(width / 2);

        const edges = boundaries.map((base, index) => {
            const taper = variation(seed, index, 1) * edgeWander * 0.5;
            const bow = variation(seed, index, 2) * edgeWander;
            const wobble = variation(seed, index, 3) * edgeWander * 0.3;
            return (progress: number): number =>
                base + taper * (2 * progress - 1) +
                bow * Math.sin(Math.PI * progress) ** 2 +
                wobble * Math.sin(2 * Math.PI * progress);
        });

        const corner = (index: number, channel: number): number => {
            const value = variation(seed, index, channel);
            // Some corners are intact, others are genuinely nicked.
            return value > -0.18 ? cornerWear * (0.3 + 0.7 * Math.abs(value)) : 0;
        };

        return widths.map((_, index) => profiledBoard({
            length,
            thickness,
            chamfer,
            crown,
            leftEdge: progress => edges[index]!(progress) +
                (index === 0 ? 0 : gap / 2),
            rightEdge: progress => edges[index + 1]!(progress) -
                (index === count - 1 ? 0 : gap / 2),
            start: {
                offset: variation(seed, index, 10) * endStagger,
                skew: variation(seed, index, 11) * endStagger * 0.35,
                cornerWear: [
                    corner(index, 20),
                    corner(index, 21)
                ]
            },
            end: {
                offset: variation(seed, index, 12) * endStagger,
                skew: variation(seed, index, 13) * endStagger * 0.35,
                cornerWear: [
                    corner(index, 22),
                    corner(index, 23)
                ]
            },
            thicknessOffset: variation(seed, index, 30) * thicknessVariation,
            chamferVariation,
            variationPhase: variation(seed, index, 31) * Math.PI
        }));
    }

    const boards: MeshData[] = [];
    let cursor = -width / 2;

    for (let i = 0; i < count; i++) {
        const boardWidth = widths[i]!;
        const board = straightBoard({
            length,
            width: boardWidth,
            thickness,
            chamfer,
            crown
        });
        const center = cursor + boardWidth / 2;

        for (const vertex of board.vertices) {
            vertex.z += center;
        }

        boards.push(board);
        cursor += boardWidth + gap;
    }

    return boards;
}
