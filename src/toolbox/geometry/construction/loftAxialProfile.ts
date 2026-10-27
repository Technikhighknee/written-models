import * as THREE from "three";
import { ellipticalRing } from "./ellipticalRing";
import { loftRings } from "./loftRings";
import type { MeshData } from "../mesh/MeshData";

export type ProfileAxis = "x" | "y" | "z";
export type ProfileSmoothing = "smooth" | "faceted";

/** Radii and offsets are measured in the two perpendicular section axes. */
export interface AxialProfileStation {
    at: number;
    radii: readonly [number, number];
    offset?: readonly [number, number];
    /** Changes the surface for this and subsequent intervals; null resets it. */
    surface?: string | null;
    /** Strength of the optional radial deviation at this station. */
    variation?: number;
}

export interface RadialWave {
    /** Whole-number waves around the closed contour. */
    lobes: number;
    /** Relative radius displacement (e.g. 0.01 = 1%). */
    amplitude: number;
    /** Phase rotation per metre along the sweep axis. */
    axialFrequency?: number;
    phase?: number;
}

export interface LoftAxialProfileOptions {
    axis: ProfileAxis;
    stations: readonly AxialProfileStation[];
    /** Normalized closed section. If absent, an ellipse is used. */
    outline?: readonly (readonly [number, number])[];
    segments?: number;
    /** Pointed termini on the sweep axis. Omit for flat ends. */
    tipStart?: number;
    tipEnd?: number;
    surface?: string;
    sideSurfaces?: Readonly<Record<number, string>>;
    /** One mode for all faces, or a mode for each named surface. */
    smoothing?: ProfileSmoothing | Readonly<Record<string, ProfileSmoothing>>;
    /** Authored, periodic contour deviations (scaled by station.variation). */
    radialWaves?: readonly RadialWave[];
}

/**
 * Loft scaled planar outlines or ellipses along a principal axis.
 *
 * Stations describe shape and changes of material regions; construction
 * vertices, quads, UVs, and cap triangles are produced by loftRings().
 * Surface overrides persist until replaced or reset with null. They take
 * precedence over sideSurfaces, which is useful for bevels/edge bands.
 *
 * For Y sections U points along Z and V along X; for X sections U points
 * along Y and V along Z. These handed frames retain the winding of the
 * original hand-authored lofts.
 */
export function loftAxialProfile({
    axis, stations, outline, segments = 12, tipStart, tipEnd,
    surface = "side", sideSurfaces = {}, smoothing,
    radialWaves = []
}: LoftAxialProfileOptions): MeshData {
    if (stations.length < 2 || !["x", "y", "z"].includes(axis) ||
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

    const axes = axis === "x"
        ? [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
        : axis === "y"
            ? [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)]
            : [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)];
    const [forward, uAxis, vAxis] = axes as [THREE.Vector3, THREE.Vector3, THREE.Vector3];

    const rings = stations.map((station, index) => {
        const [ru, rv] = station.radii;
        const [ou, ov] = station.offset ?? [0, 0];
        if (![station.at, ru, rv, ou, ov, station.variation ?? 0].every(Number.isFinite) ||
            ru <= 0 || rv <= 0 ||
            (index > 0 && station.at <= stations[index - 1]!.at)) {
            throw new RangeError("Invalid or unordered axial profile station");
        }

        const origin = forward.clone().multiplyScalar(station.at)
            .addScaledVector(uAxis, ou).addScaledVector(vAxis, ov);
        // Ellipses reuse the same primitive as other constructors. A custom
        // outline is a normalized shape, not a list of world-space vertices.
        const ring = outline === undefined
            ? ellipticalRing({center: origin, axisU: uAxis, axisV: vAxis,
                radiusU: ru, radiusV: rv, segments})
            : normalized.map(([u, v]) => origin.clone()
                .addScaledVector(uAxis, ru * u)
                .addScaledVector(vAxis, rv * v));

        if ((station.variation ?? 0) !== 0 && radialWaves.length > 0) {
            ring.forEach((point, corner) => {
                const [u, v] = normalized[corner]!;
                const angle = Math.atan2(v, u);
                const strength = 1 + station.variation! * radialWaves.reduce(
                    (sum, wave) => sum + wave.amplitude * Math.sin(
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
        return ring;
    });

    function pointAt(at: number, station: AxialProfileStation): THREE.Vector3 {
        if (!Number.isFinite(at)) throw new RangeError("Invalid profile tip");
        const [u, v] = station.offset ?? [0, 0];
        return forward.clone().multiplyScalar(at)
            .addScaledVector(uAxis, u).addScaledVector(vAxis, v);
    }

    const intervalSurfaces: string[] = [];
    let override: string | undefined;
    for (let i = 0; i < stations.length - 1; i++) {
        const changed = stations[i]!.surface;
        if (changed !== undefined) override = changed === null ? undefined : changed;
        intervalSurfaces.push(override ?? surface);
    }
    const actualSurface = (side: number, interval: number): string => {
        const primary = intervalSurfaces[interval]!;
        return primary !== surface ? primary : sideSurfaces[side] ?? primary;
    };
    const smoothingGroup = (side: number, interval: number): string | undefined => {
        const materialSurface = actualSurface(side, interval);
        const mode = typeof smoothing === "string"
            ? smoothing : smoothing?.[materialSurface];
        const group = typeof smoothing === "string" ? "shared" : materialSurface;
        if (mode === "smooth") return `axial-smooth-${group}`;
        if (mode === "faceted") return `axial-facet-${group}-${side}`;
        return undefined;
    };

    return loftRings({
        rings,
        ...(tipStart === undefined ? {} : {
            start: {point: pointAt(tipStart, stations[0]!)}
        }),
        ...(tipEnd === undefined ? {} : {
            end: {point: pointAt(tipEnd, stations[stations.length - 1]!)}
        }),
        surface: actualSurface,
        smoothingGroup
    });
}
