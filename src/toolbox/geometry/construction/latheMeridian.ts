import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { revolveMeridianMesh } from "../build/revolveProfile";

/** An authored station on the Y-axis meridian, in metres. */
export interface MeridianPoint {
    radius: number;
    y: number;
    surface?: string;
    smoothingGroup?: string;
    radialWave?: { lobes: number; depth: number; phase?: number };
}

/**
 * Revolve meridian stations about the Y axis with authored poles, quads,
 * per-interval materials, UVs and optional radial modulation.
 */
export function latheMeridian(
    points: readonly MeridianPoint[],
    radialSegments = 40,
    { closed = false }: { closed?: boolean } = {}
): MeshData {
    if (
        points.length < (closed ? 3 : 4) ||
        (!closed &&
            (points[0]?.radius !== 0 || points.at(-1)?.radius !== 0))
    ) {
        throw new RangeError("Invalid meridian or radial segments");
    }

    return revolveMeridianMesh(
        points.map(point => ({
            radius: point.radius,
            height: point.y,
            ...(point.surface === undefined ? {} : { surface: point.surface }),
            ...(point.smoothingGroup === undefined
                ? {} : { smoothingGroup: point.smoothingGroup }),
            ...(point.radialWave === undefined
                ? {} : { radialWave: point.radialWave })
        })),
        {
            axisOrigin: new THREE.Vector3(),
            axisDirection: new THREE.Vector3(0, 1, 0),
            radialDirection: new THREE.Vector3(0, 0, 1),
            angle: 2 * Math.PI,
            segments: radialSegments,
            closedMeridian: closed
        }
    );
}
