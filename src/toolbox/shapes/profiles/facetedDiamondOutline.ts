/**
 * Eight-sided, doubly mirrored section with a ridge on each principal axis.
 * The four intermediate shoulders let the maker place bevel transitions
 * separately from the extreme width and height.
 *
 * Used for edged tools, forged ribs, mouldings, spearheads and decorative
 * structural members. Coordinates are normalized for axial lofting.
 */
export function facetedDiamondOutline(
    shoulder: readonly [number, number]
): [number, number][] {
    const [u, v] = shoulder;
    if (!Number.isFinite(u) || !Number.isFinite(v) ||
        u <= 0 || u >= 1 || v <= 0 || v >= 1) {
        throw new RangeError("Diamond shoulders must be inside the unit section");
    }
    return [
        [1, 0], [u, v], [0, 1], [-u, v],
        [-1, 0], [-u, -v], [0, -1], [u, -v]
    ];
}
