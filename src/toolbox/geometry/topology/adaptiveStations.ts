/**
 * Choose shared edge-loop stations from the actual shape of a cross-section.
 *
 * Each sample(t) returns corresponding 3D points for ALL strips that must
 * share the same longitudinal divisions. Compare the actual curve to its
 * linear chord at quarter, half, and three-quarter positions: midpoint alone
 * can miss a symmetric bend. Subdivide only where the maximum deviation
 * exceeds the requested world-space tolerance.
 *
 * The same returned stations must be used by neighboring strips. Independently
 * choosing subdivisions per quad would create T-junctions at their borders.
 */
export interface Position3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface AdaptiveStationsOptions {
    /** Maximum permitted deviation from a segment's linear chord, in meters. */
    maxDeviation: number;
    /** Maximum recursion depth (at most 2^maxDepth intervals). */
    maxDepth?: number;
}

export function adaptiveStations(
    sample: (t: number) => readonly Position3[],
    { maxDeviation, maxDepth = 5 }: AdaptiveStationsOptions
): number[] {
    if (
        !Number.isFinite(maxDeviation) || maxDeviation <= 0 ||
        !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 8
    ) {
        throw new RangeError("Invalid adaptive station tolerance or depth");
    }

    const first = sample(0);
    const last = sample(1);
    if (first.length === 0 || first.length !== last.length) {
        throw new RangeError("Inconsistent adaptive curve samples");
    }

    function check(points: readonly Position3[]): void {
        if (
            points.length !== first.length ||
            points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))
        ) {
            throw new RangeError("Invalid adaptive curve sample");
        }
    }
    check(first);
    check(last);

    const result = [0];

    function visit(
        from: number,
        to: number,
        start: readonly Position3[],
        end: readonly Position3[],
        depth: number
    ): void {
        const quarter = sample(from + (to - from) * 0.25);
        const middle = sample((from + to) * 0.5);
        const threeQuarter = sample(from + (to - from) * 0.75);
        check(quarter);
        check(middle);
        check(threeQuarter);

        let maximum = 0;

        for (let i = 0; i < first.length; i++) {
            const a = start[i]!;
            const b = end[i]!;

            for (const [fraction, point] of [
                [0.25, quarter[i]!],
                [0.5, middle[i]!],
                [0.75, threeQuarter[i]!]
            ] as const) {
                const dx = point.x - (a.x + (b.x - a.x) * fraction);
                const dy = point.y - (a.y + (b.y - a.y) * fraction);
                const dz = point.z - (a.z + (b.z - a.z) * fraction);
                maximum = Math.max(maximum, Math.hypot(dx, dy, dz));
            }
        }

        if (maximum <= maxDeviation || depth === maxDepth) {
            result.push(to);
            return;
        }

        const mid = (from + to) * 0.5;
        visit(from, mid, start, middle, depth + 1);
        visit(mid, to, middle, end, depth + 1);
    }

    visit(0, 1, first, last, 0);
    return result;
}
