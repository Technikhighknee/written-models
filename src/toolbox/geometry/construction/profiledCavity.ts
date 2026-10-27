import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";

export interface CavityRing {
    y: number;
    /** Horizontal polygon: x represents world X, y represents world Z. */
    outline: readonly THREE.Vector2Like[];
}

/** Polygonal lofted cavity. Matching contours interpolate between heights. */
export class ProfiledCavity {
    readonly rings: readonly CavityRing[];
    readonly capacity: number;

    constructor(rings: readonly CavityRing[]) {
        const count = rings[0]?.outline.length ?? 0;

        if (rings.length < 2 || count < 3 || rings.some((ring, i) =>
            !Number.isFinite(ring.y) ||
            (i > 0 && ring.y <= rings[i - 1]!.y) ||
            ring.outline.length !== count ||
            ring.outline.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)) ||
            polygonArea(ring.outline) <= 1e-15
        )) {
            throw new RangeError("Invalid cavity sections");
        }

        this.rings = rings.map(ring => ({
            y: ring.y,
            outline: ring.outline.map(p => new THREE.Vector2(p.x, p.y))
        }));
        this.capacity = this.volumeAt(this.top);
    }

    get bottom(): number {
        return this.rings[0]!.y;
    }

    get top(): number {
        return this.rings.at(-1)!.y;
    }

    sectionAt(y: number): CavityRing {
        if (!Number.isFinite(y) || y < this.bottom || y > this.top) {
            throw new RangeError("Section is outside the cavity");
        }

        for (let i = 1; i < this.rings.length; i++) {
            const upper = this.rings[i]!;
            if (y > upper.y) continue;

            const lower = this.rings[i - 1]!;
            const t = (y - lower.y) / (upper.y - lower.y);

            return {
                y,
                outline: lower.outline.map((p, j) => new THREE.Vector2(
                    THREE.MathUtils.lerp(p.x, upper.outline[j]!.x, t),
                    THREE.MathUtils.lerp(p.y, upper.outline[j]!.y, t)
                ))
            };
        }

        return this.rings.at(-1)!;
    }

    /** Exact volume: cross-sectional area is quadratic in each loft segment. */
    volumeAt(height: number): number {
        if (!Number.isFinite(height)) {
            throw new RangeError("Invalid cavity height");
        }

        const top = THREE.MathUtils.clamp(height, this.bottom, this.top);
        let volume = 0;

        for (let i = 1; i < this.rings.length; i++) {
            const lower = this.rings[i - 1]!;
            const upper = this.rings[i]!;
            if (top <= lower.y) break;

            const end = Math.min(top, upper.y);
            const middle = this.sectionAt((lower.y + end) / 2);
            const capped = this.sectionAt(end);

            volume += (end - lower.y) / 6 * (
                polygonArea(lower.outline) +
                4 * polygonArea(middle.outline) +
                polygonArea(capped.outline)
            );
        }

        return volume;
    }

    heightAtFill(fraction: number): number {
        if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
            throw new RangeError("Fill level must be between 0 and 1");
        }
        if (fraction === 0) return this.bottom;
        if (fraction === 1) return this.top;

        const target = this.capacity * fraction;
        let low = this.bottom;
        let high = this.top;

        for (let i = 0; i < 36; i++) {
            const middle = (low + high) / 2;
            if (this.volumeAt(middle) < target) {
                low = middle;
            } else {
                high = middle;
            }
        }

        return (low + high) / 2;
    }

    between(bottom: number, top: number): ProfiledCavity {
        if (bottom < this.bottom || top > this.top || bottom >= top) {
            throw new RangeError("Invalid cavity limits");
        }

        return new ProfiledCavity([
            this.sectionAt(bottom),
            ...this.rings.filter(ring => ring.y > bottom && ring.y < top),
            this.sectionAt(top)
        ]);
    }
}

function polygonArea(outline: readonly THREE.Vector2Like[]): number {
    let twice = 0;
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i]!;
        const b = outline[(i + 1) % outline.length]!;
        twice += a.x * b.y - a.y * b.x;
    }
    return Math.abs(twice) / 2;
}

/**
 * Reconstruct a lofted cavity from the edges of its authored inner faces.
 * Each horizontal section must be one closed contour with matching vertices.
 */
