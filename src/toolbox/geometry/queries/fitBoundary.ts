import * as THREE from "three";
import {
    assertSelectionOwner,
    geometryResult,
    GeometryOperationError,
    type BoundaryRef,
    type GeometryResult
} from "../kernel/GeometryResult";
import {
    assertAffineTransform,
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { transferBoundary } from "../kernel/selectionLifecycle";
import { topologyOf } from "../kernel/topology";
import {
    surfaceTriangles,
    type SurfaceTarget,
    type WorldSurfaceTriangle
} from "./surfaceTriangles";

export interface BoundaryFitOptions {
    projection:
        | {
            kind: "ray";
            direction: THREE.Vector3Like;
            maxDistance: number;
        }
        | {
            kind: "closest";
            maxDistance: number;
        };
    sourceLocalToWorld: THREE.Matrix4;
    /** Signed world-metre displacement along the target's geometric normal. */
    clearance: number;
    /** Number of adjacent vertex rings that blend toward the fitted rim. */
    falloffRings: number;
    precision?: GeometryPrecision;
}

interface Contact {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    distance: number;
}

function fail(
    reason: "invalid-input" | "invalid-topology" | "no-intersection" |
        "outside-contact-patch" | "degenerate-geometry",
    message: string,
    vertex?: number
): never {
    throw new GeometryOperationError(
        "fitBoundary", reason, message,
        vertex === undefined ? undefined : { vertex }
    );
}

function vec(value: THREE.Vector3Like): THREE.Vector3 {
    if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
        fail("invalid-input", "Expected a finite world-space vector");
    }
    return new THREE.Vector3(value.x, value.y, value.z);
}

function queryContact(
    from: THREE.Vector3,
    triangles: readonly WorldSurfaceTriangle[],
    projection: BoundaryFitOptions["projection"],
    ray: THREE.Ray | undefined,
    precision: GeometryPrecision,
    vertex: number
): Contact {
    const candidate = new THREE.Vector3();
    let nearest: Contact | undefined;

    for (const triangle of triangles) {
        const [a, b, c] = triangle.points;
        let distance: number;

        if (ray) {
            if (!ray.intersectTriangle(a, b, c, false, candidate)) continue;
            distance = candidate.distanceTo(from);
        } else {
            new THREE.Triangle(a, b, c).closestPointToPoint(from, candidate);
            distance = candidate.distanceTo(from);
        }

        if (distance > projection.maxDistance ||
            (nearest && distance >= nearest.distance)) continue;

        nearest = {
            point: candidate.clone(),
            normal: triangle.normal.clone(),
            distance
        };
    }

    if (!nearest) {
        fail("no-intersection", "Boundary station cannot reach its target", vertex);
    }

    // Ray direction must enter the outward-facing surface. A nearest-point
    // query must approach from the normal's exterior half-space.
    const relative = from.clone().sub(nearest.point);
    const tolerance = lengthTolerance(
        precision, Math.max(nearest.distance, projection.maxDistance)
    );

    if (ray
        ? ray.direction.dot(nearest.normal) >= -Math.sin(precision.angle)
        : relative.dot(nearest.normal) < -tolerance
    ) {
        fail(
            "outside-contact-patch",
            "Contact lies on the wrong side of the target surface",
            vertex
        );
    }

    return nearest;
}

/**
 * Fit an owned, ordered authored boundary to an actual finite surface.
 * No stations or topology are invented. The target normal determines
 * signed clearance, including for reflected target transforms.
 */
