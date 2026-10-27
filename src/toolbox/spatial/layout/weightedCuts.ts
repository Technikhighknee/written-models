/**
 * Subdivide an interval by positive relative weights. Return shared
 * boundary positions, not independent piece widths, so adjacent objects
 * can reference the exact same contact coordinates.
 */
export function weightedCuts(
    start: number, end: number,
    count: number, weights?: readonly number[]
): number[] {
    if (![start, end].every(Number.isFinite) || end <= start ||
        !Number.isInteger(count) || count < 1 ||
        (weights !== undefined && (
            weights.length !== count ||
            weights.some(w => !Number.isFinite(w) || w <= 0)
        ))) {
        throw new RangeError("Invalid weighted interval");
    }
    const shares = weights ?? Array<number>(count).fill(1);
    const total = shares.reduce((sum, w) => sum + w, 0);
    if (!Number.isFinite(total) || total <= 0) {
        throw new RangeError("Invalid total interval weight");
    }
    const cuts = [start];
    let cumulative = 0;
    for (let i = 0; i < count - 1; i++) {
        cumulative += shares[i]!;
        cuts.push(start + (end - start) * cumulative / total);
    }
    cuts.push(end);
    return cuts;
}
