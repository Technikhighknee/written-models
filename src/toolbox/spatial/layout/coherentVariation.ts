export interface CoherentVariationOptions {
    count: number;
    seed?: number;
    /** How many neighboring pieces influence each sample. */
    radius?: number;
    /** Connect the last piece to the first (e.g. barrel staves). */
    cyclic?: boolean;
}

/**
 * A deterministic, spatially correlated variation across neighboring pieces.
 *
 * Start from seeded values, blend each over a local neighborhood, then
 * center/normalize. Unlike picking a random material for each piece,
 * neighboring samples belong to broad, coherent tonal regions.
 *
 * Returns values in [-1, 1]. The caller decides how subtly to apply them.
 */
export function coherentVariation({
    count,
    seed = 1,
    radius = 3,
    cyclic = false
}: CoherentVariationOptions): number[] {
    if (
        !Number.isInteger(count) || count < 2 ||
        !Number.isInteger(seed) ||
        !Number.isInteger(radius) || radius < 1 || radius >= count
    ) {
        throw new RangeError("Invalid coherent variation dimensions");
    }

    function random(index: number): number {
        let hash = Math.imul(index + 1, 0x9e3779b1) ^
            Math.imul(seed + 1, 0x85ebca77);
        hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
        hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);

        return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
    }

    const sources = Array.from({ length: count }, (_, i) => random(i));
    const smooth = sources.map((_, index) => {
        let total = 0;
        let weightSum = 0;

        for (let distance = -radius; distance <= radius; distance++) {
            let neighbor = index + distance;

            if (cyclic) {
                neighbor = ((neighbor % count) + count) % count;
            } else if (neighbor < 0 || neighbor >= count) {
                continue;
            }

            const t = distance / radius;
            const weight = Math.exp(-2 * t * t);
            total += sources[neighbor]! * weight;
            weightSum += weight;
        }

        return total / weightSum;
    });

    const mean = smooth.reduce((sum, value) => sum + value, 0) / count;
    const centered = smooth.map(value => value - mean);
    const extent = Math.max(...centered.map(Math.abs));

    return extent > 1e-12
        ? centered.map(value => value / extent)
        : centered.map(() => 0);
}
