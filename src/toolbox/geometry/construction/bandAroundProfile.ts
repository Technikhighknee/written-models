import * as THREE from "three";
import type { MeshData, QuadFace } from "../mesh/MeshData";
import { toBufferGeometry } from "../mesh/toBufferGeometry";

export interface BandAroundProfileOptions {
    y: number;
    width: number;
    thickness: number;
    overlap?: number;
    radialSegments?: number;
    angleOffset?: number;
    bevel?: number;
}

/**
 * Sweeps a closed, optionally bevelled metal-strip section around a
 * radius/height profile. The profile is interpolated at every section
 * height, so the band's edges follow a tapered or bulged barrel.
 *
 * The radial sampling/offset can be aligned to the surface it grips:
 * a band with 24 segments offset by half a segment spans 24 staves
 * from center to center instead of arbitrarily cutting across them.
 *
 * Produces a genuine quad control mesh (including the inner face),
 * with smooth circumferential shading and sharp chamfer boundaries.
 */
export function bandAroundProfile(
    profile: readonly THREE.Vector2Like[],
    {
        y,
        width,
        thickness,
        overlap = 0,
        radialSegments = 48,
        angleOffset = 0,
        bevel = 0
    }: BandAroundProfileOptions
): THREE.BufferGeometry {
    const bottom = y - width / 2;
    const top = y + width / 2;

    if (
        [y, width, thickness, overlap, angleOffset, bevel]
            .some(value => !Number.isFinite(value)) ||
        width <= 0 ||
        thickness <= 0 ||
        overlap < 0 || overlap >= thickness ||
        bevel < 0 || bevel >= Math.min(width / 2, thickness - overlap) ||
        !Number.isInteger(radialSegments) || radialSegments < 3 ||
        profile.length < 2 ||
        profile.some((point, i) =>
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            point.x <= overlap ||
            (i > 0 && point.y <= profile[i - 1]!.y)
        ) ||
        bottom < profile[0]!.y || top > profile.at(-1)!.y
    ) {
        throw new RangeError("Invalid band dimensions or profile");
    }

    const radiusAt = (height: number): number => {
        for (let i = 1; i < profile.length; i++) {
            const a = profile[i - 1]!;
            const b = profile[i]!;

            if (height <= b.y) {
                return THREE.MathUtils.lerp(
                    a.x,
                    b.x,
                    (height - a.y) / (b.y - a.y)
                );
            }
        }

        throw new RangeError("Height outside band profile");
    };

    // Points are ordered counterclockwise around the strip section,
    // starting at the inner lower corner. Internal profile stations
    // preserve the barrel's changes of slope across a wide band.
    const section: { height: number; offset: number }[] = [
        { height: bottom, offset: -overlap },
        { height: bottom, offset: thickness - overlap - bevel }
    ];

    if (bevel > 0) {
        section.push({ height: bottom + bevel, offset: thickness - overlap });
    }

    for (const point of profile) {
        if (point.y > bottom + bevel && point.y < top - bevel) {
            section.push({ height: point.y, offset: thickness - overlap });
        }
    }

    if (bevel > 0) {
        section.push({ height: top - bevel, offset: thickness - overlap });
    }

    section.push(
        { height: top, offset: thickness - overlap - bevel },
        { height: top, offset: -overlap }
    );

    const sectionRadii = section.map(point => radiusAt(point.height) + point.offset);
    const perimeter = [0];

    for (let j = 0; j < section.length; j++) {
        const next = (j + 1) % section.length;
        const dr = sectionRadii[next]! - sectionRadii[j]!;
        const dy = section[next]!.height - section[j]!.height;
        perimeter.push(perimeter[j]! + Math.hypot(dr, dy));
    }

    const count = section.length;
    const vertices: THREE.Vector3[] = [];
    const quads: QuadFace[] = [];
    const step = (2 * Math.PI) / radialSegments;
    const uvRadius = radiusAt(y) + thickness / 2;

    for (let i = 0; i < radialSegments; i++) {
        const theta = angleOffset + step * i;

        for (let j = 0; j < count; j++) {
            const radius = sectionRadii[j]!;
            vertices.push(new THREE.Vector3(
                radius * Math.sin(theta),
                section[j]!.height,
                radius * Math.cos(theta)
            ));
        }
    }

    for (let i = 0; i < radialSegments; i++) {
        const nextSegment = (i + 1) % radialSegments;
        const u0 = i * step * uvRadius;
        const u1 = (i + 1) * step * uvRadius;

        for (let j = 0; j < count; j++) {
            const next = (j + 1) % count;
            const surface = j === 0 ? "bottom"
                : j === count - 1 ? "inside"
                : j === count - 2 ? "top"
                : bevel > 0 && j === 1 ? "lower-bevel"
                : bevel > 0 && j === count - 3 ? "upper-bevel"
                : "outside";

            quads.push({
                corners: [
                    i * count + j,
                    nextSegment * count + j,
                    nextSegment * count + next,
                    i * count + next
                ],
                surface,
                smoothingGroup: surface,
                uvs: [
                    new THREE.Vector2(u0, perimeter[j]!),
                    new THREE.Vector2(u1, perimeter[j]!),
                    new THREE.Vector2(u1, perimeter[j + 1]!),
                    new THREE.Vector2(u0, perimeter[j + 1]!)
                ]
            });
        }
    }

    const controlMesh: MeshData = { vertices, quads };
    return toBufferGeometry(controlMesh, {
        bottom: 0,
        "lower-bevel": 0,
        outside: 0,
        "upper-bevel": 0,
        top: 0,
        inside: 0
    });
}
