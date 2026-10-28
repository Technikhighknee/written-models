import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";
import type { Contour2 } from "../definitions/geometry";
import {
    geometryResult,
    GeometryOperationError,
    type BoundaryRef,
    type GeometryResult
} from "../kernel/GeometryResult";
import {
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { topologyOf } from "../kernel/topology";
import { triangulateProfile } from "./triangulateProfile";

export interface RevolveFaceContext {
    meridianInterval: number;
    angularInterval: number;
}

export interface RevolveOptions {
    axisOrigin: THREE.Vector3Like;
    axisDirection: THREE.Vector3Like;
    radialDirection: THREE.Vector3Like;
    angle: number;
    segments: number;
    caps?: boolean;
    surfaceAt?: (face: RevolveFaceContext) => string;
    smoothingGroupAt?: (face: RevolveFaceContext) => string | undefined;
    capRegionAt?: (
        end: "angular-start" | "angular-end" |
            "meridian-start" | "meridian-end"
    ) => string;
    precision?: GeometryPrecision;
}

export interface MeridianStation {
    radius: number;
    height: number;
    surface?: string;
    smoothingGroup?: string;
    radialWave?: { lobes: number; depth: number; phase?: number };
}

export interface RevolveMeridianOptions extends RevolveOptions {
    closedMeridian?: boolean;
}

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "unsupported-topology" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("revolveProfile", reason, message);
}

function vector(point: THREE.Vector3Like): THREE.Vector3 {
    if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
        fail("invalid-input", "Non-finite revolution axis");
    }
    return new THREE.Vector3(point.x, point.y, point.z);
}

function frame(options: RevolveOptions): {
    origin: THREE.Vector3;
    axis: THREE.Vector3;
    radial: THREE.Vector3;
    tangent: THREE.Vector3;
} {
    const origin = vector(options.axisOrigin);
    const axis = vector(options.axisDirection);
    const radial = vector(options.radialDirection);

    if (axis.lengthSq() === 0 || radial.lengthSq() === 0) {
        fail("invalid-input", "Revolution axis is zero");
    }

    axis.normalize();
    radial.normalize();
    const tolerance = Math.sin(resolvePrecision(options.precision).angle);

    if (Math.abs(axis.dot(radial)) > tolerance) {
        fail("invalid-input", "Radial direction must be perpendicular to axis");
    }

    return {
        origin,
        axis,
        radial,
        tangent: new THREE.Vector3().crossVectors(axis, radial).normalize()
    };
}

function validate(
    points: readonly MeridianStation[],
    options: RevolveMeridianOptions,
    precision: GeometryPrecision
): void {
    const closed = options.closedMeridian ?? false;

    if (
        points.length < (closed ? 3 : 3) ||
        !Number.isInteger(options.segments) || options.segments < 3 ||
        !Number.isFinite(options.angle) ||
        options.angle <= 0 ||
        options.angle > Math.PI * 2
    ) {
        fail("invalid-input", "Invalid revolution angle or meridian sampling");
    }

    if (
        points.some((point, i) => {
            const wave = point.radialWave;
            return !Number.isFinite(point.radius) ||
                !Number.isFinite(point.height) ||
                point.radius < 0 ||
                (i > 0 &&
                    Math.hypot(
                        point.radius - points[i - 1]!.radius,
                        point.height - points[i - 1]!.height
                    ) <= precision.absoluteLength) ||
                (wave !== undefined && (
                    !Number.isInteger(wave.lobes) || wave.lobes < 1 ||
                    !Number.isFinite(wave.depth) || wave.depth < 0 ||
                    !Number.isFinite(wave.phase ?? 0)
                ));
        })
    ) {
        fail("invalid-input", "Invalid meridian station");
    }

    if (closed) {
        if (points.some(point => point.radius <= 0) ||
            Math.hypot(
                points[0]!.radius - points.at(-1)!.radius,
                points[0]!.height - points.at(-1)!.height
            ) <= precision.absoluteLength) {
            fail("invalid-input", "Cyclic meridian must have distinct positive-radius stations");
        }
    } else if (
        points[0]!.radius !== 0 ||
        points.at(-1)!.radius !== 0 ||
        points.slice(1, -1).some(point => point.radius <= 0)
    ) {
        fail("unsupported-topology", "Open meridian requires two axis poles");
    }
}

/**
 * Construct authored rotational geometry from meridian stations.
 * Partial angles retain the two angular end contours. Full rotations
 * share one ring of construction vertices around the seam.
 */
