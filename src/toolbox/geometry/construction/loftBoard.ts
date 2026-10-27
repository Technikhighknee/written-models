import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";
import { stitchPolylines } from "../topology/stitchPolylines";

/**
 * A cross-section of one closed board, viewed across its width.
 * Outer and inner run in the SAME left-to-right direction but may have
 * different numbers of support points. Longitudinal sections must agree
 * within each surface, so every shared edge joins without T-junctions.
 */
export interface BoardSection {
    outer: readonly THREE.Vector3Like[];
    inner: readonly THREE.Vector3Like[];
}

/**
 * Loft a watertight board from independently sampled surface rows.
 *
 * The visible face can retain a detailed edge bevel while a hidden face
 * uses a single broad quad. Sidewalls remain quads, and end caps are
 * stitched without inventing hidden subdivisions of the inner surface.
 * Caps with matching rows preserve the original quad strips; caps with
 * mismatched rows use genuine authored transition triangles.
 */
export function loftBoard(
    sections: readonly BoardSection[]
): MeshData {
    const outerPoints = sections[0]?.outer.length ?? 0;
    const innerPoints = sections[0]?.inner.length ?? 0;

    if (
        sections.length < 2 || outerPoints < 2 || innerPoints < 2 ||
        sections.some(section =>
            section.outer.length !== outerPoints ||
            section.inner.length !== innerPoints
        )
    ) {
        throw new RangeError(
            "Board needs at least two matching longitudinal sections, " +
            "with at least two points on each independent surface"
        );
    }

    const ringSize = outerPoints + innerPoints;
    const vertices: THREE.Vector3[] = [];
    const rings: THREE.Vector3[][] = [];

    for (const section of sections) {
        const ring = [
            ...section.outer,
            ...[...section.inner].reverse()
        ].map(point => {
            if (
                !Number.isFinite(point.x) ||
                !Number.isFinite(point.y) ||
                !Number.isFinite(point.z)
            ) {
                throw new RangeError("Invalid board section position");
            }

            return new THREE.Vector3(point.x, point.y, point.z);
        });

        vertices.push(...ring);
        rings.push(ring);
    }

    const lengths = [0];
    const perimeters: number[][] = [];

    for (let i = 0; i < rings.length; i++) {
        const ring = rings[i]!;
        const perimeter = [0];

        for (let j = 1; j <= ringSize; j++) {
            const a = ring[j - 1]!;
            const b = ring[j % ringSize]!;
            const distance = a.distanceTo(b);

            if (!(distance > 0)) {
                throw new RangeError("Board section has collapsed edges");
            }
            perimeter.push(perimeter[j - 1]! + distance);
        }

        perimeters.push(perimeter);

        if (i > 0) {
            const travel = ring[0]!.distanceTo(rings[i - 1]![0]!);
            if (!(travel > 0)) {
                throw new RangeError("Consecutive board sections must differ");
            }
            lengths.push(lengths[i - 1]! + travel);
        }
    }

    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];

    for (let i = 0; i < rings.length - 1; i++) {
        const lower = i * ringSize;
        const upper = (i + 1) * ringSize;

        for (let j = 0; j < ringSize; j++) {
            const next = (j + 1) % ringSize;
            const surface = j < outerPoints - 1
                ? "outer"
                : j === outerPoints - 1
                    ? "edge-right"
                    : j < ringSize - 1
                        ? "inner"
                        : "edge-left";

            quads.push({
                corners: [
                    lower + j, lower + next,
                    upper + next, upper + j
                ],
                surface,
                ...(surface === "outer" || surface === "inner"
                    ? { smoothingGroup: surface }
                    : {}),
                uvs: [
                    new THREE.Vector2(perimeters[i]![j]!, lengths[i]!),
                    new THREE.Vector2(perimeters[i]![j + 1]!, lengths[i]!),
                    new THREE.Vector2(perimeters[i + 1]![j + 1]!, lengths[i + 1]!),
                    new THREE.Vector2(perimeters[i + 1]![j]!, lengths[i + 1]!)
                ]
            });
        }
    }

    for (const [sectionIndex, surface] of [
        [0, "cap-start"],
        [rings.length - 1, "cap-end"]
    ] as const) {
        const ring = rings[sectionIndex]!;
        const offset = sectionIndex * ringSize;
        const start = sectionIndex === 0;

        // Matching inner and outer contours form quad-only end caps.
        if (outerPoints === innerPoints) {
            for (let j = 0; j < outerPoints - 1; j++) {
                const outerA = offset + j;
                const outerB = outerA + 1;
                const innerA = offset + ringSize - 1 - j;
                const innerB = innerA - 1;
                const uA = perimeters[sectionIndex]![j]!;
                const uB = perimeters[sectionIndex]![j + 1]!;
                const thicknessA = ring[j]!.distanceTo(
                    ring[ringSize - 1 - j]!
                );
                const thicknessB = ring[j + 1]!.distanceTo(
                    ring[ringSize - 2 - j]!
                );

                quads.push(start ? {
                    corners: [outerA, innerA, innerB, outerB],
                    surface,
                    uvs: [
                        new THREE.Vector2(uA, 0),
                        new THREE.Vector2(uA, thicknessA),
                        new THREE.Vector2(uB, thicknessB),
                        new THREE.Vector2(uB, 0)
                    ]
                } : {
                    corners: [outerA, outerB, innerB, innerA],
                    surface,
                    uvs: [
                        new THREE.Vector2(uA, 0),
                        new THREE.Vector2(uB, 0),
                        new THREE.Vector2(uB, thicknessB),
                        new THREE.Vector2(uA, thicknessA)
                    ]
                });
            }
            continue;
        }

        // An end face spans TWO polylines of different resolutions. Stitch
        // them monotonically: every boundary vertex is used exactly once
        // and no extra vertex is inserted on the low-poly inner surface.
        const origin = ring[0]!;
        const across = ring[outerPoints - 1]!.clone().sub(origin);
        const depth = ring[ringSize - 1]!.clone().sub(origin);

        if (across.lengthSq() === 0) {
            throw new RangeError("Collapsed board cap width");
        }
        across.normalize();
        depth.addScaledVector(across, -depth.dot(across));

        if (depth.lengthSq() === 0) {
            throw new RangeError("Collapsed board cap thickness");
        }
        depth.normalize();

        function uv(index: number): THREE.Vector2 {
            const local = vertices[index]!.clone().sub(origin);
            return new THREE.Vector2(
                local.dot(across),
                local.dot(depth)
            );
        }

        function addTriangle(a: number, b: number, c: number): void {
            triangles.push({
                corners: [a, b, c],
                surface,
                uvs: [uv(a), uv(b), uv(c)]
            });
        }

        const exterior = Array.from(
            {length: outerPoints}, (_, j) => offset + j
        );
        const interior = Array.from(
            {length: innerPoints}, (_, j) => offset + ringSize - 1 - j
        );
        for (const [a, b, c] of stitchPolylines(
            exterior, interior, !start
        )) addTriangle(a, b, c);
    }

    return triangles.length
        ? { vertices, quads, triangles }
        : { vertices, quads };
}
