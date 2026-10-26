import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftSections } from "./loftSections";

export interface RadialStavesOptions {
    count: number;
    thickness: number;
    angleOffset?: number;
}

/**
 * Loft individual solid boards around a radial height/profile curve.
 *
 * The profile contains (outer radius, height) pairs in ascending height.
 * Each stave has its own outer/inner surfaces, side faces and end grain.
 * Neighboring staves meet at the same angular boundary without gaps.
 *
 * The outer faces are longitudinally bent by the profile, while each
 * cross-section is straight: a useful starting point for barrels,
 * buckets and other coopered forms.
 */
export function radialStaves(
    profile: readonly THREE.Vector2Like[],
    {
        count,
        thickness,
        angleOffset = 0
    }: RadialStavesOptions
): MeshData[] {
    if (
        !Number.isInteger(count) ||
        count < 3 ||
        !Number.isFinite(thickness) ||
        thickness <= 0 ||
        !Number.isFinite(angleOffset) ||
        profile.length < 2 ||
        profile.some((point, index) =>
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            point.x <= thickness ||
            (index > 0 && point.y <= profile[index - 1]!.y)
        )
    ) {
        throw new RangeError("Invalid radial stave dimensions or profile");
    }

    const step = (2 * Math.PI) / count;
    const staves: MeshData[] = [];

    function at(radius: number, height: number, angle: number): THREE.Vector3 {
        return new THREE.Vector3(
            radius * Math.sin(angle),
            height,
            radius * Math.cos(angle)
        );
    }

    for (let index = 0; index < count; index++) {
        const left = angleOffset + index * step;
        const right = left + step;

        // The section order is important: side-0 faces outward,
        // side-2 inward, while the remaining sides are stave seams.
        const sections = profile.map(({ x: radius, y: height }) => [
            at(radius, height, left),
            at(radius, height, right),
            at(radius - thickness, height, right),
            at(radius - thickness, height, left)
        ]);

        staves.push(loftSections(sections));
    }

    return staves;
}
