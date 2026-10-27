import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";

/** A point on the meridian of a solid of revolution, radius >= 0. */
export interface MeridianPoint {
    radius: number;
    y: number;
    /** Surface of the face connecting this point to the next point. */
    surface?: string;
    /** Shared smooth normals follow the authored region, not material order. */
    smoothingGroup?: string;
    /** Radial shape modulation at this ring, in metres. */
    radialWave?: { lobes: number; depth: number; phase?: number };
}

/**
 * Revolve an ordered meridian around the Y axis.
 *
 * A meridian starting AND ending on the axis produces a closed solid;
 * each pole is represented by one real vertex and triangle fans. Other
 * stations use genuine quads. An open rim is simply a meridian that
 * travels up the exterior and back down the interior before ending
 * on the axis at the inside floor.
 *
 * Face UVs are measured in metres. No coincident triangles or collapsed
 * quads are introduced at the rotation axis.
 *
 * With {closed:true}, a positive-radius cyclic meridian wraps directly
 * from its last station back to the first. This supports open-ended
 * tubes, hollow shells and rings without duplicating the lathe engine.
 */
export function latheMeridian(
    points: readonly MeridianPoint[],
    radialSegments = 40,
    {closed = false}: {closed?: boolean} = {}
): MeshData {
    if (points.length < (closed ? 3 : 4) ||
        !Number.isInteger(radialSegments) || radialSegments < 3) {
        throw new RangeError("Invalid meridian or radial segments");
    }
    for (const point of points) {
        const wave = point.radialWave;
        if (![point.radius, point.y, wave?.depth ?? 0,
                wave?.phase ?? 0].every(Number.isFinite) ||
            point.radius < 0 ||
            (wave !== undefined &&
                (!Number.isInteger(wave.lobes) || wave.lobes < 1))) {
            throw new RangeError("Invalid meridian coordinate or wave");
        }
    }
    if (closed
        ? points.some(point => point.radius <= 0)
        : points[0]!.radius !== 0 ||
            points[points.length - 1]!.radius !== 0 ||
            points.slice(1, -1).some(point => point.radius <= 0)) {
        throw new RangeError(closed
            ? "Cyclic meridian must remain away from the rotation axis"
            : "Closed meridian requires two axis poles");
    }

    const vertices: THREE.Vector3[] = [];
    const rows: number[][] = [];
    const perimeters: number[] = [0];
    const step = 2 * Math.PI / radialSegments;
    for (let row = 0; row < points.length; row++) {
        const point = points[row]!;
        if (row > 0) {
            const previous = points[row - 1]!;
            const length = Math.hypot(point.radius - previous.radius,
                point.y - previous.y);
            if (!(length > 1e-9)) throw new RangeError("Collapsed meridian segment");
            perimeters.push(perimeters[row - 1]! + length);
        }
        const ids: number[] = [];
        if (point.radius === 0) {
            ids.push(vertices.length);
            vertices.push(new THREE.Vector3(0, point.y, 0));
        } else {
            for (let i = 0; i < radialSegments; i++) {
                const angle = step * i;
                const wave = point.radialWave;
                const radius = point.radius - (wave?.depth ?? 0) *
                    (1 - Math.cos((wave?.lobes ?? 0) * angle +
                        (wave?.phase ?? 0))) / 2;
                if (!(radius > 0)) {
                    throw new RangeError("Radial wave collapsed a ring");
                }
                ids.push(vertices.length);
                vertices.push(new THREE.Vector3(
                    radius * Math.sin(angle), point.y,
                    radius * Math.cos(angle)
                ));
            }
        }
        rows.push(ids);
    }

    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    for (let row = 0; row < (closed ? points.length : points.length - 1); row++) {
        const nextRow = (row + 1) % points.length;
        const current = points[row]!;
        const next = points[nextRow]!;
        const first = rows[row]!;
        const second = rows[nextRow]!;
        const surface = current.surface ?? "side";
        const smoothingGroup = current.smoothingGroup ?? surface;
        for (let side = 0; side < radialSegments; side++) {
            const following = (side + 1) % radialSegments;
            const u0 = side * step * Math.max(current.radius, next.radius);
            const u1 = (side + 1) * step * Math.max(current.radius, next.radius);
            const v0 = perimeters[row]!;
            const v1 = nextRow === 0
                ? perimeters[row]! + Math.hypot(
                    next.radius - current.radius, next.y - current.y
                )
                : perimeters[nextRow]!;
            if (first.length === 1) {
                // Pole -> circumference: no degenerate strip at the axis.
                const corners: TriangleFace["corners"] = [
                    first[0]!, second[following]!, second[side]!
                ];
                triangles.push({
                    corners, surface, smoothingGroup,
                    uvs: [
                        new THREE.Vector2((u0 + u1) / 2, v0),
                        new THREE.Vector2(u1, v1),
                        new THREE.Vector2(u0, v1)
                    ]
                });
            } else if (second.length === 1) {
                const corners: TriangleFace["corners"] = [
                    first[side]!, first[following]!, second[0]!
                ];
                triangles.push({
                    corners, surface, smoothingGroup,
                    uvs: [
                        new THREE.Vector2(u0, v0),
                        new THREE.Vector2(u1, v0),
                        new THREE.Vector2((u0 + u1) / 2, v1)
                    ]
                });
            } else {
                quads.push({
                    corners: [
                        first[side]!, first[following]!,
                        second[following]!, second[side]!
                    ],
                    surface, smoothingGroup,
                    uvs: [
                        new THREE.Vector2(u0, v0),
                        new THREE.Vector2(u1, v0),
                        new THREE.Vector2(u1, v1),
                        new THREE.Vector2(u0, v1)
                    ]
                });
            }
        }
    }

    return {vertices, quads, triangles};
}
