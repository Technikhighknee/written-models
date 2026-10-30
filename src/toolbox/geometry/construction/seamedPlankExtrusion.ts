import * as THREE from "three";
import { AuthoredMeshBuilder } from "../mesh/AuthoredMeshBuilder";
import type { MeshData } from "../mesh/MeshData";
import { sampleAdaptiveStations } from "../topology/adaptiveStations";
import { edgeRecessStations, edgeRecessDepth } from "../../shapes/profiles/edgeRecess";

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
     * Zero produces a pointed V-groove with two material slots.
     * Positive values add a third slot for the shaded floor.
     */
    grooveFloorWidth?: number;
    /** The minimum-X edge is a board seam (not the outer outline). */
    seamAtStart: boolean;
    /** The maximum-X edge is a board seam (not the outer outline). */
    seamAtEnd: boolean;
    /**
     * Which face needs the fitted surface detail? Both is the default.
     * The opposite face stays planar and uses no grain-wise subdivision.
     */
    detailedFace?: "top" | "bottom" | "both";
    /** Dot-product threshold for distinguishing true end grain. */
    cutThreshold?: number;
    /** Extra stations along the grain: real edge loops, not wireframe guesses. */
    longitudinalSegments?: number;
    /**
     * Tolerance-driven stations along the grain. Shared by every face of
     * this plank, so neighboring quad strips cannot develop T-junctions.
     */
    adaptiveLongitudinal?: {
        maxDeviation: number;
        maxDepth?: number;
    };
    /**
     * Externally coordinated stations for joined panels. All neighboring
     * boards must use the same stations where they touch.
     */
    longitudinalStations?: readonly number[];
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
export function seamedPlankExtrusionData(
    outline: readonly PanelPoint[],
    {
        thickness,
        shoulderWidth,
        recessDepth,
        grooveFloorWidth = 0,
        seamAtStart,
        seamAtEnd,
        detailedFace = "both",
        cutThreshold = 0.68,
        longitudinalSegments = 1,
        adaptiveLongitudinal,
        longitudinalStations,
        deform
    }: SeamedPlankOptions
): { geometry: MeshData; stations: readonly number[] } {
    if (
        outline.length < 3 ||
        ![thickness, shoulderWidth, recessDepth, grooveFloorWidth, cutThreshold]
            .every(Number.isFinite) ||
        thickness <= 0 || shoulderWidth <= 0 ||
        !["top", "bottom", "both"].includes(detailedFace) ||
        recessDepth <= 0 || recessDepth >= thickness / 2 ||
        grooveFloorWidth < 0 || grooveFloorWidth >= shoulderWidth ||
        cutThreshold <= 0 || cutThreshold >= 1 ||
        !Number.isInteger(longitudinalSegments) ||
        longitudinalSegments < 1 || longitudinalSegments > 32 ||
        (adaptiveLongitudinal !== undefined && longitudinalSegments !== 1) ||
        (longitudinalStations !== undefined && (
            adaptiveLongitudinal !== undefined ||
            longitudinalSegments !== 1 ||
            longitudinalStations.length < 2 ||
            longitudinalStations[0] !== 0 ||
            longitudinalStations.at(-1) !== 1 ||
            longitudinalStations.some((t, i) =>
                !Number.isFinite(t) ||
                (i > 0 && t <= longitudinalStations[i - 1]!)
            )
        )) ||
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
    const recess = {
        start, end,
        shoulder: shoulderWidth,
        depth: recessDepth,
        floor: grooveFloorWidth,
        atStart: seamAtStart,
        atEnd: seamAtEnd
    };
    const stationsX = [...xs, ...edgeRecessStations(recess)];
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

    const stations: Station[] = uniqueX.map(x => {
        const [low, high] = spanAt(x);
        const inset = edgeRecessDepth(x, recess);
        return {
            x, low, high,
            top: thickness / 2 - (detailedFace === "bottom" ? 0 : inset),
            bottom: -thickness / 2 + (detailedFace === "top" ? 0 : inset)
        };
    });

    type Vertex = PlankVertex;
    const mesh = new AuthoredMeshBuilder({ weld: "position" });

    function recordFace(
        corners: readonly Vertex[],
        material: 0 | 1 | 2,
        sidewall: boolean
    ): void {
        const uvs = corners.map(p => new THREE.Vector2(
            material === 1 ? p.x : (sidewall ? p.y : p.x),
            material === 1 ? p.y : p.z
        ));
        mesh.addFace(
            corners, uvs,
            material === 1 ? "cut" : material === 2 ? "recess" : "face"
        );
    }

    const point = (x: number, y: number, z: number): Vertex => ({ x, y, z });

    function validTriangle(a: Vertex, b: Vertex, c: Vertex): boolean {
        const ab = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
        const ac = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z);
        return ab.cross(ac).lengthSq() >= 1e-18;
    }

    function emitTriangle(
        a: Vertex, b: Vertex, c: Vertex,
        material: 0 | 1 | 2,
        sidewall = false
    ): void {
        const wa = worked(a);
        const wb = worked(b);
        const wc = worked(c);
        if (validTriangle(wa, wb, wc)) {
            recordFace([wa, wb, wc], material, sidewall);
        }
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
        const first = validTriangle(wa, wb, wc);
        const second = validTriangle(wa, wc, wd);

        if (first && second) {
            recordFace([wa, wb, wc, wd], material, sidewall);
        } else if (first) {
            recordFace([wa, wb, wc], material, sidewall);
        } else if (second) {
            recordFace([wa, wc, wd], material, sidewall);
        }
    }

    // All width stations use the SAME longitudinal partition. Adaptive
    // sampling is based on the finished displaced vertices (both faces,
    // every width station), not the unworked rectangular source surface.
    // This keeps shared edges watertight and the control mesh truthful.
    const fractions = longitudinalStations ? [...longitudinalStations]
        : adaptiveLongitudinal ? sampleAdaptiveStations(
            t => stations.flatMap(station => {
                const z = station.low + (station.high - station.low) * t;
                return [
                    worked(point(station.x, station.top, z)),
                    worked(point(station.x, station.bottom, z))
                ];
            }),
            adaptiveLongitudinal
        ).stations : Array.from(
            { length: longitudinalSegments + 1 },
            (_, i) => i / longitudinalSegments
        );

    function quad(
        a: Vertex, b: Vertex, c: Vertex, d: Vertex,
        material: 0 | 1 | 2,
        sidewall = false,
        // Which two opposite edges run along the grain?
        longitudinal?: "ab" | "ad"
    ): void {
        if (!longitudinal || fractions.length === 2) {
            emitQuad(a, b, c, d, material, sidewall);
            return;
        }

        for (let i = 0; i < fractions.length - 1; i++) {
            const t0 = fractions[i]!;
            const t1 = fractions[i + 1]!;

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
        // There is no dark groove floor on a deliberately plain reverse.
        const topMaterial: 0 | 2 = grooveFloor &&
            detailedFace !== "bottom" ? 2 : 0;
        const bottomMaterial: 0 | 2 = grooveFloor &&
            detailedFace !== "top" ? 2 : 0;

        quad(
            point(a.x, a.top, a.low),
            point(a.x, a.top, a.high),
            point(b.x, b.top, b.high),
            point(b.x, b.top, b.low), topMaterial, false,
            detailedFace === "bottom" ? undefined : "ab"
        );
        quad(
            point(a.x, a.bottom, a.low),
            point(b.x, b.bottom, b.low),
            point(b.x, b.bottom, b.high),
            point(a.x, a.bottom, a.high), bottomMaterial, false,
            detailedFace === "top" ? undefined : "ad"
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

    // The joinery sidewalls and circular trim remain closed. At the two
    // end caps, bridge the detailed perimeter to the SIMPLE hidden edge
    // using real triangles rather than adding hidden support loops.
    const first = stations[0]!;
    const last = stations[stations.length - 1]!;

    function cap(station: Station, atStart: boolean): void {
        const topAt = (t: number): Vertex =>
            point(station.x, station.top,
                station.low + (station.high - station.low) * t);
        const bottomAt = (t: number): Vertex =>
            point(station.x, station.bottom,
                station.low + (station.high - station.low) * t);

        if (detailedFace === "both" || fractions.length === 2) {
            if (atStart) {
                quad(
                    topAt(0), bottomAt(0),
                    bottomAt(1), topAt(1), 0, true, "ad"
                );
            } else {
                quad(
                    topAt(0), topAt(1),
                    bottomAt(1), bottomAt(0), 0, true, "ab"
                );
            }
            return;
        }

        if (detailedFace === "top") {
            if (atStart) {
                for (let i = 0; i < fractions.length - 1; i++) {
                    emitTriangle(
                        topAt(fractions[i]!), bottomAt(0),
                        topAt(fractions[i + 1]!), 0, true
                    );
                }
                emitTriangle(bottomAt(0), bottomAt(1), topAt(1), 0, true);
            } else {
                for (let i = 0; i < fractions.length - 1; i++) {
                    emitTriangle(
                        bottomAt(1), topAt(fractions[i]!),
                        topAt(fractions[i + 1]!), 0, true
                    );
                }
                emitTriangle(topAt(0), bottomAt(1), bottomAt(0), 0, true);
            }
        } else {
            if (atStart) {
                for (let i = 0; i < fractions.length - 1; i++) {
                    emitTriangle(
                        topAt(0), bottomAt(fractions[i]!),
                        bottomAt(fractions[i + 1]!), 0, true
                    );
                }
                emitTriangle(topAt(0), bottomAt(1), topAt(1), 0, true);
            } else {
                for (let i = 0; i < fractions.length - 1; i++) {
                    emitTriangle(
                        topAt(1), bottomAt(fractions[i + 1]!),
                        bottomAt(fractions[i]!), 0, true
                    );
                }
                emitTriangle(topAt(0), topAt(1), bottomAt(0), 0, true);
            }
        }
    }

    cap(first, true);
    cap(last, false);

    // The actual authored faces are the only topology representation.
    // Rendering and the Quad View consume this same MeshData object.
    return { geometry: mesh.build(), stations: fractions };
}

