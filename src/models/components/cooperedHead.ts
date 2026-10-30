import * as THREE from "three";

import { partitionConvexPolygon } from "../../toolbox/shapes/operations/clipConvexPolygon";
import { weightedCuts } from "../../toolbox/spatial/layout/weightedCuts";
import { extrudeContour } from "../../toolbox/geometry/build/extrudeContour";
import type { GeometryResult } from "../../toolbox/geometry/kernel/GeometryResult";

export interface CooperedHeadOptions {
    planks: number;
    thickness: number;
    radialSegments?: number;
    widthWeights?: readonly number[];
}

/**
 * The cooper chooses the plank widths and the circular trim. Each plank
 * is then a normal authored contour extrusion, not a private timber mesh
 * builder or a competing geometry kernel.
 */
export function cooperedHead(
    radius: number,
    {
        planks, thickness, radialSegments = 48, widthWeights
    }: CooperedHeadOptions
): GeometryResult[] {
    if (
        !Number.isFinite(radius) || radius <= 0 ||
        !Number.isFinite(thickness) || thickness <= 0 ||
        !Number.isInteger(planks) || planks < 2 ||
        !Number.isInteger(radialSegments) || radialSegments < 8 ||
        (widthWeights && (widthWeights.length !== planks ||
            widthWeights.some(w => !Number.isFinite(w) || w <= 0)))
    ) {
        throw new RangeError("Invalid coopered head");
    }

    const circle: readonly (readonly [number, number])[] = Array.from(
        { length: radialSegments },
        (_, i) => {
            const angle = i * 2 * Math.PI / radialSegments;
            return [radius * Math.cos(angle), radius * Math.sin(angle)];
        }
    );
    const cuts = weightedCuts(-radius, radius, planks, widthWeights);
    const outlines = partitionConvexPolygon(circle, cuts);

    // Local X/Y on the drawing become world X/Z; extrusion depth
    // points down from the outward (+Y) face through the head.
    const frame = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, -1, 0)
    ).setPosition(new THREE.Vector3(0, thickness / 2, 0));

    return outlines.map(outline => extrudeContour({
        outer: {
            points: outline.map(([x, z]) => new THREE.Vector2(x, z)),
            closed: true
        }
    }, {
        frame,
        depth: thickness
    }));
}
