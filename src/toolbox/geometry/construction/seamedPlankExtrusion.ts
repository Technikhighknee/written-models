import * as THREE from "three";
import { registerControlOutline } from "../mesh/controlOutline";

/** A point in the X/Z plane. The board's grain runs along Z. */
export type PanelPoint = readonly [x: number, z: number];

/** A point on a finished board, before optional hand-working. */
export interface PlankVertex {
    x: number;
    y: number;
    z: number;
}

export interface SeamedPlankOptions {
    thickness: number;
    /** Width of each sloping shoulder on the exposed broad faces. */
    shoulderWidth: number;
    /** Depth of the recess at the actual board-to-board contact. */
    recessDepth: number;
    /**
     * Width of the flat, recessed seam floor on each plank edge.
     * Zero keeps the original pointed V-groove and two material slots.
     * Positive values add a third material slot for the shaded floor.
     */
    grooveFloorWidth?: number;
    /** The minimum-X edge is a board seam (not the outer outline). */
    seamAtStart: boolean;
    /** The maximum-X edge is a board seam (not the outer outline). */
    seamAtEnd: boolean;
    /** Dot-product threshold for distinguishing true end grain. */
    cutThreshold?: number;
    /** Extra stations along the grain: real edge loops, not wireframe guesses. */
    longitudinalSegments?: number;
    /** Shape the finished timber while its faces and control edges are authored. */
    deform?: (vertex: Readonly<PlankVertex>) => PlankVertex;
}

interface Station {
    x: number;
    low: number;
    high: number;
    top: number;
    bottom: number;
}

const EPSILON = 1e-9;

/**
 * Extrude a convex, longitudinal wooden plank with *closed* V-seams.
 *
 * Along either selected X boundary, both broad faces gently slope into
 * the joint. The vertical sidewall still meets its neighboring board at
 * exactly the same X: there is no opening through the plank thickness.
 *
 * Every curved outline corner is retained, while shoulder support loops
 * make real geometry instead of painted stripes. Broad faces and sidewall
 * strips are quads internally; the circular-outline tips are triangles.
 * Slot 0 = long grain, slot 1 = exposed end grain.
 *
 * The function is also suitable for doors, shutters or fitted wooden
 * panels, not only round barrel heads.
 */
