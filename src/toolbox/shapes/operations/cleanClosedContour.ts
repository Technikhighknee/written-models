import type * as THREE from "three";
import { cleanContour2 } from "../../geometry/topology/contours";

/**
 * Keep the existing shapes API while sharing one contour cleanup
 * implementation across geometry construction and shape primitives.
 */
export function cleanClosedContour(
    points: readonly THREE.Vector2Like[],
    tolerance = 1e-10
): THREE.Vector2[] {
    return cleanContour2(points, tolerance);
}