export function revolveMeridianMesh(
    points: readonly MeridianStation[],
    options: RevolveMeridianOptions
): MeshData {
    const precision = resolvePrecision(options.precision);
    validate(points, options, precision);

    const { origin, axis, radial, tangent } = frame(options);
    const full = options.angle === 2 * Math.PI;
    const closed = options.closedMeridian ?? false;
    const angularCount = full ? options.segments : options.segments + 1;
    const step = options.angle / options.segments;
    const vertices: THREE.Vector3[] = [];
    const rows: number[][] = [];
    const perimeters = [0];

    for (let row = 0; row < points.length; row++) {
        const point = points[row]!;

        if (row > 0) {
            const previous = points[row - 1]!;
            perimeters.push(
                perimeters[row - 1]! +
                Math.hypot(point.radius - previous.radius,
                    point.height - previous.height)
            );
        }

        const ids: number[] = [];
        if (point.radius === 0) {
            ids.push(vertices.length);
            vertices.push(origin.clone().addScaledVector(axis, point.height));
        } else {
            for (let col = 0; col < angularCount; col++) {
                const angle = step * col;
                const wave = point.radialWave;
                const radius = point.radius - (wave?.depth ?? 0) *
                    (1 - Math.cos((wave?.lobes ?? 0) * angle +
                        (wave?.phase ?? 0))) / 2;

                if (!(radius > 0)) {
                    fail("degenerate-geometry", "Radial modulation collapsed a ring");
                }

                const vertex = origin.clone()
                    .addScaledVector(axis, point.height)
                    .addScaledVector(radial, radius * Math.cos(angle))
                    .addScaledVector(tangent, radius * Math.sin(angle));

                ids.push(vertices.length);
                vertices.push(vertex);
            }
        }
        rows.push(ids);
    }

    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];

    for (let row = 0; row < (closed ? points.length : points.length - 1); row++) {
        const nextRow = (row + 1) % points.length;
        const first = rows[row]!;
        const second = rows[nextRow]!;
        const current = points[row]!;
        const next = points[nextRow]!;
        const v0 = perimeters[row]!;
        const v1 = nextRow === 0
            ? perimeters[row]! + Math.hypot(
                next.radius - current.radius,
                next.height - current.height
            )
            : perimeters[nextRow]!;

        for (let col = 0; col < options.segments; col++) {
            const following = full ? (col + 1) % options.segments : col + 1;
            const u0 = step * col * Math.max(current.radius, next.radius);
            const u1 = step * (col + 1) * Math.max(current.radius, next.radius);
            const context = { meridianInterval: row, angularInterval: col };
            const surface = options.surfaceAt?.(context) ??
                current.surface ?? "side";
            const smoothingGroup = options.smoothingGroupAt?.(context) ??
                current.smoothingGroup ?? surface;

            if (first.length === 1) {
                triangles.push({
                    corners: [first[0]!, second[following]!, second[col]!],
                    uvs: [
                        new THREE.Vector2((u0 + u1) / 2, v0),
                        new THREE.Vector2(u1, v1),
                        new THREE.Vector2(u0, v1)
                    ],
                    surface,
                    smoothingGroup
                });
            } else if (second.length === 1) {
                triangles.push({
                    corners: [first[col]!, first[following]!, second[0]!],
                    uvs: [
                        new THREE.Vector2(u0, v0),
                        new THREE.Vector2(u1, v0),
                        new THREE.Vector2((u0 + u1) / 2, v1)
                    ],
                    surface,
                    smoothingGroup
                });
            } else {
                quads.push({
                    corners: [
                        first[col]!, first[following]!,
                        second[following]!, second[col]!
                    ],
                    uvs: [
                        new THREE.Vector2(u0, v0),
                        new THREE.Vector2(u1, v0),
                        new THREE.Vector2(u1, v1),
                        new THREE.Vector2(u0, v1)
                    ],
                    surface,
                    smoothingGroup
                });
            }
        }
    }

    if (!full && options.caps) {
        // Angular end caps reuse all of the meridian's original vertices,
        // including pole vertices; no coincident geometry at the axis.
        const contour = points.map(p => new THREE.Vector2(p.radius, p.height));
        const profiles = triangulateProfile([contour], precision);

        for (const end of ["angular-start", "angular-end"] as const) {
            const col = end === "angular-start" ? 0 : angularCount - 1;
            const angle = step * col;
            const radialAt = radial.clone().multiplyScalar(Math.cos(angle))
                .addScaledVector(tangent, Math.sin(angle));
            const outward = new THREE.Vector3()
                .crossVectors(axis, radialAt)
                .multiplyScalar(end === "angular-start" ? -1 : 1);

            for (const face of profiles) {
                const corners = face.map(index =>
                    rows[index]!.length === 1 ? rows[index]![0]! :
                        rows[index]![col]!
                ) as TriangleFace["corners"];

                const [a, b, c] = corners.map(id => vertices[id]!);
                const normal = new THREE.Vector3().subVectors(b!, a!)
                    .cross(new THREE.Vector3().subVectors(c!, a!));

                if (normal.dot(outward) < 0) corners.reverse();

                triangles.push({
                    corners,
                    uvs: corners.map(id => {
                        const index = rows.findIndex(row => row.includes(id));
                        const point = points[index]!;
                        return new THREE.Vector2(point.radius, point.height);
                    }) as TriangleFace["uvs"],
                    surface: options.capRegionAt?.(end) ?? end
                });
            }
        }
    }

    return { vertices, quads, triangles };
}

/** Revolve a drawn radius/height profile around an explicitly oriented axis. */
export function revolveProfile(
    meridian: Contour2,
    options: RevolveOptions
): GeometryResult {
    if (!meridian || meridian.points.length < 3) {
        fail("invalid-input", "Missing revolution meridian");
    }

    const points: MeridianStation[] = meridian.points.map(p => ({
        radius: p.x,
        height: p.y
    }));
    let mesh: MeshData;

    try {
        mesh = revolveMeridianMesh(points, {
            ...options,
            closedMeridian: meridian.closed
        });
    } catch (error) {
        if (error instanceof GeometryOperationError) throw error;
        throw new GeometryOperationError(
            "revolveProfile", "invalid-input",
            error instanceof Error ? error.message : "Invalid revolution"
        );
    }

    const result = geometryResult(mesh, options.precision);
    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    const open = topologyOf(result).openBoundaries();

    // Boundaries are derived from authored topology, never guessed from
    // angular positions (poles and cyclic meridians have different counts).
    for (let i = 0; i < open.length; i++) {
        boundaries[`open-${i}`] = [open[i]!];
    }

    return { ...result, boundaries };
}
