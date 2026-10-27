import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftBoard } from "./loftBoard";
import { adaptiveStations } from "../topology/adaptiveStations";

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
    /** Maximum world-space departure of any section from its chord. */
    maxDeviation?: number;
    /** Maximum adaptive refinement depth per geometric interval. */
    maxDepth?: number;
    /** Exact stations shared by several neighboring pieces. */
    longitudinalStations?: readonly number[];
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
const stationMetadata = new WeakMap<MeshData, readonly number[]>();

/** Exact cross-section locations authored in the resulting mesh. */
export function getProfiledBoardStations(
    mesh: MeshData
): readonly number[] | undefined {
    return stationMetadata.get(mesh);
}

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
    variationPhase = 0,
    maxDeviation = 0.00045,
    maxDepth = 6,
    longitudinalStations
}: ProfiledBoardOptions): MeshData {
    const { offset: startOffset = 0, skew: startSkew = 0,
        cornerWear: startCorners = [0, 0] } = start;
    const { offset: endOffset = 0, skew: endSkew = 0,
        cornerWear: endCorners = [0, 0] } = end;
    const values = [
        length, thickness, chamfer, crown, thicknessOffset,
        chamferVariation, variationPhase,
        startOffset, startSkew, endOffset, endSkew,
        ...startCorners, ...endCorners, maxDeviation, maxDepth
    ];

    if (
        values.some(value => !Number.isFinite(value)) ||
        typeof leftEdge !== "function" ||
        typeof rightEdge !== "function" ||
        length <= 0 || thickness <= 0 || chamfer < 0 ||
        crown < 0 || chamferVariation < 0 || chamferVariation > 0.5 ||
        thickness + thicknessOffset <= chamfer * 2 ||
        [...startCorners, ...endCorners].some(value => value < 0) ||
        maxDeviation <= 0 || !Number.isInteger(maxDepth) ||
        maxDepth < 0 || maxDepth > 8 ||
        (longitudinalStations !== undefined && (
            longitudinalStations.length < 2 ||
            longitudinalStations[0] !== 0 ||
            longitudinalStations.at(-1) !== 1 ||
            longitudinalStations.some((t, i) => !Number.isFinite(t) ||
                (i > 0 && t <= longitudinalStations[i - 1]!))
        ))
    ) {
        throw new RangeError("Invalid profiled board");
    }

    // End wear has finite support. Keep the feature boundaries exact,
    // and use adaptive sampling only where the finished surface needs it.
    const cornerExtent = 0.045;
    const sectionAt = (progress: number) => {
        const nearStart = Math.max(0, 1 - progress / cornerExtent) ** 2;
        const nearEnd = Math.max(0, 1 - (1 - progress) / cornerExtent) ** 2;

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
    };

    const hasWear = [...startCorners, ...endCorners].some(value => value > 0);
    const stations = longitudinalStations ?? adaptiveStations(
        progress => {
            const section = sectionAt(progress);
            return [...section.outer, ...section.inner];
        },
        {
            maxDeviation, maxDepth,
            ...(hasWear ? { knots: [cornerExtent, 1 - cornerExtent] } : {})
        }
    );
    const result = loftBoard(stations.map(sectionAt));
    stationMetadata.set(result, stations);
    return result;
}
