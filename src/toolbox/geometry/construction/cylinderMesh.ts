import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";

export interface CylinderMeshOptions {
    radiusTop: number;
    radiusBottom: number;
    height: number;
    radialSegments?: number;
    heightSegments?: number;
}

/**
 * A cylinder with authored side quads and genuine triangular end fans.
 * The triangulated GPU buffer is produced from these faces, not the
 * other way around.
 */
export function cylinderMesh({
    radiusTop, radiusBottom, height,
    radialSegments = 16, heightSegments = 1
}: CylinderMeshOptions): MeshData {
    if (
        ![radiusTop, radiusBottom, height].every(Number.isFinite) ||
        radiusTop <= 0 || radiusBottom <= 0 || height <= 0 ||
        !Number.isInteger(radialSegments) || radialSegments < 3 ||
        !Number.isInteger(heightSegments) || heightSegments < 1
    ) {
        throw new RangeError("Invalid cylinder profile");
    }

    const vertices: THREE.Vector3[] = [];
    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    const step = 2 * Math.PI / radialSegments;

    for (let row = 0; row <= heightSegments; row++) {
        const t = row / heightSegments;
        const y = -height / 2 + height * t;
        const r = radiusBottom + (radiusTop - radiusBottom) * t;
        for (let col = 0; col < radialSegments; col++) {
            const angle = col * step;
            vertices.push(new THREE.Vector3(
                Math.sin(angle) * r, y, Math.cos(angle) * r
            ));
        }
    }

    for (let row = 0; row < heightSegments; row++) {
        for (let col = 0; col < radialSegments; col++) {
            const next = (col + 1) % radialSegments;
            const a = row * radialSegments + col;
            const b = row * radialSegments + next;
            const c = (row + 1) * radialSegments + next;
            const d = (row + 1) * radialSegments + col;
            const u0 = col * step * radiusBottom;
            const u1 = (col + 1) * step * radiusBottom;
            const v0 = row / heightSegments * height;
            const v1 = (row + 1) / heightSegments * height;
            quads.push({
                corners: [a, b, c, d],
                surface: "side",
                smoothingGroup: "side",
                uvs: [
                    new THREE.Vector2(u0, v0),
                    new THREE.Vector2(u1, v0),
                    new THREE.Vector2(u1, v1),
                    new THREE.Vector2(u0, v1)
                ]
            });
        }
    }

    for (const [top, radius, y, row, surface] of [
        [false, radiusBottom, -height / 2, 0, "bottom"],
        [true, radiusTop, height / 2, heightSegments, "top"]
    ] as const) {
        const center = vertices.length;
        vertices.push(new THREE.Vector3(0, y, 0));
        for (let col = 0; col < radialSegments; col++) {
            const next = (col + 1) % radialSegments;
            const a = row * radialSegments + col;
            const b = row * radialSegments + next;
            const corners: [number, number, number] = top
                ? [center, a, b] : [center, b, a];
            triangles.push({
                corners,
                surface,
                uvs: corners.map(index => new THREE.Vector2(
                    vertices[index]!.x + radius,
                    vertices[index]!.z + radius
                )) as [THREE.Vector2, THREE.Vector2, THREE.Vector2]
            });
        }
    }

    return { vertices, quads, triangles };
}

export const CYLINDER_SURFACES = {
    side: 0, top: 0, bottom: 0
} as const;
