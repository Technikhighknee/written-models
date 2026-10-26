import * as THREE from "three";
import type { MeshData, QuadFace } from "../mesh/MeshData";

/**
 * A board section viewed across its width. Both rows run left to right.
 * The sections must follow the board's length in a consistent direction;
 * viewed along that direction, outer and inner describe its two faces.
 */
export interface BoardSection {
    outer: readonly THREE.Vector3Like[];
    inner: readonly THREE.Vector3Like[];
}

/**
 * Connects paired surface strips into one closed, quad-only board.
 * Each section may have a different width, bend, and thickness.
 * Outer and inner faces are smoothly shaded independently, while
 * the seams and end grain stay sharp.
 */
export function loftBoard(
    sections: readonly BoardSection[]
): MeshData {
    const widthPoints = sections[0]?.outer.length ?? 0;

    if (
        sections.length < 2 ||
        widthPoints < 2 ||
        sections.some(section =>
            section.outer.length !== widthPoints ||
            section.inner.length !== widthPoints
        )
    ) {
        throw new RangeError(
            "Board requires at least two sections with matching surface rows"
        );
    }

    const ringSize = widthPoints * 2;
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
            const length = a.distanceTo(b);

            if (!(length > 0)) {
                throw new RangeError("Board section has collapsed edges");
            }

            perimeter.push(perimeter[j - 1]! + length);
        }

        perimeters.push(perimeter);

        if (i > 0) {
            const a = rings[i - 1]![0]!;
            const b = ring[0]!;
            const distance = a.distanceTo(b);

            if (!(distance > 0)) {
                throw new RangeError("Consecutive board sections must differ");
            }

            lengths.push(lengths[i - 1]! + distance);
        }
    }

    const quads: QuadFace[] = [];

    for (let i = 0; i < rings.length - 1; i++) {
        const lower = i * ringSize;
        const upper = (i + 1) * ringSize;

        for (let j = 0; j < ringSize; j++) {
            const next = (j + 1) % ringSize;
            const surface = j < widthPoints - 1
                ? "outer"
                : j === widthPoints - 1
                    ? "edge-right"
                    : j < ringSize - 1
                        ? "inner"
                        : "edge-left";

            quads.push({
                corners: [lower + j, lower + next, upper + next, upper + j],
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

    // The end grain is divided into strips so it remains all-quads,
    // even when either surface bends across the width.
    for (const [sectionIndex, surface] of [
        [0, "cap-start"],
        [rings.length - 1, "cap-end"]
    ] as const) {
        const ring = rings[sectionIndex]!;
        const offset = sectionIndex * ringSize;
        const start = sectionIndex === 0;

        for (let j = 0; j < widthPoints - 1; j++) {
            const outerA = offset + j;
            const outerB = outerA + 1;
            const innerA = offset + ringSize - 1 - j;
            const innerB = innerA - 1;
            const uA = perimeters[sectionIndex]![j]!;
            const uB = perimeters[sectionIndex]![j + 1]!;
            const thicknessA = ring[j]!.distanceTo(ring[ringSize - 1 - j]!);
            const thicknessB = ring[j + 1]!.distanceTo(ring[ringSize - 2 - j]!);

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
    }

    return { vertices, quads };
}
