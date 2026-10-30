import * as THREE from "three";
import type { MeshData, QuadFace } from "../mesh/MeshData";
import { toBufferGeometry } from "../mesh/toBufferGeometry";
import { linearProfile } from "../../shapes/profiles/linearProfile";
import { polygonalRadiusOutside } from "../build/polygonalRadiusOutside";
import { polarPoint } from "../build/samplePolarStripSections";

export interface BandAroundProfileOptions {
    y: number;
    width: number;
    thickness: number;
    /** Radial clearance to the OUTERMOST wood envelope, in meters. */
    clearance?: number;
    radialSegments?: number;
    angleOffset?: number;
    bevel?: number;
    /** Optional finite arc, for overlaps, straps and raised joins. */
    arc?: { startAngle: number; sweepAngle: number };
}

/**
 * Sweeps a closed, optionally bevelled metal-strip section around a
 * radius/height profile. The profile is interpolated at every section
 * height, so the band's edges follow a tapered or bulged barrel.
 *
 * The radial sampling/offset can be aligned to the surface it grips:
 * a band can align its vertices with a stave layout. A sufficient angular
 * sampling rate plus calculated chord clearance keeps the entire INNER
 * polygon outside the barrel, not just the ring's sampled vertices.
 *
 * Produces an authored quad mesh (including the inner face),
 * with explicit smoothing regions and sharp chamfer boundaries.
 */
export function bandAroundProfileData(
    profile: readonly THREE.Vector2Like[],
    {
        y,
        width,
        thickness,
        clearance = 0,
        radialSegments = 48,
        angleOffset = 0,
        bevel = 0,
        arc
    }: BandAroundProfileOptions
): MeshData {
    const bottom = y - width / 2;
    const top = y + width / 2;

    if (
        [y, width, thickness, clearance, angleOffset, bevel]
            .some(value => !Number.isFinite(value)) ||
        width <= 0 ||
        thickness <= 0 ||
        clearance < 0 ||
        bevel < 0 || bevel >= Math.min(width / 2, thickness) ||
        (arc !== undefined && (
            !Number.isFinite(arc.startAngle) ||
            !Number.isFinite(arc.sweepAngle) ||
            arc.sweepAngle <= 0 || arc.sweepAngle >= Math.PI * 2
        )) ||
        !Number.isInteger(radialSegments) || radialSegments < 3 ||
        profile.length < 2 ||
        profile.some((point, i) =>
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            point.x <= 0 ||
            (i > 0 && point.y <= profile[i - 1]!.y)
        ) ||
        bottom < profile[0]!.y || top > profile.at(-1)!.y
    ) {
        throw new RangeError("Invalid band dimensions or profile");
    }

    const radiusAt = linearProfile(profile.map(point => ({
        x: point.y, y: point.x
    })));

    // The straight segments between neighboring vertices must also remain
    // outside the complete wood envelope. A ring drawn through points at
    // exactly the wood radius cuts INWARD between those points. Compensate
    // that chord sagitta, then add an explicit positive clearance.
    const angularStep = arc
        ? arc.sweepAngle / radialSegments
        : Math.PI * 2 / radialSegments;
    const radiusForBand = (height: number): number =>
        polygonalRadiusOutside(radiusAt(height), angularStep, clearance);

    // Points are ordered counterclockwise around the strip section,
    // starting at the inner lower corner. Internal profile stations
    // preserve the barrel's changes of slope across a wide band.
    const section: { height: number; offset: number }[] = [
        { height: bottom, offset: 0 },
        { height: bottom, offset: thickness - bevel }
    ];

    if (bevel > 0) {
        section.push({ height: bottom + bevel, offset: thickness });
    }

    for (const point of profile) {
        if (point.y > bottom + bevel && point.y < top - bevel) {
            section.push({ height: point.y, offset: thickness });
        }
    }

    if (bevel > 0) {
        section.push({ height: top - bevel, offset: thickness });
    }

    section.push(
        { height: top, offset: thickness - bevel },
        { height: top, offset: 0 }
    );

    // Arc end caps are authored as real quad surfaces. They need an even
    // number of profile stations; adding a point on an existing straight
    // edge changes neither the silhouette nor the intended metal shape.
    if (arc && section.length % 2 !== 0) {
        const a = section[1]!;
        const b = section[2]!;
        section.splice(2, 0, {
            height: (a.height + b.height) / 2,
            offset: (a.offset + b.offset) / 2
        });
    }

    const sectionRadii = section.map(point => radiusForBand(point.height) + point.offset);
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
    const step = angularStep;
    const uvRadius = radiusForBand(y) + thickness / 2;
    const stationCount = arc ? radialSegments + 1 : radialSegments;

    for (let i = 0; i < stationCount; i++) {
        const theta = (arc ? arc.startAngle : angleOffset) + step * i;

        for (let j = 0; j < count; j++) {
            const radius = sectionRadii[j]!;
            vertices.push(polarPoint(radius, section[j]!.height, theta));
        }
    }

    for (let i = 0; i < radialSegments; i++) {
        const nextSegment = (i + 1) % stationCount;
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

    if (arc) {
        for (const [sectionIndex, surface, reverse] of [
            [0, "cap-start", false],
            [radialSegments, "cap-end", true]
        ] as const) {
            const offset = sectionIndex * count;
            // Fan the polygon into quads without triangulation diagonals.
            for (let j = 0; j < count - 2; j += 2) {
                const face = [
                    offset + j,
                    offset + j + 1,
                    offset + j + 2,
                    offset + count - 1
                ] as const;
                const corners: [number, number, number, number] = reverse
                    ? [face[3], face[2], face[1], face[0]]
                    : [face[0], face[1], face[2], face[3]];
                quads.push({
                    corners,
                    surface,
                    uvs: corners.map(index => {
                        const p = vertices[index]!;
                        const angle = arc.startAngle + step * sectionIndex;
                        const radius = p.x * Math.sin(angle) +
                            p.z * Math.cos(angle);
                        return new THREE.Vector2(radius, p.y);
                    }) as [THREE.Vector2, THREE.Vector2, THREE.Vector2, THREE.Vector2]
                });
            }
        }
    }

    return { vertices, quads };
}

/** Compile a profile band for the renderer without losing its authored source. */
export function bandAroundProfile(
    profile: readonly THREE.Vector2Like[],
    options: BandAroundProfileOptions
): THREE.BufferGeometry {
    return toBufferGeometry(bandAroundProfileData(profile, options), {
        bottom: 0,
        "lower-bevel": 0,
        outside: 0,
        "upper-bevel": 0,
        top: 0,
        inside: 0,
        "cap-start": 0,
        "cap-end": 0
    });
}
