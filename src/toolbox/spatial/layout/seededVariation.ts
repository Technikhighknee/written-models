/**
 * Stateless signed deterministic variation indexed by piece and channel.
 * Stable regardless of model creation order or procedural sampling order.
 * The same hash may drive seam wander, surface wear or any authored detail.
 */
export function seededVariation(
    seed: number, index: number, channel: number
): number {
    if (![seed, index, channel].every(Number.isInteger)) {
        throw new RangeError("Variation keys must be integers");
    }
    let h = Math.imul(seed + 67, 0x9e3779b1) ^
        Math.imul(index + 1, 0x85ebca6b) ^
        Math.imul(channel + 1, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
}
