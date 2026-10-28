import * as THREE from "three";
import type {
    Contour2,
    Profile2,
    SampledContour2,
    SampledProfile2
} from "../definitions/geometry";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import {
    atContourStation,
    hasCornerStation,
    measureContour,
    validateContourStations
} from "../topology/contourSampling";

export interface ProfileStations {
    outer: readonly number[];
    holes?: readonly (readonly number[])[];
}

/**
 * Sample at exactly the caller's resolved perimeter stations.
 * Every authored corner must appear, including corners on straight edges.
 * Neither holes nor shared interfaces acquire hidden subdivisions.
 */
export function sampleProfile(
    profile: Profile2,
    stations: ProfileStations,
    precision?: GeometryPrecision
): SampledProfile2 {
    const policy = resolvePrecision(precision);
    const operation = "sampleProfile";

    if (
        !profile?.outer?.closed ||
        !Array.isArray(profile.outer.points) ||
        profile.holes?.some(hole => !hole.closed) ||
        (profile.holes?.length ?? 0) !== (stations.holes?.length ?? 0)
    ) {
        throw new GeometryOperationError(
            operation, "invalid-input", "Profile loops or station sets do not match"
        );
    }

    function sampled(
        contour: Contour2,
        requested: readonly number[]
    ): SampledContour2 {
        validateContourStations(requested, true, operation);

        const vertices = contour.points.map(point =>
            new THREE.Vector2(point.x, point.y)
        );
        const measured = measureContour(vertices, true, operation, policy);

        if (measured.stations.some(station =>
            !hasCornerStation(station, requested, measured.length, policy)
        )) {
            throw new GeometryOperationError(
                operation, "invalid-input",
                "Sampling must retain every authored contour corner"
            );
        }

        const points = requested.map(station =>
            atContourStation(measured, station, operation, policy)
        );

        // Catch sampling intervals so short that separate stations
        // would collapse to the same geometry.
        measureContour(points, true, operation, policy);

        return {
            points,
            parameters: [...requested]
        };
    }

    return {
        outer: sampled(profile.outer, stations.outer),
        ...(profile.holes === undefined ? {} : {
            holes: profile.holes.map((hole, index) =>
                sampled(hole, stations.holes![index]!)
            )
        })
    };
}