export function seamedPlankExtrusion(
    outline: readonly PanelPoint[],
    {
        thickness,
        shoulderWidth,
        recessDepth,
        grooveFloorWidth = 0,
        seamAtStart,
        seamAtEnd,
        cutThreshold = 0.68,
        longitudinalSegments = 1,
        deform
    }: SeamedPlankOptions
): THREE.BufferGeometry {
    if (
        outline.length < 3 ||
        ![thickness, shoulderWidth, recessDepth, grooveFloorWidth, cutThreshold]
            .every(Number.isFinite) ||
        thickness <= 0 || shoulderWidth <= 0 ||
        recessDepth <= 0 || recessDepth >= thickness / 2 ||
        grooveFloorWidth < 0 || grooveFloorWidth >= shoulderWidth ||
        cutThreshold <= 0 || cutThreshold >= 1 ||
        !Number.isInteger(longitudinalSegments) ||
        longitudinalSegments < 1 || longitudinalSegments > 32 ||
        outline.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
    ) {
        throw new RangeError("Invalid fitted plank or seam relief");
    }

    const xs = outline.map(point => point[0]);
    const start = Math.min(...xs);
    const end = Math.max(...xs);

    if (
        end - start <= 2 * shoulderWidth ||
        (!seamAtStart && !seamAtEnd)
    ) {
        throw new RangeError("Seam relief needs a valid plank span and seam");
    }

    // The input outline is convex. Add two longitudinal support stations
    // per seam, then subdivide at every original polygon vertex to preserve
    // exactly the original trimmed outline, including the circular perimeter.
    const stationsX = [...xs];
    if (seamAtStart) {
        if (grooveFloorWidth > 0) stationsX.push(start + grooveFloorWidth);
        stationsX.push(start + shoulderWidth);
    }
    if (seamAtEnd) {
        stationsX.push(end - shoulderWidth);
        if (grooveFloorWidth > 0) stationsX.push(end - grooveFloorWidth);
    }
    stationsX.sort((a, b) => a - b);

    const uniqueX: number[] = [];
    for (const x of stationsX) {
        if (!uniqueX.length || x - uniqueX[uniqueX.length - 1]! > EPSILON) {
            uniqueX.push(x);
        }
    }

    function spanAt(x: number): [number, number] {
        const hits: number[] = [];

        for (let i = 0; i < outline.length; i++) {
            const a = outline[i]!;
            const b = outline[(i + 1) % outline.length]!;
            const dx = b[0] - a[0];

            if (Math.abs(dx) < EPSILON) {
                if (Math.abs(x - a[0]) < EPSILON) {
                    hits.push(a[1], b[1]);
                }
            } else if (
                x >= Math.min(a[0], b[0]) - EPSILON &&
                x <= Math.max(a[0], b[0]) + EPSILON
            ) {
                const t = Math.max(0, Math.min(1, (x - a[0]) / dx));
                hits.push(a[1] + (b[1] - a[1]) * t);
            }
        }

        if (!hits.length) {
            throw new RangeError("Could not intersect convex plank outline");
        }

        return [Math.min(...hits), Math.max(...hits)];
    }

    function insetAt(x: number): number {
        const ramp = shoulderWidth - grooveFloorWidth;
        const a = seamAtStart
            ? (start + shoulderWidth - x) / ramp
            : 0;
        const b = seamAtEnd
            ? (x - (end - shoulderWidth)) / ramp
            : 0;
        return recessDepth * Math.max(0, Math.min(1, Math.max(a, b)));
    }

    const stations: Station[] = uniqueX.map(x => {
        const [low, high] = spanAt(x);
        const inset = insetAt(x);
        return {
            x, low, high,
            top: thickness / 2 - inset,
            bottom: -thickness / 2 + inset
        };
    });

    const verts = [
        [] as number[], [] as number[], [] as number[]
    ];
    const normals = [
        [] as number[], [] as number[], [] as number[]
    ];
    const uvSets = [
        [] as number[], [] as number[], [] as number[]
    ];

    // Actual construction edges, not the diagonal created by triangulation.
    // When a circular outline tapers to a single point, the strip ends in
    // one genuine triangle; that triangle must not be counted as a quad.
    type Vertex = PlankVertex;
    const controlEdges = new Map<string, readonly [Vertex, Vertex]>();
    let quadCount = 0;

    function recordFace(corners: readonly Vertex[]): void {
        const keyOf = (p: Vertex): string =>
            [p.x, p.y, p.z].map(v => Math.round(v * 1e9)).join(":");

        for (let i = 0; i < corners.length; i++) {
            const a = corners[i]!;
            const b = corners[(i + 1) % corners.length]!;
            const ka = keyOf(a);
            const kb = keyOf(b);
            if (ka === kb) continue;

            const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
            if (!controlEdges.has(key)) controlEdges.set(key, [a, b]);
        }
    }


    const point = (x: number, y: number, z: number): Vertex => ({ x, y, z });

    function triangle(
        a: Vertex, b: Vertex, c: Vertex,
        material: 0 | 1 | 2,
        sidewall = false
    ): boolean {
        const ab = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
        const ac = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z);
        const n = ab.cross(ac);
        if (n.lengthSq() < 1e-18) return false;
        n.normalize();

        for (const p of [a, b, c]) {
            verts[material]!.push(p.x, p.y, p.z);
            normals[material]!.push(n.x, n.y, n.z);

            // Physical meter UVs. Long-grain V follows Z; end-grain
            // exposes a true transverse surface across X and Y.
            uvSets[material]!.push(
                material === 1 ? p.x : (sidewall ? p.y : p.x),
                material === 1 ? p.y : p.z
            );
        }
        return true;
    }

    function worked(p: Vertex): Vertex {
        if (!deform) return p;
        const moved = deform(p);
        if (![moved.x, moved.y, moved.z].every(Number.isFinite)) {
            throw new RangeError("Invalid deformed plank vertex");
        }
        return moved;
    }

    function lerpVertex(a: Vertex, b: Vertex, t: number): Vertex {
        return point(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.z + (b.z - a.z) * t
        );
    }

    function emitQuad(
        a: Vertex, b: Vertex, c: Vertex, d: Vertex,
        material: 0 | 1 | 2,
        sidewall: boolean
    ): void {
        // Apply the same deformation to rendered vertices AND authored
        // construction edges. Otherwise the Quad mode tells a different story.
        const wa = worked(a);
        const wb = worked(b);
        const wc = worked(c);
        const wd = worked(d);
        const first = triangle(wa, wb, wc, material, sidewall);
        const second = triangle(wa, wc, wd, material, sidewall);

        if (first && second) {
            quadCount++;
            recordFace([wa, wb, wc, wd]);
        } else if (first) {
            recordFace([wa, wb, wc]);
        } else if (second) {
            recordFace([wa, wc, wd]);
        }
    }

    function quad(
        a: Vertex, b: Vertex, c: Vertex, d: Vertex,
        material: 0 | 1 | 2,
        sidewall = false,
        // Which two opposite edges run along the grain?
        longitudinal?: "ab" | "ad"
    ): void {
        if (!longitudinal || longitudinalSegments === 1) {
            emitQuad(a, b, c, d, material, sidewall);
            return;
        }

        for (let i = 0; i < longitudinalSegments; i++) {
            const t0 = i / longitudinalSegments;
            const t1 = (i + 1) / longitudinalSegments;

            if (longitudinal === "ab") {
                emitQuad(
                    lerpVertex(a, b, t0),
                    lerpVertex(a, b, t1),
                    lerpVertex(d, c, t1),
                    lerpVertex(d, c, t0),
                    material, sidewall
                );
            } else {
                emitQuad(
                    lerpVertex(a, d, t0),
                    lerpVertex(b, c, t0),
                    lerpVertex(b, c, t1),
                    lerpVertex(a, d, t1),
                    material, sidewall
                );
            }
        }
    }

    // The upper and lower surfaces follow the same shallow seam profile,
    // so the plank is visibly joined on either side of the barrel head.
    for (let i = 0; i < stations.length - 1; i++) {
        const a = stations[i]!;
        const b = stations[i + 1]!;

        // Only the narrow horizontal groove floor is darkened.
        // Both sloping shoulders retain the same grain as the board.
        const grooveFloor = grooveFloorWidth > 0 && (
            (seamAtStart && b.x <= start + grooveFloorWidth + EPSILON) ||
            (seamAtEnd && a.x >= end - grooveFloorWidth - EPSILON)
        );
        const faceMaterial: 0 | 2 = grooveFloor ? 2 : 0;

        quad(
            point(a.x, a.top, a.low),
            point(a.x, a.top, a.high),
            point(b.x, b.top, b.high),
            point(b.x, b.top, b.low), faceMaterial, false, "ab"
        );
        quad(
            point(a.x, a.bottom, a.low),
            point(b.x, b.bottom, b.low),
            point(b.x, b.bottom, b.high),
            point(a.x, a.bottom, a.high), faceMaterial, false, "ad"
        );

        for (const [z0, z1, highSide] of [
            [a.low, b.low, false],
            [a.high, b.high, true]
        ] as const) {
            const length = Math.hypot(b.x - a.x, z1 - z0);
            const material: 0 | 1 =
                (b.x - a.x) / length >= cutThreshold ? 1 : 0;

            if (highSide) {
                quad(
                    point(a.x, a.top, z0),
                    point(a.x, a.bottom, z0),
                    point(b.x, b.bottom, z1),
                    point(b.x, b.top, z1),
                    material, true
                );
            } else {
                quad(
                    point(a.x, a.top, z0),
                    point(b.x, b.top, z1),
                    point(b.x, b.bottom, z1),
                    point(a.x, a.bottom, z0),
                    material, true
                );
            }
        }
    }

    const first = stations[0]!;
    const last = stations[stations.length - 1]!;

    // The two long board-to-board contacts remain filled throughout the
    // central thickness. At a tapered circular tip, the cap is degenerate
    // and is skipped by triangle() without introducing an open boundary.
    quad(
        point(first.x, first.top, first.low),
        point(first.x, first.bottom, first.low),
        point(first.x, first.bottom, first.high),
        point(first.x, first.top, first.high), 0, true, "ad"
    );
    quad(
        point(last.x, last.top, last.low),
        point(last.x, last.top, last.high),
        point(last.x, last.bottom, last.high),
        point(last.x, last.bottom, last.low), 0, true, "ab"
    );

    const geometry = new THREE.BufferGeometry();
    const positions = verts[0]!.concat(verts[1]!, verts[2]!);
    const normalValues = normals[0]!.concat(normals[1]!, normals[2]!);
    const uvs = uvSets[0]!.concat(uvSets[1]!, uvSets[2]!);

    geometry.setAttribute(
        "position", new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
        "normal", new THREE.Float32BufferAttribute(normalValues, 3)
    );
    geometry.setAttribute(
        "uv", new THREE.Float32BufferAttribute(uvs, 2)
    );
    geometry.addGroup(0, verts[0]!.length / 3, 0);
    if (verts[1]!.length) {
        geometry.addGroup(verts[0]!.length / 3, verts[1]!.length / 3, 1);
    }
    if (verts[2]!.length) {
        geometry.addGroup(
            (verts[0]!.length + verts[1]!.length) / 3,
            verts[2]!.length / 3, 2
        );
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const outlinePositions: number[] = [];
    for (const [a, b] of controlEdges.values()) {
        outlinePositions.push(
            a.x, a.y, a.z,
            b.x, b.y, b.z
        );
    }
    registerControlOutline(geometry, {
        positions: outlinePositions,
        quadCount
    });

    return geometry;
}
