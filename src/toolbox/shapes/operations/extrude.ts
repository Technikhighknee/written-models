import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "../../geometry/mesh/MeshData";
import { toBufferGeometry } from "../../geometry/mesh/toBufferGeometry";

export interface ExtrudeBevel {
    size: number;
    thickness: number;
}

export interface ExtrudeOptions {
    thickness: number;
    bevel?: ExtrudeBevel | null;
    curveSegments?: number;
}

/**
 * Let Three.js compute arbitrary polygon/holes/bevel intersections, then
 * preserve the actual construction faces as MeshData immediately.
 * Downstream rendering and the control view derive from that same set of
 * true side quads and cap triangles. No viewer primitive special cases.
 */
export function extrude(
    shape: THREE.Shape,
    {
        thickness,
        bevel = null,
        curveSegments = 32
    }: ExtrudeOptions
): THREE.BufferGeometry {
    const bevelSize = bevel?.size ?? 0;
    const bevelThickness = bevel?.thickness ?? 0;
    const depth = thickness - 2 * bevelThickness;

    if (
        !Number.isFinite(depth) || depth <= 0 ||
        !Number.isFinite(bevelSize) || !Number.isFinite(bevelThickness) ||
        bevelSize < 0 || bevelThickness < 0 ||
        !Number.isInteger(curveSegments) || curveSegments < 1
    ) {
        throw new RangeError("Invalid extrusion dimensions");
    }

    const raw = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelSize,
        bevelThickness,
        curveSegments,
        bevelEnabled: bevelSize > 0 && bevelThickness > 0,
        bevelSegments: 1
    });

    raw.translate(0, 0, -depth / 2);
    raw.rotateX(-Math.PI / 2);

    const positions = raw.getAttribute("position");
    const textureCoords = raw.getAttribute("uv");

    if (raw.getIndex() !== null || !positions || !textureCoords) {
        throw new Error("Unsupported native extrusion layout");
    }

    const vertices: THREE.Vector3[] = [];
    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    const indexByPosition = new Map<string, number>();

    function vertex(index: number): number {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const z = positions.getZ(index);
        const key = [x, y, z]
            .map(value => Math.round(value * 1e9)).join(":");
        const existing = indexByPosition.get(key);
        if (existing !== undefined) return existing;
        const next = vertices.length;
        vertices.push(new THREE.Vector3(x, y, z));
        indexByPosition.set(key, next);
        return next;
    }

    function uv(index: number): THREE.Vector2 {
        return new THREE.Vector2(
            textureCoords.getX(index), textureCoords.getY(index)
        );
    }

    function hasArea(a: number, b: number, c: number): boolean {
        const va = vertices[a]!;
        const vb = vertices[b]!;
        const vc = vertices[c]!;
        return new THREE.Vector3().subVectors(vb, va)
            .cross(new THREE.Vector3().subVectors(vc, va))
            .lengthSq() > 1e-22;
    }

    for (const group of raw.groups) {
        const end = group.start + group.count;

        if (group.materialIndex === 0) {
            // Real cap triangulation, including polygons with holes.
            if (group.count % 3 !== 0) {
                throw new Error("Invalid extrusion cap triangulation");
            }
            for (let i = group.start; i < end; i += 3) {
                const corners: [number, number, number] = [
                    vertex(i), vertex(i + 1), vertex(i + 2)
                ];
                if (hasArea(...corners)) {
                    triangles.push({
                        corners,
                        uvs: [uv(i), uv(i + 1), uv(i + 2)],
                        surface: "cap"
                    });
                }
            }
        } else if (group.materialIndex === 1) {
            // The native extruder emits two triangles per sidewall quad.
            // Capture its authored quad boundaries once, at construction.
            if (group.count % 6 !== 0) {
                throw new Error("Invalid extrusion sidewall layout");
            }
            for (let i = group.start; i < end; i += 6) {
                const corners: [number, number, number, number] = [
                    vertex(i), vertex(i + 1),
                    vertex(i + 4), vertex(i + 2)
                ];
                if (
                    hasArea(corners[0], corners[1], corners[2]) &&
                    hasArea(corners[0], corners[2], corners[3])
                ) {
                    quads.push({
                        corners,
                        uvs: [uv(i), uv(i + 1), uv(i + 4), uv(i + 2)],
                        surface: "side"
                    });
                } else {
                    // A zero-area side at a polygon cusp is not a quad.
                    // Keep any genuine triangle rather than invent a face.
                    for (const [a, b, c] of [
                        [i, i + 1, i + 2],
                        [i + 3, i + 4, i + 5]
                    ] as const) {
                        const triangle: [number, number, number] = [
                            vertex(a), vertex(b), vertex(c)
                        ];
                        if (hasArea(...triangle)) {
                            triangles.push({
                                corners: triangle,
                                uvs: [uv(a), uv(b), uv(c)],
                                surface: "side"
                            });
                        }
                    }
                }
            }
        } else {
            throw new Error("Unexpected extrusion surface material");
        }
    }

    raw.dispose();
    const mesh: MeshData = { vertices, quads, triangles };
    return toBufferGeometry(mesh, { cap: 0, side: 1 });
}
