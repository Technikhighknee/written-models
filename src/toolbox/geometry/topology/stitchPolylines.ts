export type TriangleIndices = [number, number, number];

/**
 * Stitch two OPEN boundary polylines of unequal resolution without
 * inventing vertices or falsely reporting triangles as quads.
 *
 * Both index sequences must run in the same physical direction. The
 * normalized station progress determines which contour advances next;
 * the caller owns the UV projection and final 3D winding.
 *
 * Used for connecting a detailed visible contour to a sparse hidden one,
 * without adding support loops across the entire hidden surface.
 */
export function stitchPolylines(
    first: readonly number[],
    second: readonly number[],
    reverse = false
): TriangleIndices[] {
    if (first.length < 2 || second.length < 2 ||
        [...first, ...second].some(value =>
            !Number.isInteger(value) || value < 0) ||
        new Set([...first, ...second]).size !== first.length + second.length) {
        throw new RangeError("Stitch needs disjoint ordered index sequences");
    }
    const triangles: TriangleIndices[] = [];
    let a = 0, b = 0;
    while (a < first.length - 1 || b < second.length - 1) {
        const advanceA = a < first.length - 1 &&
            (b === second.length - 1 ||
                (a + 1) / (first.length - 1) <
                    (b + 1) / (second.length - 1));
        const face: TriangleIndices = advanceA
            ? [first[a]!, second[b]!, first[a + 1]!]
            : [first[a]!, second[b]!, second[b + 1]!];
        triangles.push(reverse ? [face[0], face[2], face[1]] : face);
        if (advanceA) a++;
        else b++;
    }
    return triangles;
}