export function cavityFromMeshSurfaces(
    pieces: readonly MeshData[],
    surface = "inner"
): ProfiledCavity {
    interface Row {
        points: Map<string, THREE.Vector3>;
        edges: Map<string, readonly [string, string]>;
    }

    const rows = new Map<number, Row>();
    const rising = new Map<string, Set<string>>();
    const heightKey = (y: number) => Math.round(y * 1e7);
    const pointKey = (p: THREE.Vector3Like) =>
        `${Math.round(p.x * 1e7)}:${Math.round(p.z * 1e7)}`;
    const vertexKey = (y: number, point: string) => `${y}/${point}`;

    function rowAt(height: number): Row {
        let row = rows.get(height);
        if (!row) {
            row = {points: new Map(), edges: new Map()};
            rows.set(height, row);
        }
        return row;
    }

    for (const piece of pieces) {
        for (const face of [...piece.quads, ...(piece.triangles ?? [])]) {
            if (face.surface !== surface) continue;

            for (let i = 0; i < face.corners.length; i++) {
                const a = piece.vertices[face.corners[i]!]!;
                const b = piece.vertices[face.corners[(i + 1) % face.corners.length]!]!;
                const ay = heightKey(a.y);
                const by = heightKey(b.y);
                const ak = pointKey(a);
                const bk = pointKey(b);
                const row = rowAt(ay);
                row.points.set(ak, a);
                rowAt(by).points.set(bk, b);

                if (ay === by) {
                    if (ak === bk) throw new RangeError("Collapsed cavity edge");
                    const key = ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
                    row.edges.set(key, [ak, bk]);
                } else {
                    const lower = ay < by ? vertexKey(ay, ak) : vertexKey(by, bk);
                    const upper = ay < by ? vertexKey(by, bk) : vertexKey(ay, ak);
                    if (!rising.has(lower)) rising.set(lower, new Set());
                    rising.get(lower)!.add(upper);
                }
            }
        }
    }

    let previousStart: string | undefined;
    let previousHeight: number | undefined;

    const rings = [...rows.entries()]
        .sort(([a], [b]) => a - b)
        .map(([height, row]) => {
            const adjacency = new Map<string, Set<string>>();
            for (const key of row.points.keys()) {
                adjacency.set(key, new Set());
            }
            for (const [a, b] of row.edges.values()) {
                adjacency.get(a)!.add(b);
                adjacency.get(b)!.add(a);
            }

            if (adjacency.size < 3 || [...adjacency.values()].some(neighbors =>
                neighbors.size !== 2
            )) {
                throw new RangeError("Cavity section must be a closed contour");
            }

            const first = [...adjacency.keys()].sort()[0]!;
            const order = [first];
            let previous: string | undefined;
            let current = first;

            while (true) {
                const next = [...adjacency.get(current)!]
                    .find(key => key !== previous);
                if (!next) throw new RangeError("Disconnected cavity contour");
                if (next === first) break;
                if (order.includes(next)) {
                    throw new RangeError("Cavity contour intersects itself");
                }
                order.push(next);
                previous = current;
                current = next;
            }

            if (order.length !== adjacency.size) {
                throw new RangeError("Multiple cavity contours are not supported");
            }

            // Keep the same winding as the old X/Z convention, without
            // discarding concavities or inventing edges between remote points.
            const twiceArea = order.reduce((area, key, i) => {
                const p = row.points.get(key)!;
                const q = row.points.get(order[(i + 1) % order.length]!)!;
                return area + p.x * q.z - q.x * p.z;
            }, 0);
            if (!(Math.abs(twiceArea) > 1e-15)) {
                throw new RangeError("Collapsed cavity contour");
            }
            if (twiceArea < 0) {
                order.splice(1, order.length - 1, ...order.slice(1).reverse());
            }

            if (previousStart !== undefined) {
                const candidates = rising.get(vertexKey(previousHeight!, previousStart));
                const match = order.find(key =>
                    candidates?.has(vertexKey(height, key))
                );
                if (!match) {
                    throw new RangeError("Cavity sections have no matching seam");
                }
                order.push(...order.splice(0, order.indexOf(match)));
            }

            previousStart = order[0];
            previousHeight = height;
            return {
                y: row.points.get(order[0]!)!.y,
                outline: order.map(key => {
                    const point = row.points.get(key)!;
                    return new THREE.Vector2(point.x, point.z);
                })
            };
        });

    return new ProfiledCavity(rings);
}
