export interface ScalarProfilePoint {
    x: number;
    y: number;
}

/**
 * Shape-preserving interpolation through a few ordered landmarks.
 * Tangents flatten automatically at extrema instead of overshooting a
 * hand-authored silhouette. Sampling is clamped to the given interval.
 *
 * Reusable for radius-vs-height, thickness-vs-length, width-vs-distance,
 * animation controls and other one-dimensional geometric properties.
 */
export function monotoneProfile(
    points: readonly ScalarProfilePoint[]
): (position: number) => number {
    if (points.length < 2 ||
        points.some((point, index) =>
            !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
            (index > 0 && point.x <= points[index - 1]!.x))) {
        throw new RangeError("Invalid monotone profile landmarks");
    }
    const slopes = points.slice(0, -1).map((point, i) => {
        const next = points[i + 1]!;
        return (next.y - point.y) / (next.x - point.x);
    });
    const tangents = points.map((_, index) => {
        if (index === 0) return slopes[0]!;
        if (index === points.length - 1) return slopes.at(-1)!;
        const left = slopes[index - 1]!;
        const right = slopes[index]!;
        if (left * right <= 0) return 0;
        return 2 * left * right / (left + right);
    });
    return (position: number): number => {
        if (!Number.isFinite(position)) {
            throw new RangeError("Invalid profile sampling coordinate");
        }
        const clipped = Math.min(points.at(-1)!.x, Math.max(
            points[0]!.x, position
        ));
        let i = 0;
        while (i < points.length - 2 && clipped > points[i + 1]!.x) i++;
        const from = points[i]!;
        const to = points[i + 1]!;
        const width = to.x - from.x;
        const t = (clipped - from.x) / width;
        const t2 = t * t;
        const t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * from.y +
            (t3 - 2 * t2 + t) * width * tangents[i]! +
            (-2 * t3 + 3 * t2) * to.y +
            (t3 - t2) * width * tangents[i + 1]!;
    };
}
