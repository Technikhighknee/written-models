import { smoothstep } from "./fields";

export interface ArchedRingFieldOptions {
    centerU: number;
    /** Usually outside the bottom edge, so the rings form open arches. */
    originV: number;
    rings: number;
    /** Sideways radius multiplier; larger values bend the arches more. */
    transverseScale?: number;
    /** Longitudinal radius divisor; larger values stretch the arches. */
    longitudinalStretch?: number;
    /** Extent of the feature across the tile. */
    figureWidth?: number;
}

/**
 * A broad, softly feathered ring figure for tangentially cut surfaces.
 *
 * Unlike regular horizontal/vertical stripes, contours arc around an
 * off-tile origin. The zero-slope envelope fades to nothing at all four
 * tile edges, keeping a shared repeating PBR texture seamless even
 * though the figure itself has an art-directed shape.
 *
 * Returns 0..1 for use in *all* channels of a material recipe.
 */
export function archedRingField({
    centerU,
    originV,
    rings,
    transverseScale = 0.92,
    longitudinalStretch = 1.75,
    figureWidth = 0.33
}: ArchedRingFieldOptions): (u: number, v: number, warp?: number) => number {
    if (
        [centerU, originV, rings, transverseScale, longitudinalStretch, figureWidth]
            .some(value => !Number.isFinite(value)) ||
        rings <= 0 || transverseScale <= 0 ||
        longitudinalStretch <= 0 || figureWidth <= 0
    ) {
        throw new RangeError("Invalid arched ring figure");
    }

    return (u: number, v: number, warp = 0): number => {
        const radius = Math.hypot(
            (u - centerU) * transverseScale,
            (v - originV) / longitudinalStretch
        );
        const phase = rings * radius + warp;
        const cycle = phase - Math.floor(phase);
        const distanceToRing = Math.min(cycle, 1 - cycle);
        const line = 1 - smoothstep(0.008, 0.055, distanceToRing);

        // Gently transitions into lengthwise grain away from the figure.
        const across = (u - centerU) / figureWidth;
        const figure = Math.exp(-(across ** 4)) *
            Math.exp(-(((v - 0.5) / 0.53) ** 4));

        // Both field value and slope vanish on tile boundaries.
        const tileEnvelope = (
            Math.sin(Math.PI * u) *
            Math.sin(Math.PI * v)
        ) ** 2;

        return line * figure * tileEnvelope;
    };
}
