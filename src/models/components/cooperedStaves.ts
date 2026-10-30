import * as THREE from "three";

import { samplePolarStripSections } from "../../toolbox/geometry/build/samplePolarStripSections";
import { loftPairedSurfaceRows } from "../../toolbox/geometry/build/loftPairedSurfaceRows";
import {
    geometryResult,
    type GeometryResult
} from "../../toolbox/geometry/kernel/GeometryResult";

export interface CooperedStavesOptions {
    count: number;
    thickness: number;
    edgeRoundover: number;
    seamGap?: number;
    angleOffset?: number;
}

/**
 * Sample independently authored stave profiles on the worked exterior
 * and the simple interior. Their differing densities are joined by the
 * shared contour loft, with genuine triangles only at the end transitions.
 */
export function cooperedStaves(
    profile: readonly THREE.Vector2Like[],
    {
        count,
        thickness,
        edgeRoundover,
        seamGap = 0,
        angleOffset = 0
    }: CooperedStavesOptions
): GeometryResult[] {
    if (
        ![thickness, edgeRoundover].every(Number.isFinite) ||
        thickness <= 0 ||
        edgeRoundover < 0 || edgeRoundover >= thickness ||
        profile.some(point => point.x <= thickness)
    ) {
        throw new RangeError("Invalid coopered stave thickness");
    }

    const outerStations = edgeRoundover > 0
        ? [0, 0.055, 0.5, 0.945, 1]
        : [0, 0.5, 1];
    const innerStations = [0, 1];

    const sections = samplePolarStripSections({
        meridian: profile,
        count,
        gap: seamGap,
        angleOffset,
        outerStations,
        innerStations,
        outerRadiusAt: (radius, _height, fraction) => {
            const edgeDistance = Math.min(fraction, 1 - fraction);
            const blend = Math.min(1, edgeDistance / 0.055);
            return radius - edgeRoundover * (1 - blend);
        },
        innerRadiusAt: radius => radius - thickness
    });

    return sections.map(piece => geometryResult(loftPairedSurfaceRows(
        piece.map(section => ({
            outer: section.outer.points.slice(0, outerStations.length),
            inner: section.outer.points.slice(outerStations.length).reverse()
        }))
    )));
}
