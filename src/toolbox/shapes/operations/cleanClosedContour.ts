import * as THREE from "three";

/**
 * Normalize a sampled CLOSED planar contour without changing its shape or
 * winding. Curves often provide repeated endpoints (including almost-equal
 * points at the seam); those would otherwise create degenerate edges.
 *
 * The tolerance is expressed in the contour's coordinate units (metres).
 * This operation does not sort, simplify or approximate valid vertices.
 */
export function cleanClosedContour(
    points: readonly THREE.Vector2Like[],
    tolerance = 1e-10
): THREE.Vector2[] {
    if (!Number.isFinite(tolerance) || tolerance < 0 ||
        points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
        throw new RangeError("Invalid closed contour");
    }
    const squared = tolerance * tolerance;
    const result: THREE.Vector2[] = [];
    for (const p of points) {
        const point = new THREE.Vector2(p.x, p.y);
        if (!result.length ||
            point.distanceToSquared(result[result.length - 1]!) > squared) {
            result.push(point);
        }
    }
    while (result.length > 1 &&
        result[0]!.distanceToSquared(result[result.length - 1]!) <= squared) {
        result.pop();
    }
    if (result.length < 3 ||
        Math.abs(THREE.ShapeUtils.area(result)) <= squared) {
        throw new RangeError("Collapsed closed contour");
    }
    return result;
}
