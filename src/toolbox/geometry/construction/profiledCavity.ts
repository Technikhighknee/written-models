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
 * Derive horizontal cavity rings from the actual inner construction faces.
 * Works for vertical lofts with matching polygon outlines at each height.
 */
export function cavityFromMeshSurfaces(
    pieces: readonly MeshData[],
    surface = "inner"
): ProfiledCavity {
    const rows = new Map<number, Map<string, THREE.Vector3>>();

    for (const piece of pieces) {
        for (const face of [...piece.quads, ...(piece.triangles ?? [])]) {
            if (face.surface !== surface) continue;

            for (const index of face.corners) {
                const p = piece.vertices[index]!;
                const keyY = Math.round(p.y * 1e7);
                const keyPoint = [
                    Math.round(p.x * 1e7),
                    Math.round(p.z * 1e7)
                ].join(":");

                if (!rows.has(keyY)) rows.set(keyY, new Map());
                rows.get(keyY)!.set(keyPoint, p);
            }
        }
    }

    const rings = [...rows.entries()]
        .sort(([a], [b]) => a - b)
        .map(([_, points]) => {
            const vertices = [...points.values()];
            const cx = vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length;
            const cz = vertices.reduce((sum, p) => sum + p.z, 0) / vertices.length;

            vertices.sort((a, b) =>
                Math.atan2(a.z - cz, a.x - cx) -
                Math.atan2(b.z - cz, b.x - cx)
            );

            return {
                y: vertices[0]!.y,
                outline: vertices.map(p => new THREE.Vector2(p.x, p.z))
            };
        });

    return new ProfiledCavity(rings);
}
