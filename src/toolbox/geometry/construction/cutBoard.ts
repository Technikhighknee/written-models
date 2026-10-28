import * as THREE from "three";
import {AuthoredMeshBuilder} from "../mesh/AuthoredMeshBuilder";
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

    // The outward half-plane normals of each exposed edge determine the
    // chamfer inset of its top/bottom vertices. No artificial overlay:
    // the face and the edge walls share exactly the same control vertices.
    const insets = Array.from({length: nx}, () =>
        Array.from({length: nz}, () => new THREE.Vector2()));
    type Side = "left" | "right" | "back" | "front";
    const boundary: {a: readonly [number, number]; b: readonly [number, number]; side: Side}[] = [];
    for (let i = 0; i < nx - 1; i++) {
        for (let j = 0; j < nz - 1; j++) {
            if (!filled[i]![j]) continue;
            const add = (a: readonly [number, number], b: readonly [number, number],
                side: Side, dx: number, dz: number) => {
                boundary.push({a, b, side});
                insets[a[0]]![a[1]]!.add(new THREE.Vector2(dx, dz));
                insets[b[0]]![b[1]]!.add(new THREE.Vector2(dx, dz));
            };
            if (!occupied(i - 1, j)) add([i, j], [i, j + 1], "left", 1, 0);
            if (!occupied(i + 1, j)) add([i + 1, j + 1], [i + 1, j], "right", -1, 0);
            if (!occupied(i, j - 1)) add([i + 1, j], [i, j], "back", 0, 1);
            if (!occupied(i, j + 1)) add([i, j + 1], [i + 1, j + 1], "front", 0, -1);
        }
    }

    const builder = new AuthoredMeshBuilder();
    const topY = (x: number) =>
        thickness / 2 + crown * (1 - (x / halfWidth) ** 2);
    const position = (i: number, j: number, upper: boolean, chamfered: boolean) => {
        const x = xs[i]!;
        const z = upper ? zs[j]!.top : zs[j]!.bottom;
        const inset = insets[i]![j]!;
        const amount = chamfered ? bevel : 0;
        const shiftedX = x + Math.sign(inset.x) * amount;
        return new THREE.Vector3(
            shiftedX,
            upper ? topY(shiftedX) - (chamfered ? 0 : bevel) :
                -thickness / 2 + (chamfered ? 0 : bevel),
            z + Math.sign(inset.y) * amount
        );
    };
    const face = (
        corners: readonly THREE.Vector3[],
        surface: string, uv: (p: THREE.Vector3) => THREE.Vector2
    ) => {
        builder.addFace(corners, corners.map(uv), surface);
    };
    const flatUv = (p: THREE.Vector3) => new THREE.Vector2(
        p.z - rear, p.x + halfWidth
    );
    for (let i = 0; i < nx - 1; i++) {
        for (let j = 0; j < nz - 1; j++) {
            if (!filled[i]![j]) continue;
            // Counter-clockwise from above (+Y), and reverse below.
            face([
                position(i, j, true, true),
                position(i, j + 1, true, true),
                position(i + 1, j + 1, true, true),
                position(i + 1, j, true, true)
            ], "outer", flatUv);
            face([
                position(i, j, false, true),
                position(i + 1, j, false, true),
                position(i + 1, j + 1, false, true),
                position(i, j + 1, false, true)
            ], "inner", flatUv);
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

        // Face normal follows the outward direction for each boundary.
        const surface = side === "left" || side === "right"
            ? "cap-start" : "edge-left";
        const wallUv = (p: THREE.Vector3) => new THREE.Vector2(
            side === "left" || side === "right" ? p.z - rear : p.x + halfWidth,
            p.y + thickness / 2
        );
        if (bevel > 0) {
            face([topA, upperA, upperB, topB], surface, wallUv);
        }
        face([upperA, lowerA, lowerB, upperB], surface, wallUv);
        if (bevel > 0) {
            face([lowerA, bottomA, bottomB, lowerB], surface, wallUv);
        }
    }
    return builder.build();
}
