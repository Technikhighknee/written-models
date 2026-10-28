import * as THREE from "three";
import type { BoardSection } from "./loftBoard";
import {
    samplePolarStripSections
} from "../build/samplePolarStripSections";

export { polarPoint as radialPoint } from "../build/samplePolarStripSections";

/**
 * Radius of a polygonal band whose chords clear a supporting circle.
 */
export function polygonalRadiusOutside(
    radius: number,
    angularStep: number,
    clearance = 0
): number {
    if (
        ![radius, angularStep, clearance].every(Number.isFinite) ||
        radius <= 0 || angularStep <= 0 || angularStep >= Math.PI ||
        clearance < 0
    ) {
        throw new RangeError("Invalid radial chord clearance");
    }

    return radius / Math.cos(angularStep / 2) + clearance;
}

export interface RadialStripLayoutOptions {
    profile: readonly THREE.Vector2Like[];
    count: number;
    angleOffset?: number;
    seamGap?: number;
    outerSamples: readonly number[];
    innerSamples: readonly number[];
    outerRadius: (radius: number, height: number, fraction: number) => number;
    innerRadius: (radius: number, height: number, fraction: number) => number;
}

/** Return the two separately sampled board rows used by existing models. */
export function radialStripLayout({
    profile,
    count,
    angleOffset = 0,
    seamGap = 0,
    outerSamples,
    innerSamples,
    outerRadius,
    innerRadius
}: RadialStripLayoutOptions): BoardSection[][] {
    const sections = samplePolarStripSections({
        meridian: profile,
        count,
        angleOffset,
        gap: seamGap,
        outerStations: outerSamples,
        innerStations: innerSamples,
        outerRadiusAt: outerRadius,
        innerRadiusAt: innerRadius
    });

    return sections.map(strip =>
        strip.map(section => {
            const points = section.outer.points;

            return {
                outer: points.slice(0, outerSamples.length),
                inner: points.slice(outerSamples.length).reverse()
            };
        })
    );
}
