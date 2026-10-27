/**
 * Reflect the positive half of an ordered axial station sequence.
 * The first station may lie on the symmetry plane (it is not duplicated).
 * All other authored station attributes are preserved, including offsets
 * perpendicular to the reflected coordinate.
 *
 * Useful for handles, crosspieces, turned fittings, and symmetric ribs.
 */
export function mirrorStations<T extends { at: number }>(
    positive: readonly T[], center = 0
): T[] {
    if (!Number.isFinite(center) || positive.length < 1 ||
        positive.some((station, index) =>
            !Number.isFinite(station.at) || station.at < center ||
            (index > 0 && station.at <= positive[index - 1]!.at)
        )) {
        throw new RangeError("Mirror needs increasing stations on one side");
    }

    const reflected = positive
        .filter(station => station.at > center)
        .map(station => ({ ...station, at: 2 * center - station.at } as T))
        .reverse();
    return [...reflected, ...positive.map(station => ({...station}))];
}
