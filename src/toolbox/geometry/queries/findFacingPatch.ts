import * as THREE from "three";
import {
    geometryResult,
    GeometryOperationError,
    type FaceRef
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { topologyOf } from "../kernel/topology";
import { surfaceTriangles, type SurfaceTarget } from "./surfaceTriangles";
import type { SurfaceHit } from "./raycastSurface";

export interface SurfacePatchHit {
    faces: readonly FaceRef[];
    contact: SurfaceHit;
    /** Rigid world frame at contact, with local +Z following the face normal. */
    frame: THREE.Matrix4;
}

function faceKey(ref: FaceRef): string {
    return `${ref.kind}:${ref.index}`;
}

function invalid(message: string): never {
    throw new GeometryOperationError(
        "findFacingPatch", "invalid-input", message
    );
}

/**
 * Select the closest outward-facing, connected coplanar authored region.
 * Only actual face neighbors are collected: nearby disconnected surfaces
 * and adjoining noncoplanar sides are not part of the contact footprint.
 */
export function findFacingPatch(
    target: SurfaceTarget,
    point: THREE.Vector3Like,
    direction: THREE.Vector3Like,
    precision?: GeometryPrecision
): SurfacePatchHit {
    const policy = resolvePrecision(precision);

    if (
        !point || !direction ||
        ![point.x, point.y, point.z,
            direction.x, direction.y, direction.z]
            .every(Number.isFinite)
    ) {
        invalid("Expected a world point and facing direction");
    }

    const near = new THREE.Vector3(point.x, point.y, point.z);
    const desired = new THREE.Vector3(
        direction.x, direction.y, direction.z
    );

    if (!(desired.lengthSq() > 0) ||
        !Number.isFinite(desired.lengthSq())) {
        invalid("Facing direction must be nonzero");
    }
    desired.normalize();

    const triangles = surfaceTriangles(
        target, policy, "findFacingPatch"
    );
    const extent = new THREE.Box3().setFromPoints(
        triangles.flatMap(t => t.points)
    ).getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);
    const cosine = Math.cos(policy.angle);
    const groups = new Map<string, typeof triangles>();

    for (const triangle of triangles) {
        const key = faceKey(triangle.face);
        const group = groups.get(key) ?? [];
        group.push(triangle);
        groups.set(key, group);
    }

    // A warped authored quad has different triangle normals. Its individual
    // triangles remain raycastable, but the quad is not one planar support.
    const planar = new Map<string, (typeof triangles)[number]>();

    for (const [key, pieces] of groups) {
        const first = pieces[0]!;
        if (pieces.every(piece =>
            first.normal.dot(piece.normal) >= cosine &&
            piece.points.every(vertex =>
                Math.abs(vertex.clone().sub(first.points[0]!)
                    .dot(first.normal)) <= tolerance
            )
        )) {
            planar.set(key, first);
        }
    }

    let selected: (typeof triangles)[number] | undefined;
    const closest = new THREE.Vector3();
    const candidate = new THREE.Vector3();
    let distance = Infinity;

    for (const triangle of triangles) {
        if (!planar.has(faceKey(triangle.face)) ||
            triangle.normal.dot(desired) <= 0) {
            continue;
        }

        const [a, b, c] = triangle.points;
        new THREE.Triangle(a, b, c).closestPointToPoint(near, candidate);
        const trial = candidate.distanceToSquared(near);

        if (trial < distance) {
            selected = triangle;
            distance = trial;
            closest.copy(candidate);
        }
    }

    if (!selected) {
        throw new GeometryOperationError(
            "findFacingPatch", "no-intersection",
            "No planar authored faces face the requested direction"
        );
    }

    const normal = selected.normal;
    const plane = selected.points[0]!;
    const topology = topologyOf(geometryResult(target.geometry, policy));
    const faces: FaceRef[] = [];
    const seen = new Set<string>();
    const queue: FaceRef[] = [selected.face];

    while (queue.length) {
        const face = queue.pop()!;
        const key = faceKey(face);
        if (seen.has(key)) continue;
        seen.add(key);

        const neighbor = planar.get(key);
        if (
            !neighbor ||
            neighbor.normal.dot(normal) < cosine ||
            neighbor.points.some(vertex =>
                Math.abs(vertex.clone().sub(plane).dot(normal)) > tolerance
            )
        ) continue;

        faces.push({ ...face });
        for (const next of topology.faceNeighbors(face)) {
            if (!seen.has(faceKey(next))) queue.push(next);
        }
    }

    faces.sort((a, b) =>
        a.kind.localeCompare(b.kind) || a.index - b.index
    );

    const [a, b, c] = selected.points;
    const weights = THREE.Triangle.getBarycoord(
        closest, a, b, c, new THREE.Vector3()
    )!;

    const axisX = new THREE.Vector3(1, 0, 0);
    if (Math.abs(axisX.dot(normal)) > 0.9) {
        axisX.set(0, 1, 0);
    }
    axisX.addScaledVector(normal, -axisX.dot(normal)).normalize();
    const axisY = new THREE.Vector3().crossVectors(normal, axisX);

    const frame = new THREE.Matrix4()
        .makeBasis(axisX, axisY, normal)
        .setPosition(closest);

    return {
        faces,
        contact: {
            point: closest,
            normal: normal.clone(),
            face: { ...selected.face },
            faceCorners: [...selected.faceCorners],
            barycentric: [weights.x, weights.y, weights.z],
            region: selected.region,
            distance: Math.sqrt(distance),
            frontFacing: true
        },
        frame
    };
}