export function fitBoundary(
    source: GeometryResult,
    boundary: BoundaryRef,
    target: SurfaceTarget,
    options: BoundaryFitOptions
): GeometryResult {
    const policy = resolvePrecision(options?.precision);
    const projection = options?.projection;

    if (
        !source?.geometry || !boundary || !projection ||
        (projection.kind !== "ray" && projection.kind !== "closest") ||
        !Number.isFinite(projection.maxDistance) ||
        projection.maxDistance <= 0 ||
        !Number.isFinite(options.clearance) ||
        !Number.isInteger(options.falloffRings) ||
        options.falloffRings < 0 ||
        !(options.sourceLocalToWorld instanceof THREE.Matrix4)
    ) {
        fail("invalid-input", "Invalid boundary fitting options");
    }

    assertAffineTransform(
        options.sourceLocalToWorld, "fitBoundary", policy
    );
    const transform = options.sourceLocalToWorld.clone();
    const inverse = transform.clone().invert();
    let direction: THREE.Vector3 | undefined;

    if (projection.kind === "ray") {
        direction = vec(projection.direction);
        if (!(direction.lengthSq() > 0)) {
            fail("invalid-input", "Ray direction must be nonzero");
        }
        direction.normalize();
    }

    assertSelectionOwner(source, boundary);
    const topology = topologyOf(source);
    const ids = boundary.vertices;

    if (
        typeof boundary.closed !== "boolean" ||
        ids.length < (boundary.closed ? 3 : 2) ||
        new Set(ids).size !== ids.length ||
        ids.some(id =>
            !Number.isInteger(id) ||
            id < 0 || id >= source.geometry.vertices.length
        )
    ) {
        fail("invalid-input", "Expected an ordered, distinct boundary chain");
    }

    const edgeCount = boundary.closed ? ids.length : ids.length - 1;
    for (let i = 0; i < edgeCount; i++) {
        const uses = topology.edgeUses(
            ids[i]!, ids[(i + 1) % ids.length]!
        );
        if (uses.length < 1 || uses.length > 2) {
            fail("invalid-topology", "Selected chain contains a missing or nonmanifold edge");
        }
    }

    let triangles: WorldSurfaceTriangle[];
    try {
        triangles = surfaceTriangles(target, policy, "fitBoundary");
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                "fitBoundary", error.reason, error.message, error.context
            );
        }
        throw error;
    }
    if (!triangles.length) {
        fail("no-intersection", "Target has no contact surface");
    }

    const original = source.geometry.vertices.map(vertex =>
        vertex.clone().applyMatrix4(transform)
    );
    const ray = direction
        ? new THREE.Ray(new THREE.Vector3(), direction)
        : undefined;
    const projected = new Map<number, THREE.Vector3>();

    for (const id of ids) {
        const from = original[id]!;
        if (ray) ray.origin.copy(from);

        const contact = queryContact(
            from, triangles, projection, ray, policy, id
        );
        const destination = contact.point.clone()
            .addScaledVector(contact.normal, options.clearance);

        if (
            !destination.toArray().every(Number.isFinite) ||
            destination.distanceTo(from) >
                projection.maxDistance + Math.abs(options.clearance) +
                    lengthTolerance(policy, projection.maxDistance)
        ) {
            fail("outside-contact-patch", "Boundary travel exceeds its range", id);
        }

        projected.set(id, destination.sub(from));
    }

    // A separately named or unnamed open rim must not be pulled around
    // merely because it happens to be close in the vertex graph.
    const selected = new Set(ids);
    const protectedVertices = new Set<number>();

    for (const chains of Object.values(source.boundaries)) {
        for (const chain of chains) {
            assertSelectionOwner(source, chain);
            for (const id of chain.vertices) {
                if (!selected.has(id)) protectedVertices.add(id);
            }
        }
    }
    for (const chain of topology.openBoundaries()) {
        for (const id of chain.vertices) {
            if (!selected.has(id)) protectedVertices.add(id);
        }
    }

    const adjacency = Array.from(
        { length: original.length }, () => new Set<number>()
    );
    for (const face of [
        ...source.geometry.quads,
        ...(source.geometry.triangles ?? [])
    ]) {
        for (let i = 0; i < face.corners.length; i++) {
            const a = face.corners[i]!;
            const b = face.corners[(i + 1) % face.corners.length]!;
            adjacency[a]!.add(b);
            adjacency[b]!.add(a);
        }
    }

    const depth = Array<number>(original.length).fill(-1);
    const queue = [...ids];
    for (const id of ids) depth[id] = 0;

    for (let cursor = 0; cursor < queue.length; cursor++) {
        const id = queue[cursor]!;
        if (depth[id]! >= options.falloffRings) continue;

        for (const adjacent of adjacency[id]!) {
            if (depth[adjacent] !== -1 ||
                protectedVertices.has(adjacent)) continue;
            depth[adjacent] = depth[id]! + 1;
            queue.push(adjacent);
        }
    }

    const world = original.map(point => point.clone());
    const seeds = [...projected];

    for (let id = 0; id < world.length; id++) {
        const rings = depth[id]!;
        if (rings < 0) continue;

        let displacement = projected.get(id);

        if (!displacement) {
            const blended = new THREE.Vector3();
            let total = 0;

            for (const [seed, delta] of seeds) {
                const squared = original[id]!.distanceToSquared(original[seed]!);
                const weight = 1 / Math.max(
                    squared, policy.absoluteLength ** 2
                );
                blended.addScaledVector(delta, weight);
                total += weight;
            }

            displacement = blended.multiplyScalar(1 / total);
        }

        const weight = rings === 0 ? 1 :
            (1 - rings / (options.falloffRings + 1)) ** 2;
        world[id]!.addScaledVector(displacement, weight);
    }

    const mesh = {
        vertices: world.map(point => point.applyMatrix4(inverse)),
        quads: source.geometry.quads,
        ...(source.geometry.triangles === undefined ? {} : {
            triangles: source.geometry.triangles
        })
    };

    let result: GeometryResult;
    try {
        result = geometryResult(mesh, policy);
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                "fitBoundary", error.reason, error.message, error.context
            );
        }
        throw error;
    }

    // Reject a face whose winding reverses during the fit, even if its
    // three corners still have a mathematically nonzero area.
    const faces = [
        ...source.geometry.quads.map(face => face.corners),
        ...(source.geometry.triangles ?? []).map(face => face.corners)
    ];
    const transformed = result.geometry.vertices.map(vertex =>
        vertex.clone().applyMatrix4(transform)
    );

    for (const corners of faces) {
        const before = new THREE.Vector3()
            .subVectors(original[corners[1]!]!, original[corners[0]!]!)
            .cross(new THREE.Vector3().subVectors(
                original[corners[2]!]!, original[corners[0]!]!
            ));
        const after = new THREE.Vector3()
            .subVectors(transformed[corners[1]!]!, transformed[corners[0]!]!)
            .cross(new THREE.Vector3().subVectors(
                transformed[corners[2]!]!, transformed[corners[0]!]!
            ));

        if (before.dot(after) <= 0) {
            fail("degenerate-geometry", "Fitting reversed an authored face");
        }
    }

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);

    for (const [name, chains] of Object.entries(source.boundaries)) {
        const carried = chains.flatMap(chain =>
            transferBoundary(source, result, chain, id => id)
        );
        if (carried.length) boundaries[name] = carried;
    }

    // Arbitrary curvature changes invalidate all parameterization charts.
    return { ...result, boundaries };
}
