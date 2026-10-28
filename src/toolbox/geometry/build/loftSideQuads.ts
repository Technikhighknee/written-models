import * as THREE from "three";
import type { QuadFace } from "../mesh/MeshData";

export interface LoftSideOptions {
    rings: readonly (readonly THREE.Vector3Like[])[];
    /** Each face uses its own edge width, or a continuous contour distance. */
    uvMode: "edge" | "perimeter";
    surface: (side: number, interval: number) => string;
    smoothingGroup?: (
        side: number,
        interval: number
    ) => string | undefined;
    minimumEdgeLength?: number;
    minimumTravel?: number;
}

export interface LoftSides {
    vertices: THREE.Vector3[];
    quads: QuadFace[];
    centers: THREE.Vector3[];
}

/**
 * Build matching quad strips from authored sections. UVs use physical
 * lengths; the caller chooses how the U origin behaves at each edge.
 * Caps and topology transitions are separate construction operations.
 */
export function loftSideQuads({
    rings,
    uvMode,
    surface,
    smoothingGroup = () => undefined,
    minimumEdgeLength = 0,
    minimumTravel = 0
}: LoftSideOptions): LoftSides {
    const sides = rings[0]?.length ?? 0;

    if (
        rings.length < 2 ||
        sides < 3 ||
        rings.some(ring => ring.length !== sides) ||
        !["edge", "perimeter"].includes(uvMode) ||
        !Number.isFinite(minimumEdgeLength) ||
        minimumEdgeLength < 0 ||
        !Number.isFinite(minimumTravel) ||
        minimumTravel < 0
    ) {
        throw new RangeError("Invalid loft section layout");
    }

    const vertices = rings.flatMap(ring =>
        ring.map(point => {
            if (![point.x, point.y, point.z].every(Number.isFinite)) {
                throw new RangeError("Invalid loft section position");
            }

            return new THREE.Vector3(point.x, point.y, point.z);
        })
    );

    const centers: THREE.Vector3[] = [];
    const perimeter: number[][] = [];
    const travel = [0];

    for (let row = 0; row < rings.length; row++) {
        const center = new THREE.Vector3();
        const cumulative = [0];

        for (let side = 0; side < sides; side++) {
            const first = vertices[row * sides + side]!;
            const second = vertices[row * sides + (side + 1) % sides]!;
            const length = first.distanceTo(second);

            if (!(length > minimumEdgeLength)) {
                throw new RangeError("Loft section has a collapsed edge");
            }

            cumulative.push(cumulative[side]! + length);
            center.add(first);
        }

        center.multiplyScalar(1 / sides);
        centers.push(center);
        perimeter.push(cumulative);

        if (row > 0) {
            const distance = center.distanceTo(centers[row - 1]!);

            if (!(distance > minimumTravel)) {
                throw new RangeError("Consecutive loft centers must differ");
            }

            travel.push(travel[row - 1]! + distance);
        }
    }

    const quads: QuadFace[] = [];

    for (let row = 0; row < rings.length - 1; row++) {
        for (let side = 0; side < sides; side++) {
            const next = (side + 1) % sides;
            const base = row * sides;
            const above = (row + 1) * sides;

            const u0 = uvMode === "edge" ? 0 : perimeter[row]![side]!;
            const u1 = perimeter[row]![side + 1]! -
                (uvMode === "edge" ? perimeter[row]![side]! : 0);
            const u2 = uvMode === "edge" ? 0 : perimeter[row + 1]![side]!;
            const u3 = perimeter[row + 1]![side + 1]! -
                (uvMode === "edge" ? perimeter[row + 1]![side]! : 0);

            const group = smoothingGroup(side, row);

            quads.push({
                corners: [
                    base + side,
                    base + next,
                    above + next,
                    above + side
                ],
                uvs: [
                    new THREE.Vector2(u0, travel[row]!),
                    new THREE.Vector2(u1, travel[row]!),
                    new THREE.Vector2(u3, travel[row + 1]!),
                    new THREE.Vector2(u2, travel[row + 1]!)
                ],
                surface: surface(side, row),
                ...(group === undefined ? {} : { smoothingGroup: group })
            });
        }
    }

    return { vertices, quads, centers };
}
