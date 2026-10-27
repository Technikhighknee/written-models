import * as THREE from "three";
import type { BoardSection } from "./loftBoard";

/**
 * Divide an arbitrary axisymmetric radius/height surface into curved
 * circumferential strips with independently sampled outer/inner contours.
 *
 * Produces GEOMETRY SECTIONS, not meshes or materials: wood staves,
 * curved cladding, segmented shells, and forged radial plates can all
 * use the same layout, then select an appropriate loft operation.
 */
export interface RadialStripLayoutOptions {
    profile: readonly THREE.Vector2Like[];
    count: number;
    angleOffset?: number;
    /** Physical gap along the circumference, measured at each height. */
    seamGap?: number;
    outerSamples: readonly number[];
    innerSamples: readonly number[];
    outerRadius: (radius: number, height: number, fraction: number) => number;
    innerRadius: (radius: number, height: number, fraction: number) => number;
}

function validateSamples(samples: readonly number[]): boolean {
    return samples.length >= 2 && samples[0] === 0 &&
        samples.at(-1) === 1 &&
        samples.every((t, i) =>
            Number.isFinite(t) && t >= 0 && t <= 1 &&
            (i === 0 || t > samples[i - 1]!));
}

export function radialPoint(
    radius: number, height: number, angle: number
): THREE.Vector3 {
    return new THREE.Vector3(
        radius * Math.sin(angle), height, radius * Math.cos(angle)
    );
}

/**
 * Minimum vertex radius for a polygonal band whose CHORDS must clear
 * the supporting circular surface, not merely touch it at the vertices.
 */
export function polygonalRadiusOutside(
    radius: number, angularStep: number, clearance = 0
): number {
    if (![radius, angularStep, clearance].every(Number.isFinite) ||
        radius <= 0 || angularStep <= 0 || angularStep >= Math.PI ||
        clearance < 0) {
        throw new RangeError("Invalid radial chord clearance");
    }
    return radius / Math.cos(angularStep / 2) + clearance;
}

export function radialStripLayout({
    profile, count, angleOffset = 0, seamGap = 0,
    outerSamples, innerSamples, outerRadius, innerRadius
}: RadialStripLayoutOptions): BoardSection[][] {
    if (profile.length < 2 || !Number.isInteger(count) || count < 3 ||
        ![angleOffset, seamGap].every(Number.isFinite) || seamGap < 0 ||
        !validateSamples(outerSamples) || !validateSamples(innerSamples) ||
        typeof outerRadius !== "function" || typeof innerRadius !== "function" ||
        profile.some((point, i) =>
            !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
            point.x <= 0 ||
            (i > 0 && point.y <= profile[i - 1]!.y) ||
            seamGap >= 2 * Math.PI * point.x / count)) {
        throw new RangeError("Invalid radial strip layout");
    }

    const anglePerStrip = 2 * Math.PI / count;
    return Array.from({length: count}, (_, index) =>
        profile.map(({x: radius, y: height}) => {
            const halfGapAngle = seamGap / (2 * radius);
            const start = angleOffset + index * anglePerStrip + halfGapAngle;
            const span = anglePerStrip - 2 * halfGapAngle;
            const points = (
                samples: readonly number[],
                radiusAt: (r: number, y: number, u: number) => number
            ): THREE.Vector3[] => samples.map(fraction => {
                const sampled = radiusAt(radius, height, fraction);
                if (!Number.isFinite(sampled) || sampled <= 0) {
                    throw new RangeError("Invalid radial strip radius");
                }
                return radialPoint(sampled, height, start + fraction * span);
            });
            return {
                outer: points(outerSamples, outerRadius),
                inner: points(innerSamples, innerRadius)
            };
        })
    );
}
