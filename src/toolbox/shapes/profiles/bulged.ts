import * as THREE from "three";

export type BulgeCurve = "quadratic" | "smoothstep";

export interface BulgedProfileOptions {
    height: number;
    bottomDiameter: number;
    topDiameter: number;
    peakDiameter: number;
    points?: number;
    curve?: BulgeCurve;
}

const ALLOWED_CURVES: readonly string[] = [
    "quadratic",
    "smoothstep",
]

export function bulgedProfile({
    height,
    bottomDiameter, 
    topDiameter,
    peakDiameter, 
    points = 7,
    curve = "quadratic"
}: BulgedProfileOptions): THREE.Vector2[] {
    if (!Number.isInteger(points) || points < 3) {
        throw new RangeError("At least 3 points required");
    }

    if (!ALLOWED_CURVES.includes(curve)) {
        throw new Error(
            `Option curve allows ${ALLOWED_CURVES.join(" or ")}, but was ${curve}`
        );
    }

    const profile: THREE.Vector2[] = [];

    for (let i = 0; i < points; i++) {
        const t = i / (points - 1);

        const lower = t <= 0.5;
        const from = lower ? bottomDiameter : peakDiameter;
        const to = lower ? peakDiameter : topDiameter;

        const progress = lower ? t * 2 : (t - 0.5) * 2;

        let factor: number;

        switch (curve) {
            case "smoothstep":
                factor = progress * progress * (3 - 2 * progress);
                break;
            
            case "quadratic":
                factor = lower ? 1 - (1 - progress) ** 2 : progress ** 2;
                break;
        }

        const diameter = from + (to - from) * factor;

        profile.push(
            new THREE.Vector2(diameter / 2, height * t)
        );
    }

    return profile;
}