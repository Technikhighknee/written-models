import * as THREE from "three";
import type {
    Profile2,
    SampledProfile2
} from "../definitions/geometry";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import {
    atContourStation,
    measureContour
} from "../topology/contourSampling";
import {
    contourWinding,
    mergeStations
} from "../topology/contours";
import { sampleProfile } from "./sampleProfile";
import type { ContourPartition } from "./partitionContour";

export interface SampledContourPartition {
    parts: readonly SampledProfile2[];
    interfaces: ContourPartition["interfaces"];
}

function invalid(message: string): never {
    throw new GeometryOperationError(
        "samplePartition", "invalid-input", message
    );
}

function equals(
    first: THREE.Vector2,
    second: THREE.Vector2,
    tolerance: number
): boolean {
    return first.distanceTo(second) <= tolerance;
}

function insertStations(
    outline: readonly THREE.Vector2[],
    original: readonly THREE.Vector2[],
    originalStations: readonly number[],
    sampled: readonly THREE.Vector2[],
    stations: readonly number[],
    tolerance: number
): THREE.Vector2[] {
    const matched = Array(original.length - 1).fill(0) as number[];
    const result: THREE.Vector2[] = [];

    for (let index = 0; index < outline.length; index++) {
        const a = outline[index]!;
        const b = outline[(index + 1) % outline.length]!;
        result.push(a.clone());

        for (let segment = 0; segment < original.length - 1; segment++) {
            const from = original[segment]!;
            const to = original[segment + 1]!;
            const forward = equals(a, from, tolerance) &&
                equals(b, to, tolerance);
            const backward = equals(a, to, tolerance) &&
                equals(b, from, tolerance);

            if (!forward && !backward) continue;

            matched[segment] = matched[segment]! + 1;

            const intermediates = sampled.filter((_, i) =>
                stations[i]! > originalStations[segment]! &&
                stations[i]! < originalStations[segment + 1]!
            );

            if (!forward) intermediates.reverse();
            result.push(...intermediates.map(p => p.clone()));
        }
    }

    if (matched.some(count => count !== 1)) {
        invalid("Each interface segment must belong to exactly one boundary edge");
    }

    return result;
}

/**
 * Promote partition parts to explicitly sampled profiles. Each interface
 * is refined once, then its exact points are inserted into both owning
 * contours before either profile can be extruded or filled.
 *
 * Requested stations are merged with the original authored cut corners.
 * Output winding is clockwise for the outer contour, matching the
 * shared sampled-extrusion contract. No source geometry is modified.
 */
export function samplePartition(
    partition: ContourPartition,
    extraStations: Readonly<Record<string, readonly number[]>> = {},
    precision?: GeometryPrecision
): SampledContourPartition {
    const policy = resolvePrecision(precision);

    if (!partition || !Array.isArray(partition.parts) ||
        !Array.isArray(partition.interfaces)) {
        invalid("Invalid partition");
    }

    const parts: THREE.Vector2[][] = partition.parts.map(part => {
        if (!part?.outer?.closed || part.holes?.length) {
            invalid("Partition sampling requires closed, hole-free parts");
        }

        return part.outer.points.map((point: THREE.Vector2Like) =>
            new THREE.Vector2(point.x, point.y)
        );
    });

    const seen = new Set<string>();
    const interfaces: ContourPartition["interfaces"][number][] = [];

    for (const seam of partition.interfaces) {
        if (
            !seam.cutId?.trim() ||
            seen.has(seam.cutId) ||
            !Number.isInteger(seam.firstPart) ||
            !Number.isInteger(seam.secondPart) ||
            seam.firstPart < 0 ||
            seam.secondPart < 0 ||
            seam.firstPart >= parts.length ||
            seam.secondPart >= parts.length ||
            seam.firstPart === seam.secondPart
        ) {
            invalid("Invalid paired interface ownership");
        }

        seen.add(seam.cutId);
        const original: THREE.Vector2[] = seam.points.map(
            (point: THREE.Vector2Like) =>
            new THREE.Vector2(point.x, point.y)
        );
        const measured = measureContour(
            original, false, "samplePartition", policy
        );
        const tolerance = lengthTolerance(policy, measured.length);

        if (
            seam.stations.length !== measured.stations.length ||
            seam.stations.some((value: number, i: number) =>
                Math.abs(value - measured.stations[i]!) >
                tolerance / measured.length
            )
        ) {
            invalid("Interface station sequence does not match its geometry");
        }

        const requested = extraStations[seam.cutId] ?? [0, 1];
        let stations: number[];

        try {
            stations = mergeStations([seam.stations, requested]);
        } catch {
            invalid("Invalid interface refinement stations");
        }

        const sampled = stations.map(station =>
            atContourStation(measured, station, "samplePartition", policy)
        );

        measureContour(sampled, false, "samplePartition", policy);

        for (const partIndex of [seam.firstPart, seam.secondPart]) {
            parts[partIndex] = insertStations(
                parts[partIndex]!,
                original,
                seam.stations,
                sampled,
                stations,
                tolerance
            );
        }

        interfaces.push({
            cutId: seam.cutId,
            firstPart: seam.firstPart,
            secondPart: seam.secondPart,
            points: sampled.map(point => point.clone()),
            stations: [...stations]
        });
    }

    for (const name of Object.keys(extraStations)) {
        if (!seen.has(name)) {
            invalid("Requested refinement refers to an unknown interface");
        }
    }

    const sampledParts = parts.map(points => {
        const clockwise = contourWinding(points) === "clockwise"
            ? points : [points[0]!, ...points.slice(1).reverse()];
        const measured = measureContour(
            clockwise, true, "samplePartition", policy
        );

        const profile: Profile2 = {
            outer: { points: clockwise, closed: true }
        };

        return sampleProfile(profile, {
            outer: measured.stations
        }, policy);
    });

    return { parts: sampledParts, interfaces };
}
