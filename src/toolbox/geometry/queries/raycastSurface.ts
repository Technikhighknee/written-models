import * as THREE from "three";
import {
    GeometryOperationError,
    type FaceRef
} from "../kernel/GeometryResult";
import {
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { surfaceTriangles } from "./surfaceTriangles";
import type { SurfaceTarget } from "./surfaceTriangles";

export type { SurfaceTarget } from "./surfaceTriangles";

export interface Ray3 {
    origin: THREE.Vector3Like;
    direction: THREE.Vector3Like;
    maxDistance: number;
}

export interface SurfaceHit {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    face: FaceRef;
    faceCorners: readonly [number, number, number];
    barycentric: readonly [number, number, number];
    region: string;
    distance: number;
    frontFacing: boolean;
}

/** The nearest authored triangle hit, in world coordinates and world meters. */
export function raycastSurface(
    target: SurfaceTarget,
    ray: Ray3,
    precision?: GeometryPrecision
): SurfaceHit | null {
    const policy = resolvePrecision(precision);

    if (
        !ray?.origin || !ray.direction ||
        !Number.isFinite(ray.maxDistance) || ray.maxDistance <= 0 ||
        ![ray.origin.x, ray.origin.y, ray.origin.z,
            ray.direction.x, ray.direction.y, ray.direction.z]
            .every(Number.isFinite)
    ) {
        throw new GeometryOperationError(
            "raycastSurface", "invalid-input", "Invalid surface ray"
        );
    }

    const heading = new THREE.Vector3(
        ray.direction.x, ray.direction.y, ray.direction.z
    );

    if (!Number.isFinite(heading.lengthSq()) || !(heading.lengthSq() > 0)) {
        throw new GeometryOperationError(
            "raycastSurface", "invalid-input", "Invalid ray direction"
        );
    }

    const worldRay = new THREE.Ray(
        new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z),
        heading.normalize()
    );

    const contact = new THREE.Vector3();
    let nearest: SurfaceHit | null = null;

    for (const triangle of surfaceTriangles(
        target, policy, "raycastSurface"
    )) {
        const [a, b, c] = triangle.points;
        if (!worldRay.intersectTriangle(a, b, c, false, contact)) continue;

        const distance = contact.distanceTo(worldRay.origin);
        if (distance > ray.maxDistance ||
            (nearest && distance >= nearest.distance)) {
            continue;
        }

        const weights = THREE.Triangle.getBarycoord(
            contact, a, b, c, new THREE.Vector3()
        );
        if (!weights) continue;

        nearest = {
            point: contact.clone(),
            normal: triangle.normal.clone(),
            face: { ...triangle.face },
            faceCorners: [...triangle.faceCorners],
            barycentric: [weights.x, weights.y, weights.z],
            region: triangle.region,
            distance,
            frontFacing: worldRay.direction.dot(triangle.normal) < 0
        };
    }

    return nearest;
}
