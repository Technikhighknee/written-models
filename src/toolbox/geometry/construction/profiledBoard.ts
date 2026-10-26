import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftBoard } from "./loftBoard";

/** A longitudinal edge of a plank, expressed in the panel's local Z. */
export type BoardEdgeProfile = (progress: number) => number;

export interface BoardEndShape {
    /** How far this end extends beyond the nominal cut, in meters. */
    offset?: number;
    /** Difference in length from the left corner to the right corner. */
    skew?: number;
    /** Small corner losses measured INWARDS from each long edge. */
    cornerWear?: readonly [left: number, right: number];
}

export interface ProfiledBoardOptions {
    length: number;
    thickness: number;
    chamfer: number;
    crown?: number;
    /** Both edges must be defined in the same panel coordinate system. */
    leftEdge: BoardEdgeProfile;
    rightEdge: BoardEdgeProfile;
    start?: BoardEndShape;
    end?: BoardEndShape;
    /** Positive values lift the top face; the lower bearing face stays fixed. */
    thicknessOffset?: number;
    /** A little unevenness in the hand-broken longitudinal edge chamfer. */
    chamferVariation?: number;
    variationPhase?: number;
}

/**
 * Closed, all-quad board with two genuinely shaped long edges and cut ends.
 *
 * Rather than deforming the vertices of a straight box after the fact,
 * construct a sequence of full cross-sections and loft them. The caller
 * can share left/right edge profiles across neighboring boards to make
 * a tight panel without overlaps, even when the grain runs along X.
 *
 * Chamfers and small corner losses affect the actual silhouette.
 * Sections remain ordered and UVs stay in physical meters.
 */
export function profiledBoard({
    length,
    thickness,
    chamfer,
    crown = 0,
    leftEdge,
    rightEdge,
    start = {},
    end = {},
    thicknessOffset = 0,
    chamferVariation = 0,
    variationPhase = 0
}: ProfiledBoardOptions): MeshData {
    const { offset: startOffset = 0, skew: startSkew = 0,
        cornerWear: startCorners = [0, 0] } = start;
    const { offset: endOffset = 0, skew: endSkew = 0,
        cornerWear: endCorners = [0, 0] } = end;
    const values = [
        length, thickness, chamfer, crown, thicknessOffset,
        chamferVariation, variationPhase,
        startOffset, startSkew, endOffset, endSkew,
        ...startCorners, ...endCorners
    ];

    if (
        values.some(value => !Number.isFinite(value)) ||
        typeof leftEdge !== "function" ||
        typeof rightEdge !== "function" ||
        length <= 0 || thickness <= 0 || chamfer < 0 ||
        crown < 0 || chamferVariation < 0 || chamferVariation > 0.5 ||
        thickness + thicknessOffset <= chamfer * 2 ||
        [...startCorners, ...endCorners].some(value => value < 0)
    ) {
        throw new RangeError("Invalid profiled board");
    }

    // Extra stations near both ends give corner nicks a real, small
    // silhouette without forcing high-frequency noise along entire boards.
    const stations = [
        0, 0.015, 0.045, 0.12, 0.25, 0.375, 0.5,
        0.625, 0.75, 0.88, 0.955, 0.985, 1
    ];

    const sections = stations.map(progress => {
        const nearStart = Math.max(0, 1 - progress / 0.045) ** 2;
        const nearEnd = Math.max(0, 1 - (1 - progress) / 0.045) ** 2;

        const left = leftEdge(progress) +
            startCorners[0] * nearStart + endCorners[0] * nearEnd;
        const right = rightEdge(progress) -
            startCorners[1] * nearStart - endCorners[1] * nearEnd;
        const span = right - left;
        const bevel = chamfer * (
            1 + chamferVariation *
                Math.sin(2 * Math.PI * progress + variationPhase)
        );

        if (
            !Number.isFinite(left) || !Number.isFinite(right) ||
            span <= Math.max(bevel * 4, 1e-5) ||
            bevel >= (thickness + thicknessOffset) / 2
        ) {
            throw new RangeError("Profiled board edges intersect");
        }

        const baseX = -length / 2 + length * progress +
            startOffset * (1 - progress) + endOffset * progress;
        const skew = startSkew * (1 - progress) + endSkew * progress;
        // With no bevel, emit three distinct width samples rather than
        // zero-width quads at the ends of the cross-section.
        const positions = bevel > 0 ? [
            left, left + bevel, (left + right) / 2,
            right - bevel, right
        ] : [
            left, (left + right) / 2, right
        ];
        const last = positions.length - 1;

        const topY = thickness / 2 + thicknessOffset;
        const bottomY = -thickness / 2;

        // Each cross-section bends across the board, but the bearing
        // underside remains level so a table can sit on real supports.
        const outer = positions.map((z, index) => {
            const across = index / last;
            return new THREE.Vector3(
                baseX + skew * (across - 0.5),
                topY + crown * Math.sin(Math.PI * across) ** 2 -
                    (index === 0 || index === last ? bevel : 0),
                z
            );
        });
        const inner = positions.map((z, index) => {
            const across = index / last;
            return new THREE.Vector3(
                baseX + skew * (across - 0.5),
                bottomY + (index === 0 || index === last ? bevel : 0),
                z
            );
        });

        return { outer, inner };
    });

    return loftBoard(sections);
}
