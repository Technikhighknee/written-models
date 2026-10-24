import * as THREE from "three";

export interface BandAroundProfileOptions {
    y: number;
    width: number;
    thickness: number;
    overlap?: number;
    radialSegments?: number;
}

export function bandAroundProfile(
    profile: readonly THREE.Vector2[],
    {
        y,
        width,
        thickness,
        overlap = 0,
        radialSegments = 32
    }: BandAroundProfileOptions
): THREE.LatheGeometry {
    const bottom = y - width / 2;
    const top = y + width / 2;

    if (
        profile.length < 2 ||
        width <= 0 ||
        thickness <= 0 ||
        overlap < 0 ||
        overlap >= thickness ||
        bottom < profile[0]!.y ||
        top > profile.at(-1)!.y
    ) {
        throw new RangeError("Invalid band dimensions");
    }

    const heights = [
        bottom,
        ...profile
            .filter(p => p.y > bottom && p.y < top)
            .map(p => p.y),
        top
    ];

    const outer = heights.map(h => {
        const radius = radiusAtHeight(profile, h);

        return new THREE.Vector2(
            radius + thickness - overlap,
            h
        );
    });

    const inner = [...heights].reverse().map(h => {
        const radius = radiusAtHeight(profile, h);

        return new THREE.Vector2(
            radius - overlap,
            h
        );
    });

    const outline = [
        ...outer,
        ...inner,
        outer[0]!.clone()
    ];

    return new THREE.LatheGeometry(
        outline,
        radialSegments
    );
}

function radiusAtHeight(
    profile: readonly THREE.Vector2[],
    height: number
): number {
    for (let i = 1; i < profile.length; i++) {
        const a = profile[i - 1]!;
        const b = profile[i]!;

        if (height <= b.y) {
            const t = (height - a.y) / (b.y - a.y);

            return THREE.MathUtils.lerp(a.x, b.x, t);
        }
    }

    throw new RangeError("Height outside profile");
}
