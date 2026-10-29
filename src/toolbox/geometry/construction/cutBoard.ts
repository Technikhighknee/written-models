import * as THREE from "three";
import { layeredGridSolid } from "../build/layeredGridSolid";
import type {MeshData} from "../mesh/MeshData";

export interface BoardCut {
    minX: number;
    maxX: number;
    /** Rear and front cut bounds at the upper surface. */
    topZ: readonly [number, number];
    /** Rear and front bounds below, independently of the upper contour. */
    bottomZ: readonly [number, number];
}

export interface CutBoardOptions {
    width: number;
    depth: number;
    thickness: number;
    centerZ?: number;
    cuts: readonly BoardCut[];
    bevel?: number;
    crown?: number;
}

interface Station {
    top: number;
    bottom: number;
}

/**
 * Build an all-quad solid board with precise cut profiles. Cuts can open
 * onto an edge (corner housings) or remain enclosed (through mortises).
 * Exposed wood receives continuous thickness walls and a small bevel.
 * Different upper/lower cut profiles accommodate sloping support members.
 */
export function cutBoard({
    width, depth, thickness, centerZ = 0, cuts,
    bevel = 0, crown = 0
}: CutBoardOptions): MeshData {
    const values = [width, depth, thickness, centerZ, bevel, crown];
    if (values.some(value => !Number.isFinite(value)) ||
        width <= 0 || depth <= 0 || thickness <= 0 ||
        bevel < 0 || bevel >= Math.min(thickness / 3, depth / 20) ||
        crown < 0 || crown >= thickness / 5 ||
        cuts.some(o =>
            ![o.minX, o.maxX, ...o.topZ, ...o.bottomZ].every(Number.isFinite) ||
            !(o.minX < o.maxX) ||
            !(o.topZ[0] < o.topZ[1] && o.bottomZ[0] < o.bottomZ[1]) ||
            o.minX < -width / 2 || o.maxX > width / 2 ||
            Math.min(o.topZ[0], o.bottomZ[0]) < centerZ - depth / 2 ||
            Math.max(o.topZ[1], o.bottomZ[1]) > centerZ + depth / 2
        )) {
        throw new RangeError("Invalid board dimensions or cut");
    }

    for (let a = 0; a < cuts.length; a++) {
        for (let b = a + 1; b < cuts.length; b++) {
            const x = cuts[a]!;
            const z = cuts[b]!;
            if (x.minX < z.maxX && z.minX < x.maxX &&
                Math.min(x.topZ[1], z.topZ[1], x.bottomZ[1], z.bottomZ[1]) >
                Math.max(x.topZ[0], z.topZ[0], x.bottomZ[0], z.bottomZ[0])) {
                throw new RangeError("Through-cuts must not intersect");
            }
        }
    }

    const halfWidth = width / 2;
    const rear = centerZ - depth / 2;
    const front = centerZ + depth / 2;
    const xStops = [
        -halfWidth, -halfWidth * 0.65, -halfWidth * 0.35, 0,
        halfWidth * 0.35, halfWidth * 0.65, halfWidth,
        ...cuts.flatMap(o => [o.minX, o.maxX])
    ].sort((a, b) => a - b);
    const xs = xStops.filter((v, i) =>
        i === 0 || v - xStops[i - 1]! > 1e-8
    );

    // Each station has a pair of Z coordinates so top and bottom faces
    // have identical connectivity even when the mortise walls are raked.
    const zStops: Station[] = [
        {top: rear, bottom: rear},
        {top: front, bottom: front},
        ...cuts.flatMap(o => [
            {top: o.topZ[0], bottom: o.bottomZ[0]},
            {top: o.topZ[1], bottom: o.bottomZ[1]}
        ])
    ].sort((a, b) => a.top - b.top);
    const zs = zStops.filter((v, i) =>
        i === 0 || Math.abs(v.top - zStops[i - 1]!.top) > 1e-8
    );

    const nx = xs.length;
    const nz = zs.length;
    const filled = Array.from({length: nx - 1}, (_, i) =>
        Array.from({length: nz - 1}, (_, j) => {
            const x = (xs[i]! + xs[i + 1]!) / 2;
            const z = (zs[j]!.top + zs[j + 1]!.top) / 2;
            return !cuts.some(o =>
                x > o.minX && x < o.maxX &&
                z > o.topZ[0] && z < o.topZ[1]
            );
        })
    );
    const occupied = (i: number, j: number) =>
        i >= 0 && i < nx - 1 && j >= 0 && j < nz - 1 &&
        filled[i]![j]!;

    // The cut sketch determines which layered cells exist; the shared
    // grid operation owns the corresponding patches and exposed walls.
    return layeredGridSolid({
        columns: xs,
        rows: zs.map(row => ({
            upper: row.top,
            lower: row.bottom
        })),
        filled,
        upperY: x =>
            thickness / 2 + crown * (1 - (x / halfWidth) ** 2),
        lowerY: () => -thickness / 2,
        bevel,
        surfaceAt: side => {
            if (side === "upper") return "outer";
            if (side === "lower") return "inner";
            if (side === "left" || side === "right") return "cap-start";
            return "edge-left";
        },
        faceUv: point => new THREE.Vector2(
            point.z - rear,
            point.x + halfWidth
        ),
        wallUv: (point, side) => new THREE.Vector2(
            side === "left" || side === "right"
                ? point.z - rear : point.x + halfWidth,
            point.y + thickness / 2
        )
    });
}
