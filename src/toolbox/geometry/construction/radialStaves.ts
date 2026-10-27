import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftBoard } from "./loftBoard";
import { radialStripLayout } from "./radialStripLayout";

export interface RadialStavesOptions {
    count: number;
    thickness: number;
    seamGap?: number;
    edgeRoundover?: number;
    angleOffset?: number;
    /** Independent normalized width stations for the hidden surface. */
    innerWidthSamples?: readonly number[];
}

/**
 * Curved wooden staves assembled on a shared radial partition.
 * Material and joinery design remain here; radial sampling belongs to
 * the general radialStripLayout so other materials can use it too.
 */
export function radialStaves(
    profile: readonly THREE.Vector2Like[],
    {
        count, thickness, seamGap = 0,
        edgeRoundover = 0, angleOffset = 0, innerWidthSamples
    }: RadialStavesOptions
): MeshData[] {
    if (![thickness, edgeRoundover].every(Number.isFinite) ||
        thickness <= 0 || edgeRoundover < 0 ||
        edgeRoundover >= thickness ||
        profile.some(point => point.x <= thickness)) {
        throw new RangeError("Invalid radial stave thickness");
    }

    const outerSamples = edgeRoundover > 0
        ? [0, 0.055, 0.5, 0.945, 1]
        : [0, 0.5, 1];
    const sections = radialStripLayout({
        profile, count, seamGap, angleOffset,
        outerSamples,
        innerSamples: innerWidthSamples ?? outerSamples,
        outerRadius: (radius, _height, fraction) => {
            const edgeDistance = Math.min(fraction, 1 - fraction);
            const blend = Math.min(1, edgeDistance / 0.055);
            return radius - edgeRoundover * (1 - blend);
        },
        innerRadius: radius => radius - thickness
    });
    return sections.map(piece => loftBoard(piece));
}
