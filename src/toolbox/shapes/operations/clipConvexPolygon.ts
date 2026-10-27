export type Point2 = readonly [x: number, y: number];

export interface HalfPlane {
    /** Unnormalized line normal; dot(point, normal) >= offset is retained. */
    normal: Point2;
    offset: number;
}

/**
 * Clip a convex polygon against a half-plane (Sutherland-Hodgman).
 * The convex precondition is intentional: arbitrary concave polygons can
 * split into multiple disjoint regions and need a multi-polygon operation.
 *
 * Intersections are calculated once from each crossing edge. Callers
 * splitting one common input with the same line obtain matching endpoints.
 */
export function clipConvexPolygon(
    polygon: readonly Point2[],
    {normal, offset}: HalfPlane,
    tolerance = 1e-10
): Point2[] {
    const [nx, ny] = normal;
    if (!Number.isFinite(nx) || !Number.isFinite(ny) ||
        nx * nx + ny * ny <= 1e-20 || !Number.isFinite(offset) ||
        !Number.isFinite(tolerance) || tolerance < 0 ||
        polygon.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
        throw new RangeError("Invalid polygon clipping plane");
    }
    if (polygon.length < 3) return [];
    const signed = (p: Point2) => p[0] * nx + p[1] * ny - offset;
    const result: Point2[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const from = polygon[i]!;
        const to = polygon[(i + 1) % polygon.length]!;
        const a = signed(from);
        const b = signed(to);
        const inA = a >= -tolerance;
        const inB = b >= -tolerance;
        if (inA !== inB) {
            const t = Math.max(0, Math.min(1, a / (a - b)));
            result.push([
                from[0] + (to[0] - from[0]) * t,
                from[1] + (to[1] - from[1]) * t
            ]);
        }
        if (inB) result.push(to);
    }
    const clean: Point2[] = [];
    for (const point of result) {
        const previous = clean.at(-1);
        if (!previous || Math.hypot(
            point[0] - previous[0], point[1] - previous[1]
        ) > tolerance) clean.push(point);
    }
    while (clean.length > 1 && Math.hypot(
        clean[0]![0] - clean.at(-1)![0],
        clean[0]![1] - clean.at(-1)![1]
    ) <= tolerance) clean.pop();
    return clean.length >= 3 ? clean : [];
}

/**
 * Partition a convex shape into contiguous bands bounded by parallel
 * lines. Input cuts are measured along the supplied normal direction.
 * Every output shares the SAME clipping boundaries, not guessed offsets.
 */
export function partitionConvexPolygon(
    polygon: readonly Point2[],
    cuts: readonly number[],
    direction: Point2 = [1, 0]
): Point2[][] {
    if (cuts.length < 2 ||
        cuts.some((x, i) => !Number.isFinite(x) ||
            (i > 0 && x <= cuts[i - 1]!))) {
        throw new RangeError("Partition cuts must be increasing");
    }
    return cuts.slice(1).map((end, i) => {
        const start = cuts[i]!;
        const piece = clipConvexPolygon(
            clipConvexPolygon(polygon, {normal: direction, offset: start}),
            {normal: [-direction[0], -direction[1]], offset: -end}
        );
        if (piece.length < 3) {
            throw new RangeError("Partition produced an empty polygon");
        }
        return piece;
    });
}
