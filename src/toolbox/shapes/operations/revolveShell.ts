import * as THREE from "three";
import { latheMeridian } from "../../geometry/construction/latheMeridian";
import type { MeridianPoint } from "../../geometry/construction/latheMeridian";
import { toBufferGeometry } from "../../geometry/mesh/toBufferGeometry";

export interface RevolveShellOptions {
    thickness: number;
    radialSegments?: number;
    roundedRims?: boolean;
    rimSegments?: number;
}

/**
 * An open-ended surface of revolution with a real wall thickness.
 * The meridian travels up the outside, folds over the upper edge,
 * returns down the inside, and closes across the lower edge.
 *
 * This is a thin-wall convenience constructor: the shared latheMeridian()
 * now owns ALL rotational topology, poles, UVs and authored control faces.
 */
export function revolveShell(
    profile: readonly THREE.Vector2[],
    {
        thickness, radialSegments = 32,
        roundedRims = false, rimSegments = 8
    }: RevolveShellOptions
): THREE.BufferGeometry {
    if (!Number.isFinite(thickness) || thickness <= 0 ||
        !Number.isInteger(radialSegments) || radialSegments < 3 ||
        !Number.isInteger(rimSegments) || rimSegments < 2 ||
        profile.length < 2 ||
        profile.some((p, i) => ![p.x, p.y].every(Number.isFinite) ||
            p.x <= thickness ||
            (i > 0 && p.y <= profile[i - 1]!.y))) {
        throw new RangeError("Invalid shell profile");
    }

    const interior = [...profile].reverse().map(p =>
        new THREE.Vector2(p.x - thickness, p.y)
    );
    const contour = roundedRims
        ? [
            ...profile,
            ...roundedRim(profile.at(-1)!, thickness, true, rimSegments),
            ...interior.slice(1),
            ...roundedRim(profile[0]!, thickness, false, rimSegments)
        ]
        : [...profile, ...interior];

    // Unlike a filled disk or vessel floor, this entire closed meridian
    // stays away from the rotation axis. No cap fan is manufactured.
    const meridian: MeridianPoint[] = contour.map(point => ({
        radius: point.x,
        y: point.y,
        surface: "shell",
        smoothingGroup: "shell"
    }));
    return toBufferGeometry(
        latheMeridian(meridian, radialSegments, {closed: true}),
        {shell: 0}
    );
}

function roundedRim(
    point: THREE.Vector2,
    thickness: number, top: boolean, segments: number
): THREE.Vector2[] {
    const radius = thickness / 2;
    const center = point.x - radius;
    const startAngle = top ? 0 : Math.PI;
    return Array.from({length: segments}, (_, index) => {
        const angle = startAngle + (index + 1) * Math.PI / segments;
        return new THREE.Vector2(
            center + Math.cos(angle) * radius,
            point.y + Math.sin(angle) * radius
        );
    });
}
