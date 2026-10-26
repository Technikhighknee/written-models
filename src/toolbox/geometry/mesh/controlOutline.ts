import * as THREE from "three";
import { getControlMesh } from "./toBufferGeometry";

export interface ControlOutline {
    positions: number[];
    quadCount: number;
}

/**
 * Returns the construction edges, not the triangulation wireframe.
 * Built-in Three.js generators keep a regular vertex layout that we
 * can read without modifying the original render geometry.
 */
export function getControlOutline(
    geometry: THREE.BufferGeometry
): ControlOutline | null {
    const controlMesh = getControlMesh(geometry);
    const attribute = geometry.getAttribute("position");

    if (!controlMesh && !attribute) return null;

    const positions: number[] = [];
    const edges = new Set<string>();
    let quadCount = 0;

    function addEdge(
        start: THREE.Vector3,
        end: THREE.Vector3,
        startKey: string,
        endKey: string
    ): void {
        if (startKey === endKey) return;

        const key = startKey < endKey
            ? `${startKey}|${endKey}`
            : `${endKey}|${startKey}`;

        if (edges.has(key)) return;
        edges.add(key);

        positions.push(
            start.x, start.y, start.z,
            end.x, end.y, end.z
        );
    }

    // Native control meshes have actual vertex identities.
    // Never weld them just because two vertices overlap in space.
    if (controlMesh) {
        for (const quad of controlMesh.quads) {
            quadCount++;

            for (let i = 0; i < 4; i++) {
                const a = quad.corners[i]!;
                const b = quad.corners[(i + 1) % 4]!;

                addEdge(
                    controlMesh.vertices[a]!,
                    controlMesh.vertices[b]!,
                    String(a),
                    String(b)
                );
            }
        }

        return { positions, quadCount };
    }

    if (!attribute) return null;

    function vertex(index: number): THREE.Vector3 {
        return new THREE.Vector3()
            .fromBufferAttribute(attribute, index);
    }

    // BoxGeometry and LatheGeometry duplicate some positions at
    // material/UV seams. Only for these *display edges* do we weld
    // coincident endpoints. No model topology is changed.
    function keyOf(point: THREE.Vector3): string {
        return [
            Math.round(point.x * 1e7),
            Math.round(point.y * 1e7),
            Math.round(point.z * 1e7)
        ].join(":");
    }

    function addQuad(a: number, b: number, c: number, d: number): void {
        const corners = [a, b, c, d].map(vertex);
        const keys = corners.map(keyOf);

        // LatheGeometry can collapse a quad into a triangle at
        // a pole. Draw its edges, but don't count it as a quad.
        if (new Set(keys).size === 4) {
            quadCount++;
        }

        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;

            addEdge(
                corners[i]!,
                corners[j]!,
                keys[i]!,
                keys[j]!
            );
        }
    }

    if (geometry instanceof THREE.BoxGeometry) {
        const {
            widthSegments: w,
            heightSegments: h,
            depthSegments: d
        } = geometry.parameters;

        // Face-grid order in Three.js r186: px, nx, py, ny, pz, nz.
        const grids: [number, number][] = [
            [d, h], [d, h],
            [w, d], [w, d],
            [w, h], [w, h]
        ];

        let offset = 0;

        for (const [columns, rows] of grids) {
            const stride = columns + 1;

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < columns; x++) {
                    const a = offset + y * stride + x;
                    addQuad(a, a + 1, a + stride + 1, a + stride);
                }
            }

            offset += (columns + 1) * (rows + 1);
        }
    } else if (geometry instanceof THREE.LatheGeometry) {
        const { points, segments } = geometry.parameters;
        const stride = points.length;

        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < stride - 1; j++) {
                const a = i * stride + j;
                const b = a + stride;
                addQuad(a, b, b + 1, a + 1);
            }
        }
    } else if (geometry instanceof THREE.ExtrudeGeometry) {
        if (geometry.getIndex() !== null) {
            throw new Error(
                "Indexed ExtrudeGeometry cannot expose its original sidewall quads"
            );
        }

        // Three.js r186 emits cap triangles in group 0 and
        // sidewall quads as two triangles each in group 1.
        // The caps remain triangulated: do not invent cap quads.
        for (const group of geometry.groups) {
            if (group.materialIndex !== 1) continue;

            if (group.count % 6 !== 0) {
                throw new Error("Unexpected ExtrudeGeometry sidewall layout");
            }

            for (
                let i = group.start;
                i < group.start + group.count;
                i += 6
            ) {
                // Emitted triangle corners: (a,b,d), (b,c,d).
                addQuad(i, i + 1, i + 4, i + 2);
            }
        }
    } else {
        // Arbitrary triangle meshes do not contain enough
        // information to reconstruct their original quads.
        return null;
    }

    return { positions, quadCount };
}
