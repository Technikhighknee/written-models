import * as THREE from "three";
import type { Section3 } from "../definitions/geometry";
import { ellipticalRing } from "./ellipticalRing";

export type ProfileAxis = "x" | "y" | "z";
export type ProfileSmoothing = "smooth" | "faceted";

export interface AxialProfileStation {
    at: number;
    radii: readonly [number, number];
    offset?: readonly [number, number];
    surface?: string | null;
    variation?: number;
}

export interface RadialWave {
    lobes: number;
    amplitude: number;
    axialFrequency?: number;
    phase?: number;
}

export interface AxialSectionOptions {
    axis: ProfileAxis;
    stations: readonly AxialProfileStation[];
    outline?: readonly (readonly [number, number])[];
    segments?: number;
    radialWaves?: readonly RadialWave[];
}

/** Face, cap and smoothing options for an authored axial profile solid. */
export interface LoftAxialProfileOptions extends AxialSectionOptions {
    tipStart?: number;
    tipEnd?: number;
    surface?: string;
    sideSurfaces?: Readonly<Record<number, string>>;
    smoothing?: ProfileSmoothing | Readonly<Record<string, ProfileSmoothing>>;
}

function axesFor(axis: ProfileAxis): readonly [
    THREE.Vector3, THREE.Vector3, THREE.Vector3
] {
    switch (axis) {
        case "x": return [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 1)
        ];
        case "y": return [
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(1, 0, 0)
        ];
        case "z": return [
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 1, 0)
        ];
        default: throw new RangeError("Invalid axial section axis");
    }
}

export function axialStationPoint(
    axis: ProfileAxis,
    at: number,
    station: AxialProfileStation
): THREE.Vector3 {
    if (!Number.isFinite(at)) {
        throw new RangeError("Invalid profile tip");
    }
    const [forward, uAxis, vAxis] = axesFor(axis);
    const [u, v] = station.offset ?? [0, 0];
    return forward.multiplyScalar(at)
        .addScaledVector(uAxis, u).addScaledVector(vAxis, v);
}

/**
 * Sample named axial stations into aligned, closed sections.
 * No mesh faces, material assignment, caps or render vertices are created.
 */
export function sampleAxialSections({
    axis, stations, outline, segments = 12, radialWaves = []
}: AxialSectionOptions): Section3[] {
    if (stations.length < 2 ||
        (outline === undefined && (!Number.isInteger(segments) || segments < 3)) ||
        (outline !== undefined && outline.length < 3)) {
        throw new RangeError("Invalid axial profile dimensions");
    }

    const normalized = outline ?? Array.from({ length: segments }, (_, i) => {
        const a = 2 * Math.PI * i / segments;
        return [Math.cos(a), Math.sin(a)] as const;
    });
    if (normalized.some(p => p.length !== 2 || !p.every(Number.isFinite))) {
        throw new RangeError("Invalid axial profile outline");
    }
    for (const wave of radialWaves) {
        if (!Number.isInteger(wave.lobes) || wave.lobes < 1 ||
            !Number.isFinite(wave.amplitude) ||
            !Number.isFinite(wave.axialFrequency ?? 0) ||
            !Number.isFinite(wave.phase ?? 0)) {
            throw new RangeError("Invalid radial wave");
        }
    }

    const [forward, uAxis, vAxis] = axesFor(axis);

    return stations.map((station, index) => {
        const [ru, rv] = station.radii;
        const [ou, ov] = station.offset ?? [0, 0];

        if (![station.at, ru, rv, ou, ov, station.variation ?? 0]
            .every(Number.isFinite) || ru <= 0 || rv <= 0 ||
            (index > 0 && station.at <= stations[index - 1]!.at)) {
            throw new RangeError("Invalid or unordered axial profile station");
        }

        const origin = forward.clone().multiplyScalar(station.at)
            .addScaledVector(uAxis, ou).addScaledVector(vAxis, ov);
        const points = outline === undefined
            ? ellipticalRing({
                center: origin, axisU: uAxis, axisV: vAxis,
                radiusU: ru, radiusV: rv, segments
            })
            : normalized.map(([u, v]) => origin.clone()
                .addScaledVector(uAxis, ru * u)
                .addScaledVector(vAxis, rv * v));

        if ((station.variation ?? 0) !== 0 && radialWaves.length) {
            points.forEach((point, corner) => {
                const [u, v] = normalized[corner]!;
                const angle = Math.atan2(v, u);
                const strength = 1 + station.variation! *
                    radialWaves.reduce((sum, wave) =>
                        sum + wave.amplitude * Math.sin(
                            wave.lobes * angle +
                            (wave.axialFrequency ?? 0) * station.at +
                            (wave.phase ?? 0)
                        ), 0
                    );
                if (!(strength > 0)) {
                    throw new RangeError("Radial variation collapsed an outline");
                }
                point.sub(origin).multiplyScalar(strength).add(origin);
            });
        }

        return { outer: { points, closed: true } };
    });
}
