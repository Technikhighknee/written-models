import * as THREE from "three";
import type { MeshData, QuadFace } from "../mesh/MeshData";
import { AuthoredMeshBuilder } from "../mesh/AuthoredMeshBuilder";

export interface BoxMeshOptions {
    width: number;
    height: number;
    depth: number;
    widthSegments?: number;
    heightSegments?: number;
    depthSegments?: number;
}

/**
 * Build the six authored surfaces of a box as actual quad grids.
 * All UVs are in meters. The same face data drives rendering and the
 * control display; no BoxGeometry index-buffer reconstruction is needed.
 */
export function boxMesh({
    width, height, depth,
    widthSegments = 1,
    heightSegments = 1,
    depthSegments = 1
}: BoxMeshOptions): MeshData {
    if (
        [width, height, depth].some(n => !Number.isFinite(n) || n <= 0) ||
        [widthSegments, heightSegments, depthSegments]
            .some(n => !Number.isInteger(n) || n < 1)
    ) {
        throw new RangeError("Invalid box dimensions or subdivisions");
    }

    const vertices: THREE.Vector3[] = [];
    const quads: QuadFace[] = [];
    const faces = [
        { name: "px", center: [width / 2, 0, 0], u: [0, 0, -1], v: [0, 1, 0],
            sizeU: depth, sizeV: height, cols: depthSegments, rows: heightSegments },
        { name: "nx", center: [-width / 2, 0, 0], u: [0, 0, 1], v: [0, 1, 0],
            sizeU: depth, sizeV: height, cols: depthSegments, rows: heightSegments },
        { name: "py", center: [0, height / 2, 0], u: [1, 0, 0], v: [0, 0, -1],
            sizeU: width, sizeV: depth, cols: widthSegments, rows: depthSegments },
        { name: "ny", center: [0, -height / 2, 0], u: [1, 0, 0], v: [0, 0, 1],
            sizeU: width, sizeV: depth, cols: widthSegments, rows: depthSegments },
        { name: "pz", center: [0, 0, depth / 2], u: [1, 0, 0], v: [0, 1, 0],
            sizeU: width, sizeV: height, cols: widthSegments, rows: heightSegments },
        { name: "nz", center: [0, 0, -depth / 2], u: [-1, 0, 0], v: [0, 1, 0],
            sizeU: width, sizeV: height, cols: widthSegments, rows: heightSegments }
    ] as const;

    for (const face of faces) {
        const origin = vertices.length;
        for (let row = 0; row <= face.rows; row++) {
            for (let col = 0; col <= face.cols; col++) {
                const x = (col / face.cols - 0.5) * face.sizeU;
                const y = (row / face.rows - 0.5) * face.sizeV;
                vertices.push(new THREE.Vector3(
                    face.center[0] + face.u[0] * x + face.v[0] * y,
                    face.center[1] + face.u[1] * x + face.v[1] * y,
                    face.center[2] + face.u[2] * x + face.v[2] * y
                ));
            }
        }

        const stride = face.cols + 1;
        for (let row = 0; row < face.rows; row++) {
            for (let col = 0; col < face.cols; col++) {
                const a = origin + row * stride + col;
                const b = a + 1;
                const c = b + stride;
                const d = a + stride;
                const u0 = col / face.cols * face.sizeU;
                const u1 = (col + 1) / face.cols * face.sizeU;
                const v0 = row / face.rows * face.sizeV;
                const v1 = (row + 1) / face.rows * face.sizeV;

                quads.push({
                    corners: [a, b, c, d],
                    surface: face.name,
                    smoothingGroup: face.name,
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

    // UV and material seams remain face-local, while adjacent sides
    // refer to the same construction vertices.
    const smallestStep = Math.min(
        width / widthSegments,
        height / heightSegments,
        depth / depthSegments
    );
    const builder = new AuthoredMeshBuilder({
        weld: "position",
        resolution: Math.min(1e-9, smallestStep / 8)
    });

    for (const face of quads) {
        builder.addFace(
            face.corners.map(index => vertices[index]!),
            face.uvs,
            face.surface,
            face.smoothingGroup
        );
    }

    return builder.build();
}

export const BOX_SURFACES = {
    px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5
} as const;
