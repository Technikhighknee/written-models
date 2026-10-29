import type { MeshData } from "../mesh/MeshData";
import { loftRings } from "./loftRings";
import {
    sampleAxialSections, axialStationPoint,
    type AxialProfileStation, type ProfileAxis,
    type ProfileSmoothing, type RadialWave,
    type LoftAxialProfileOptions
} from "../build/sampleAxialSections";

export type {
    AxialProfileStation, ProfileAxis, ProfileSmoothing, RadialWave
} from "../build/sampleAxialSections";

export type { LoftAxialProfileOptions } from "../build/sampleAxialSections";

/** Compatibility constructor using the common axial section sampler. */
export function loftAxialProfile({
    axis, stations, outline, segments = 12, tipStart, tipEnd,
    surface = "side", sideSurfaces = {}, smoothing,
    radialWaves = []
}: LoftAxialProfileOptions): MeshData {
    const rings = sampleAxialSections({
        axis, stations, ...(outline === undefined ? {} : {outline}),
        segments, radialWaves
    }).map(section => section.outer.points);

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
            start: {point: axialStationPoint(axis, tipStart, stations[0]!)}
        }),
        ...(tipEnd === undefined ? {} : {
            end: {point: axialStationPoint(
                axis, tipEnd, stations[stations.length - 1]!
            )}
        }),
        surface: actualSurface,
        smoothingGroup
    });
}
