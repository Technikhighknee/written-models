import * as THREE from "three";
import {
    loftSectionWalls
} from "./loftSectionWalls";
import { capBoundary, tipBoundary } from "./finishBoundaries";
import {
    sampleAxialSections,
    axialStationPoint
} from "./sampleAxialSections";
import type { LoftAxialProfileOptions } from "../construction/loftAxialProfile";
import type { GeometryResult } from "../kernel/GeometryResult";
import type { Section3 } from "../definitions/geometry";

function sectionFrame(section: Section3): THREE.Matrix4 {
    const points = section.outer.points;
    const a = points[0]!;
    const x = new THREE.Vector3().copy(points[1]!).sub(a).normalize();
    const z = new THREE.Vector3().copy(points[1]!).sub(a)
        .cross(new THREE.Vector3().copy(points[2]!).sub(a)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const center = points.reduce((sum, point) =>
        sum.add(new THREE.Vector3().copy(point)), new THREE.Vector3()
    ).multiplyScalar(1 / points.length);

    return new THREE.Matrix4().makeBasis(x, y, z).setPosition(center);
}

/**
 * Assemble a profiled solid using the general section loft and owned
 * boundary-finishing operations. Axial stations control only the form;
 * the same topology, regions and cap tools serve other geometries.
 */
export function axialProfileSolid({
    axis, stations, outline, segments = 12, tipStart, tipEnd,
    surface = "side", sideSurfaces = {}, smoothing,
    radialWaves = []
}: LoftAxialProfileOptions): GeometryResult {
    const sections = sampleAxialSections({
        axis, stations, ...(outline === undefined ? {} : {outline}),
        segments, radialWaves
    });

    const intervals: string[] = [];
    let override: string | undefined;

    for (let i = 0; i < stations.length - 1; i++) {
        const changed = stations[i]!.surface;
        if (changed !== undefined) {
            override = changed === null ? undefined : changed;
        }
        intervals.push(override ?? surface);
    }

    const actualSurface = (side: number, interval: number): string => {
        const primary = intervals[interval]!;
        return primary !== surface ? primary :
            sideSurfaces[side] ?? primary;
    };

    const smoothingGroup = (side: number, interval: number):
        string | undefined => {
        const region = actualSurface(side, interval);
        const mode = typeof smoothing === "string"
            ? smoothing : smoothing?.[region];
        const group = typeof smoothing === "string" ? "shared" : region;
        if (mode === "smooth") return `axial-smooth-${group}`;
        if (mode === "faceted") return `axial-facet-${group}-${side}`;
        return undefined;
    };

    let result = loftSectionWalls(sections, {
        uvMode: "perimeter",
        surfaceAt: ({edge, interval}) => actualSurface(edge, interval),
        smoothingGroupAt: ({edge, interval}) => smoothingGroup(edge, interval)
    });

    for (const [name, section, tip, station] of [
        ["start", sections[0]!, tipStart, stations[0]!],
        ["end", sections.at(-1)!, tipEnd, stations.at(-1)!]
    ] as const) {
        const rim = result.boundaries[`${name}-outer`]![0]!;
        const frame = sectionFrame(section);
        const region = `cap-${name}`;

        result = tip === undefined
            ? capBoundary(result, rim, {
                region, uvFrame: frame, tessellation: "triangulate"
            })
            : tipBoundary(
                result, rim, axialStationPoint(axis, tip, station),
                {region, uvFrame: frame}
            );
    }

    return result;
}
