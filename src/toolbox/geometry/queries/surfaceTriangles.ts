import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import {
    GeometryOperationError,
    type FaceRef
} from "../kernel/GeometryResult";
import {
    assertAffineTransform,
    resolvePrecision,
    triangleQuality,
    type GeometryPrecision
} from "../kernel/precision";
import {
    triangulateAuthoredFaces,
    type AuthoredTriangle
} from "../kernel/triangulation";

export interface SurfaceTarget {
    geometry: MeshData;
    localToWorld: THREE.Matrix4;
}

export interface WorldSurfaceTriangle extends AuthoredTriangle {
    /** World-space corners in authored winding order. */
    readonly points: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    /** Unit world-space geometric normal, including affine reflections. */
    readonly normal: THREE.Vector3;
    readonly region: string;
}

function invalid(
    operation: string,
    message: string,
    face?: FaceRef
): never {
    throw new GeometryOperationError(
        operation, "invalid-input", message,
        face === undefined ? undefined : { face }
    );
}

/**
 * Transform the shared authored triangulation, retaining source face and
 * corner identities. Render triangle ordering and GPU vertex splits play
 * no part in surface queries.
 */
export function surfaceTriangles(
    target: SurfaceTarget,
    precision?: GeometryPrecision,
    operation = "surfaceTriangles"
): WorldSurfaceTriangle[] {
    const policy = resolvePrecision(precision);

    if (
        !target?.geometry ||
        !Array.isArray(target.geometry.vertices) ||
        !Array.isArray(target.geometry.quads) ||
        (target.geometry.triangles !== undefined &&
            !Array.isArray(target.geometry.triangles)) ||
        !(target.localToWorld instanceof THREE.Matrix4)
    ) {
        invalid(operation, "Expected authored geometry and a local-to-world transform");
    }

    assertAffineTransform(target.localToWorld, operation, policy);

    const vertices = target.geometry.vertices.map((point, index) => {
        if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
            invalid(operation, `Nonfinite authored vertex ${index}`);
        }
        const world = new THREE.Vector3(
            point.x, point.y, point.z
        ).applyMatrix4(target.localToWorld);
        if (!world.toArray().every(Number.isFinite)) {
            invalid(operation, `Nonfinite transformed vertex ${index}`);
        }
        return world;
    });

    const checkFaces = (
        faces: readonly unknown[],
        kind: FaceRef["kind"],
        count: 3 | 4
    ): void => {
        faces.forEach((entry, index) => {
            const face = entry as MeshData["quads"][number];
            const ref: FaceRef = { kind, index };

            if (
                !face || !Array.isArray(face.corners) ||
                face.corners.length !== count ||
                new Set(face.corners).size !== count ||
                face.corners.some(id => !Number.isInteger(id) ||
                    id < 0 || id >= vertices.length) ||
                !Array.isArray(face.uvs) || face.uvs.length !== count ||
                face.uvs.some(uv => !uv ||
                    ![uv.x, uv.y].every(Number.isFinite)) ||
                typeof face.surface !== "string" || !face.surface.trim()
            ) {
                invalid(operation, "Invalid authored face", ref);
            }
        });
    };

    checkFaces(target.geometry.quads, "quad", 4);
    checkFaces(target.geometry.triangles ?? [], "triangle", 3);

    return triangulateAuthoredFaces(target.geometry).map(triangle => {
        const face = triangle.face.kind === "quad"
            ? target.geometry.quads[triangle.face.index]
            : target.geometry.triangles?.[triangle.face.index];

        const points = triangle.vertices.map(index => vertices[index]) as
            [THREE.Vector3 | undefined, THREE.Vector3 | undefined, THREE.Vector3 | undefined];

        if (
            points.some(point => point === undefined) ||
            !triangleQuality(points[0]!, points[1]!, points[2]!, policy)
        ) {
            throw new GeometryOperationError(
                operation, "degenerate-geometry",
                "Invalid or degenerate world-space triangle",
                { face: triangle.face }
            );
        }

        const normal = new THREE.Vector3()
            .subVectors(points[1]!, points[0]!)
            .cross(new THREE.Vector3().subVectors(points[2]!, points[0]!))
            .normalize();

        return {
            ...triangle,
            points: points as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
            normal,
            region: face.surface
        };
    });
}
