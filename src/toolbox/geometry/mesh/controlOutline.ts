import * as THREE from "three";
import { getControlMesh } from "./toBufferGeometry";

export interface ControlOutline {
    positions: number[];
    quadCount: number;
}

/**
 * Read the same authored faces that generated the render geometry.
 *
 * There is no registry, primitive-dependent recognition, or triangle-pair
 * guessing here. A box, rivet, loft, board or hoop contributes its
 * construction edges through MeshData when it is built.
 */
export function getControlOutline(
    geometry: THREE.BufferGeometry
): ControlOutline | null {
    const mesh = getControlMesh(geometry);
    if (!mesh) return null;

    const vertices = mesh.vertices;
    const positions: number[] = [];
    const edges = new Set<string>();

    function include(a: number, b: number): void {
        if (a === b) return;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (edges.has(key)) return;
        edges.add(key);

        const from = vertices[a]!;
        const to = vertices[b]!;
        positions.push(
            from.x, from.y, from.z,
            to.x, to.y, to.z
        );
    }

    for (const quad of mesh.quads) {
        for (let i = 0; i < 4; i++) {
            include(quad.corners[i]!, quad.corners[(i + 1) % 4]!);
        }
    }

    for (const triangle of mesh.triangles ?? []) {
        for (let i = 0; i < 3; i++) {
            include(triangle.corners[i]!, triangle.corners[(i + 1) % 3]!);
        }
    }

    return { positions, quadCount: mesh.quads.length };
}
