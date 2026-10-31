import {
    PaintedSurface, seededRandom, type Mark, type Point
} from "./paint";

export interface PaintRegion {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface Pigment {
    color: string;
    opacity: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * A soft, broken-edged translucent wash. It is composed of overlapping
 * irregular dabs rather than one pristine filled ellipse.
 *
 * Clipping to a physical feature is the caller's responsibility:
 * surface.within(stoneOutline, () => wash(...)).
 */
export function wash(
    surface: PaintedSurface,
    region: PaintRegion,
    seed: number,
    pigments: readonly Pigment[],
    count: number
): void {
    const random = seededRandom(seed);
    const width = region.right - region.left;
    const height = region.bottom - region.top;

    for (let i = 0; i < count; i++) {
        const pigment = pigments[Math.floor(random() * pigments.length)]!;
        const cx = lerp(region.left, region.right, random());
        const cy = lerp(region.top, region.bottom, random());
        const rx = width * (0.04 + random() * 0.21);
        const ry = height * (0.055 + random() * 0.24);
        const points: Point[] = [];
        const irregularity = 0.48 + random() * 0.26;
        const phase = random() * Math.PI * 2;

        for (let j = 0; j < 11; j++) {
            const t = 2 * Math.PI * j / 11;
            const radius = irregularity + random() * (1 - irregularity);
            points.push([
                cx + rx * Math.cos(t + phase) * radius,
                cy + ry * Math.sin(t + phase) * radius
            ]);
        }
        surface.polygon(points, {
            color: pigment.color,
            opacity: pigment.opacity * (0.4 + 0.6 * random()),
            roughness: 0.93 + 0.05 * random(),
            height: (random() - 0.5) * 0.00025
        });
    }
}

/**
 * Several scales of mineral grain, brush skips, dirt or fiber flecks.
 * The caller decides the palette and direction; no material-specific
 * identity is baked into this operation.
 */
export function fleck(
    surface: PaintedSurface,
    region: PaintRegion,
    seed: number,
    pigments: readonly Pigment[],
    count: number,
    elongation = 1
): void {
    const random = seededRandom(seed);
    const groups: Mark[][] = pigments.map(() => []);
    const width = region.right - region.left;
    const height = region.bottom - region.top;

    for (let i = 0; i < count; i++) {
        const group = Math.floor(random() * groups.length);
        const size = (0.002 + random() ** 3 * 0.024);
        groups[group]!.push({
            x: lerp(region.left, region.right, random()),
            y: lerp(region.top, region.bottom, random()),
            rx: width * size,
            ry: height * size * elongation,
            rotation: (random() - 0.5) * 0.5
        });
    }

    for (let i = 0; i < groups.length; i++) {
        const ink = pigments[i]!;
        surface.marks(groups[i]!, {
            color: ink.color,
            opacity: ink.opacity,
            roughness: 0.96,
            height: -0.00013
        });
    }
}

/** A hand-broken line with coherent sections instead of a straight vector. */
export function brokenLine(
    from: Point, to: Point, seed: number,
    segments: number, wander: number
): Point[] {
    const random = seededRandom(seed);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const points: Point[] = [];
    let drift = 0;

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        drift = 0.65 * drift + 0.35 * (random() * 2 - 1);
        const amount = i === 0 || i === segments ? 0 : drift * wander;
        points.push([
            from[0] + dx * t + nx * amount,
            from[1] + dy * t + ny * amount
        ]);
    }
    return points;
}

/** A small patch of growth, staining or soil, assembled from uneven specks. */
export function cluster(
    surface: PaintedSurface,
    at: Point,
    radius: Point,
    seed: number,
    pigments: readonly Pigment[],
    count: number
): void {
    const random = seededRandom(seed);
    const groups: Mark[][] = pigments.map(() => []);

    for (let i = 0; i < count; i++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random());
        const index = Math.floor(random() * groups.length);
        groups[index]!.push({
            x: at[0] + Math.cos(angle) * distance * radius[0],
            y: at[1] + Math.sin(angle) * distance * radius[1],
            rx: 0.0005 + random() * radius[0] * 0.19,
            ry: 0.0006 + random() * radius[1] * 0.19
        });
    }

    for (let i = 0; i < pigments.length; i++) {
        surface.marks(groups[i]!, {
            color: pigments[i]!.color,
            opacity: pigments[i]!.opacity,
            roughness: 0.98,
            height: 0.00018
        });
    }
}
