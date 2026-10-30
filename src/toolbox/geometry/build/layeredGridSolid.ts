import * as THREE from "three";

import { AuthoredMeshBuilder } from "../mesh/AuthoredMeshBuilder";
import type { MeshData } from "../mesh/MeshData";

export interface LayeredGridRow {
    /** Independently authored transverse position of each layer. */
    upper: number;
    lower: number;
}

export type GridBorder = "left" | "right" | "back" | "front";
export type GridSurface = "upper" | "lower" | GridBorder;

export interface LayeredGridSolidOptions {
    /** Longitudinal landmarks shared by both layers, strictly increasing. */
    columns: readonly number[];
    /** Ordered transverse landmarks; the layers need not be aligned in Z. */
    rows: readonly LayeredGridRow[];
    /** Filled cells; false creates a through-cut or open housing. */
    filled: readonly (readonly boolean[])[];
    upperY: (x: number) => number;
    lowerY: (x: number) => number;
    /** Uniform edge inset for the upper and lower face boundary. */
    bevel?: number;
    surfaceAt: (side: GridSurface) => string;
    faceUv: (point: THREE.Vector3) => THREE.Vector2;
    wallUv: (
        point: THREE.Vector3,
        side: GridBorder
    ) => THREE.Vector2;
}

/**
 * Build corresponding sampled upper/lower surfaces of a layered solid.
 *
 * Both layers share the same cell topology but can have different
 * transverse coordinates and independently shaped vertical profiles.
 * Exposed sides of removed cells become genuine walls. Top, bottom,
 * bevel and wall faces share the same construction vertices, so a
 * cut with a changing footprint produces neither cracks nor overlays.
 */
export function layeredGridSolid({
    columns,
    rows,
    filled,
    upperY,
    lowerY,
    bevel = 0,
    surfaceAt,
    faceUv,
    wallUv
}: LayeredGridSolidOptions): MeshData {
    const nx = columns.length;
    const nz = rows.length;

    if (
        nx < 2 || nz < 2 ||
        !Number.isFinite(bevel) || bevel < 0 ||
        columns.some((x, index) => !Number.isFinite(x) ||
            (index > 0 && x <= columns[index - 1]!)) ||
        rows.some((row, index) =>
            !Number.isFinite(row.upper) ||
            !Number.isFinite(row.lower) ||
            (index > 0 && (
                row.upper <= rows[index - 1]!.upper ||
                row.lower <= rows[index - 1]!.lower
            ))
        ) ||
        filled.length !== nx - 1 ||
        filled.some(line => line.length !== nz - 1 ||
            line.some(value => typeof value !== "boolean")) ||
        !filled.some(line => line.some(Boolean)) ||
        [upperY, lowerY, surfaceAt, faceUv, wallUv]
            .some(callback => typeof callback !== "function")
    ) {
        throw new RangeError("Invalid layered grid solid");
    }

    const occupied = (i: number, j: number) =>
        i >= 0 && i < nx - 1 && j >= 0 && j < nz - 1 &&
        filled[i]![j]!;

    const insets = Array.from({length: nx}, () =>
        Array.from({length: nz}, () => new THREE.Vector2()));

    const boundary: {
        a: readonly [number, number];
        b: readonly [number, number];
        side: GridBorder;
    }[] = [];

    for (let i = 0; i < nx - 1; i++) {
        for (let j = 0; j < nz - 1; j++) {
            if (!filled[i]![j]) continue;

            const add = (
                a: readonly [number, number],
                b: readonly [number, number],
                side: GridBorder,
                dx: number,
                dz: number
            ) => {
                boundary.push({a, b, side});
                insets[a[0]]![a[1]]!.add(new THREE.Vector2(dx, dz));
                insets[b[0]]![b[1]]!.add(new THREE.Vector2(dx, dz));
            };

            if (!occupied(i - 1, j)) {
                add([i, j], [i, j + 1], "left", 1, 0);
            }
            if (!occupied(i + 1, j)) {
                add([i + 1, j + 1], [i + 1, j], "right", -1, 0);
            }
            if (!occupied(i, j - 1)) {
                add([i + 1, j], [i, j], "back", 0, 1);
            }
            if (!occupied(i, j + 1)) {
                add([i, j + 1], [i + 1, j + 1], "front", 0, -1);
            }
        }
    }

    const position = (
        i: number,
        j: number,
        upper: boolean,
        chamfered: boolean
    ): THREE.Vector3 => {
        const x = columns[i]!;
        const z = upper ? rows[j]!.upper : rows[j]!.lower;
        const inset = insets[i]![j]!;
        const amount = chamfered ? bevel : 0;
        const shiftedX = x + Math.sign(inset.x) * amount;
        const y = upper
            ? upperY(shiftedX) - (chamfered ? 0 : bevel)
            : lowerY(shiftedX) + (chamfered ? 0 : bevel);
        const point = new THREE.Vector3(
            shiftedX,
            y,
            z + Math.sign(inset.y) * amount
        );

        if (!point.toArray().every(Number.isFinite)) {
            throw new RangeError("Layered profile produced nonfinite geometry");
        }
        return point;
    };

    const builder = new AuthoredMeshBuilder({ weld: "position" });
    const face = (
        vertices: readonly THREE.Vector3[],
        surface: string,
        uv: (point: THREE.Vector3) => THREE.Vector2
    ) => {
        builder.addFace(vertices, vertices.map(uv), surface);
    };

    for (let i = 0; i < nx - 1; i++) {
        for (let j = 0; j < nz - 1; j++) {
            if (!filled[i]![j]) continue;

            face([
                position(i, j, true, true),
                position(i, j + 1, true, true),
                position(i + 1, j + 1, true, true),
                position(i + 1, j, true, true)
            ], surfaceAt("upper"), faceUv);

            face([
                position(i, j, false, true),
                position(i + 1, j, false, true),
                position(i + 1, j + 1, false, true),
                position(i, j + 1, false, true)
            ], surfaceAt("lower"), faceUv);
        }
    }

    for (const {a, b, side} of boundary) {
        const [ai, aj] = a;
        const [bi, bj] = b;
        const topA = position(ai, aj, true, true);
        const topB = position(bi, bj, true, true);
        const upperA = position(ai, aj, true, false);
        const upperB = position(bi, bj, true, false);
        const lowerA = position(ai, aj, false, false);
        const lowerB = position(bi, bj, false, false);
        const bottomA = position(ai, aj, false, true);
        const bottomB = position(bi, bj, false, true);
        const uv = (point: THREE.Vector3) => wallUv(point, side);
        const region = surfaceAt(side);

        if (bevel > 0) {
            face([topA, upperA, upperB, topB], region, uv);
        }

        face([upperA, lowerA, lowerB, upperB], region, uv);

        if (bevel > 0) {
            face([lowerA, bottomA, bottomB, lowerB], region, uv);
        }
    }

    return builder.build();
}
