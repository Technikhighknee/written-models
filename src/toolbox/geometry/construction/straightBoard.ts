import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftBoard } from "./loftBoard";

export interface StraightBoardOptions {
    length: number;
    width: number;
    thickness: number;
    /** Small, genuine chamfer on each of the four long edges. */
    chamfer?: number;
    /** Gentle convexity of the broad faces, across the width. */
    crown?: number;
}

/**
 * A closed, low-poly timber board running along local X.
 *
 * U runs ACROSS the board (+Z); V runs ALONG it (+X). Both use meters.
 * The upper face points out along +Y, and the two end caps use separate
 * surfaces for end-grain materials. Built with the common quad loft.
 */
export function straightBoard({
    length,
    width,
    thickness,
    chamfer = 0,
    crown = 0
}: StraightBoardOptions): MeshData {
    if (
        [length, width, thickness, chamfer, crown]
            .some(value => !Number.isFinite(value)) ||
        length <= 0 || width <= 0 || thickness <= 0 ||
        chamfer < 0 || chamfer >= Math.min(width, thickness) / 2 ||
        crown < 0 || crown >= thickness / 2
    ) {
        throw new RangeError("Invalid board dimensions");
    }

    const halfWidth = width / 2;
    const halfThickness = thickness / 2;
    const across = chamfer > 0
        ? [-halfWidth, -halfWidth + chamfer, 0, halfWidth - chamfer, halfWidth]
        : [-halfWidth, 0, halfWidth];

    // The chamfer falls away toward the long outer edges.
    // The optional crown breaks the look of mathematically dead-flat lumber.
    const makeSection = (x: number) => ({
        outer: across.map((z, i) => new THREE.Vector3(
            x,
            halfThickness + crown * (1 - (z / halfWidth) ** 2) -
                (chamfer > 0 && (i === 0 || i === across.length - 1) ? chamfer : 0),
            z
        )),
        inner: across.map((z, i) => new THREE.Vector3(
            x,
            -halfThickness +
                (chamfer > 0 && (i === 0 || i === across.length - 1) ? chamfer : 0),
            z
        ))
    });

    return loftBoard([
        makeSection(-length / 2),
        makeSection(length / 2)
    ]);
}
