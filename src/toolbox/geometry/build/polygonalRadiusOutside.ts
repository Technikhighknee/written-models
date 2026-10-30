/**
 * Radial offset for a polygon whose chords, not just its vertices,
 * must clear a circle by the requested physical distance.
 */
export function polygonalRadiusOutside(
    radius: number,
    angularStep: number,
    clearance = 0
): number {
    if (
        ![radius, angularStep, clearance].every(Number.isFinite) ||
        radius <= 0 || angularStep <= 0 || angularStep >= Math.PI ||
        clearance < 0
    ) {
        throw new RangeError("Invalid radial chord clearance");
    }

    return radius / Math.cos(angularStep / 2) + clearance;
}
