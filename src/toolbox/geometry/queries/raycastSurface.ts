import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import {
    GeometryOperationError,
    type FaceRef
} from "../kernel/GeometryResult";
import { triangulateAuthoredFaces } from "../kernel/triangulation";
import {
    assertAffineTransform,
    resolvePrecision,
    triangleQuality,
    type GeometryPrecision
} from "../kernel/precision";

export interface SurfaceTarget {
    geometry: MeshData;
    localToWorld: THREE.Matrix4;
}

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

/** Raycast authored geometry, preserving exact triangle and face-corner identity. */
export function raycastSurface(
    target: SurfaceTarget,
    ray: Ray3,
    precision?: GeometryPrecision
): SurfaceHit | null {
    const policy = resolvePrecision(precision);
    const { origin, direction, maxDistance } = ray;
    if (!Number.isFinite(maxDistance) || maxDistance <= 0 ||
        ![origin.x, origin.y, origin.z,
            direction.x, direction.y, direction.z].every(Number.isFinite)) {
        throw new GeometryOperationError(
            "raycastSurface", "invalid-input", "Invalid surface ray"
        );
    }

    const transform = target.localToWorld;
    assertAffineTransform(transform, "raycastSurface", policy);

    const heading = new THREE.Vector3(
        direction.x, direction.y, direction.z
    );
    if (!(heading.lengthSq() > 0) || !Number.isFinite(heading.lengthSq())) {
        throw new GeometryOperationError(
            "raycastSurface", "invalid-input", "Zero ray direction"
        );
    }
    heading.normalize();

    const worldRay = new THREE.Ray(
        new THREE.Vector3(origin.x, origin.y, origin.z),
        heading
    );
    const worldVertices = target.geometry.vertices.map(vertex =>
        vertex.clone().applyMatrix4(transform)
    );
    const contact = new THREE.Vector3();
    let nearest: SurfaceHit | null = null;

    for (const triangle of triangulateAuthoredFaces(target.geometry)) {
        const [i0, i1, i2] = triangle.vertices;
        const a = worldVertices[i0]!;
        const b = worldVertices[i1]!;
        const c = worldVertices[i2]!;
        const areaNormal = new THREE.Vector3().subVectors(b, a)
            .cross(new THREE.Vector3().subVectors(c, a));
        const magnitude = areaNormal.length();
        if (!triangleQuality(a, b, c, policy)) {
            throw new GeometryOperationError(
                "raycastSurface", "degenerate-geometry",
                "Degenerate source triangle",
                { face: triangle.face }
            );
        }

        if (!worldRay.intersectTriangle(a, b, c, false, contact)) continue;

        const distance = contact.distanceTo(worldRay.origin);
        if (distance > maxDistance || (nearest && distance >= nearest.distance)) {
            continue;
        }

        const weights = THREE.Triangle.getBarycoord(
            contact, a, b, c, new THREE.Vector3()
        );
        if (!weights) continue;

        const normal = areaNormal.divideScalar(magnitude);
        const face = triangle.face.kind === "quad"
            ? target.geometry.quads[triangle.face.index]!
            : target.geometry.triangles![triangle.face.index]!;

        nearest = {
            point: contact.clone(),
            normal,
            face: { ...triangle.face },
            faceCorners: [...triangle.faceCorners],
            barycentric: [weights.x, weights.y, weights.z],
            region: face.surface,
            distance,
            frontFacing: heading.dot(normal) < 0
        };
    }

    return nearest;
}
