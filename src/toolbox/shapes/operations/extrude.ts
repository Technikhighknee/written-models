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
 * Build control faces from the shape and extrusion layers, not from a
 * triangulated BufferGeometry. Three.js still supplies curve sampling and
 * earcut triangulation of the caps (including holes).
 *
 * Local shape X/Y becomes world X/-Z; extrusion depth becomes world Y.
 * Material 0 = caps; material 1 = sides, as with Three.js extrusions.
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
    const bevelEnabled = bevelSize > 0 && bevelThickness > 0;
    const depth = thickness - (bevelEnabled ? 2 * bevelThickness : 0);

    if (
        ![thickness, bevelSize, bevelThickness].every(Number.isFinite) ||
        thickness <= 0 || bevelSize < 0 || bevelThickness < 0 ||
        depth <= 0 ||
        !Number.isInteger(curveSegments) || curveSegments < 1
    ) {
        throw new RangeError("Invalid extrusion dimensions");
    }

    const sampled = shape.extractPoints(curveSegments);

    // Preserve construction stations, while removing only duplicate points
    // that would create zero-width side quads. Keep all curved support points.
    function cleanLoop(points: readonly THREE.Vector2[]): THREE.Vector2[] {
        const loop: THREE.Vector2[] = [];
        for (const point of points) {
            if (![point.x, point.y].every(Number.isFinite)) {
                throw new RangeError("Invalid extrusion outline");
            }
            if (!loop.length || loop[loop.length - 1]!.distanceToSquared(point) > 1e-20) {
                loop.push(point.clone());
            }
        }
        if (loop.length > 2 && loop[0]!.distanceToSquared(loop.at(-1)!) <= 1e-20) {
            loop.pop();
        }
        if (loop.length < 3 || Math.abs(THREE.ShapeUtils.area(loop)) <= 1e-20) {
            throw new RangeError("Collapsed extrusion outline");
        }
        return loop;
    }

    const contour = cleanLoop(sampled.shape);
    if (!THREE.ShapeUtils.isClockWise(contour)) contour.reverse();

    const holes = sampled.holes.map(cleanLoop);
    for (const hole of holes) {
        if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
    }

    // ShapeUtils returns only the indices of the genuine cap triangles.
    // It never defines the side topology, which is constructed below.
    const triangulation = THREE.ShapeUtils.triangulateShape(contour, holes);
    if (triangulation.length === 0) {
        throw new RangeError("Extrusion cap cannot be triangulated");
    }

    const loops = [contour, ...holes];
    const outline = loops.flat();
    const count = outline.length;

    // Earcut may omit collinear outline stations. Those stations still
    // define authored sidewall edges: split affected cap triangles so the
    // same boundary vertices appear on BOTH sides of the rim. This avoids
    // invisible T-junctions without changing the original silhouette.
    const capTriangles: [number, number, number][] = [];

    function completeCap(triangle: [number, number, number]): void {
        for (let edge = 0; edge < 3; edge++) {
            const a = triangle[edge]!;
            const b = triangle[(edge + 1) % 3]!;
            const opposite = triangle[(edge + 2) % 3]!;
            const from = outline[a]!;
            const to = outline[b]!;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const lengthSq = dx * dx + dy * dy;

            const between = outline.flatMap((point, index) => {
                if (index === a || index === b || index === opposite) return [];
                const px = point.x - from.x;
                const py = point.y - from.y;
                const t = (px * dx + py * dy) / lengthSq;
                const distance = Math.abs(px * dy - py * dx) / Math.sqrt(lengthSq);
                return t > 1e-10 && t < 1 - 1e-10 && distance < 1e-10
                    ? [{ index, t }] : [];
            }).sort((left, right) => left.t - right.t);

            if (between.length) {
                let previous = a;
                for (const point of between) {
                    completeCap([previous, point.index, opposite]);
                    previous = point.index;
                }
                completeCap([previous, b, opposite]);
                return;
            }
        }
        capTriangles.push(triangle);
    }

    for (const face of triangulation) {
        const [a, b, c] = face;
        if (a === undefined || b === undefined || c === undefined) {
            throw new Error("Invalid cap triangulation indices");
        }
        completeCap([a, b, c]);
    }

    /**
     * Offset corner along the intersection of its two neighboring parallel
     * edges. Like the Three.js bevel construction, this keeps sharp corners
     * sharp instead of replacing them with arbitrary normalized bisectors.
     */
    function bevelDirection(
        previous: THREE.Vector2,
        current: THREE.Vector2,
        next: THREE.Vector2
    ): THREE.Vector2 {
        const incoming = current.clone().sub(previous);
        const outgoing = next.clone().sub(current);
        const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;

        if (Math.abs(cross) > Number.EPSILON) {
            const first = previous.clone().add(new THREE.Vector2(
                -incoming.y, incoming.x
            ).divideScalar(incoming.length()));
            const second = next.clone().add(new THREE.Vector2(
                -outgoing.y, outgoing.x
            ).divideScalar(outgoing.length()));

            const dx = second.x - first.x;
            const dy = second.y - first.y;
            const factor = (dx * outgoing.y - dy * outgoing.x) / cross;
            const movement = first.addScaledVector(incoming, factor).sub(current);

            if (movement.lengthSq() > 2) {
                movement.divideScalar(Math.sqrt(movement.lengthSq() / 2));
            }
            return movement;
        }

        if (incoming.dot(outgoing) >= 0) {
            return new THREE.Vector2(-incoming.y, incoming.x)
                .divideScalar(incoming.length());
        }

        // Collinear reversal: avoid an unbounded offset spike.
        return incoming.divideScalar(Math.sqrt(incoming.lengthSq() / 2));
    }

    const movements = loops.flatMap(loop =>
        loop.map((point, i) => bevelDirection(
            loop[(i + loop.length - 1) % loop.length]!,
            point,
            loop[(i + 1) % loop.length]!
        ))
    );

    // The cap outline stays at its authored size; the middle layers expand
    // around its perimeter when a bevel exists. No intermediary triangle
    // soup or geometric interpretation of the GPU index buffer is involved.
    const layers = bevelEnabled
        ? [
            { z: -bevelThickness, expansion: 0 },
            { z: 0, expansion: bevelSize },
            { z: depth, expansion: bevelSize },
            { z: depth + bevelThickness, expansion: 0 }
        ]
        : [
            { z: 0, expansion: 0 },
            { z: depth, expansion: 0 }
        ];

    const vertices: THREE.Vector3[] = [];
    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];

    for (const layer of layers) {
        for (let i = 0; i < count; i++) {
            const position = outline[i]!.clone().addScaledVector(
                movements[i]!, layer.expansion
            );
            vertices.push(new THREE.Vector3(
                position.x, layer.z - depth / 2, -position.y
            ));
        }
    }

    function localUV(index: number): THREE.Vector2 {
        const p = vertices[index]!;
        // Cap UVs preserve the original shape's planar coordinates.
        return new THREE.Vector2(p.x, -p.z);
    }

    function addCap(a: number, b: number, c: number): void {
        triangles.push({
            corners: [a, b, c],
            uvs: [localUV(a), localUV(b), localUV(c)],
            surface: "cap"
        });
    }

    const farOffset = (layers.length - 1) * count;
    for (const [a, b, c] of capTriangles) {
        if (a === undefined || b === undefined || c === undefined) {
            throw new Error("Invalid cap triangulation indices");
        }
        addCap(c, b, a);
        addCap(farOffset + a, farOffset + b, farOffset + c);
    }

    // Each pair of neighboring outline stations produces exactly one
    // authored quad per extrusion interval, including bevel intervals.
    let loopStart = 0;
    for (const loop of loops) {
        for (let i = 0; i < loop.length; i++) {
            const j = loopStart + i;
            const k = loopStart + (i + loop.length - 1) % loop.length;

            for (let layer = 0; layer < layers.length - 1; layer++) {
                const lower = layer * count;
                const upper = (layer + 1) * count;
                const corners: [number, number, number, number] = [
                    lower + j, lower + k,
                    upper + k, upper + j
                ];

                const [a, b, c, d] = corners.map(index => vertices[index]!);
                const useX = Math.abs(a!.z - b!.z) < Math.abs(a!.x - b!.x);
                const uv = (p: THREE.Vector3): THREE.Vector2 =>
                    new THREE.Vector2(
                        useX ? p.x : -p.z,
                        1 - (p.y + depth / 2)
                    );

                quads.push({
                    corners,
                    uvs: [uv(a!), uv(b!), uv(c!), uv(d!)],
                    surface: "side"
                });
            }
        }
        loopStart += loop.length;
    }

    const mesh: MeshData = { vertices, quads, triangles };
    return toBufferGeometry(mesh, { cap: 0, side: 1 });
}
