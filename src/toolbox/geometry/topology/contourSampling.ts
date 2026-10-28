import * as THREE from "three";
import {
    GeometryOperationError
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    type GeometryPrecision
} from "../kernel/precision";

export interface MeasuredContour<T extends THREE.Vector2 | THREE.Vector3> {
    points: readonly T[];
    stations: readonly number[];
    length: number;
    closed: boolean;
}

function invalid(operation: string, message: string): never {
    throw new GeometryOperationError(operation, "invalid-input", message);
}

/**
 * Normalize the authored perimeter without removing or moving its corners.
 * The first point is the seam for a closed contour.
 */
export function measureContour<T extends THREE.Vector2 | THREE.Vector3>(
    points: readonly T[],
    closed: boolean,
    operation: string,
    precision: GeometryPrecision
): MeasuredContour<T> {
    if (points.length < (closed ? 3 : 2)) {
        invalid(operation, "Contour has too few vertices");
    }

    const positions = points.map(point => point.clone() as T);
    const origin = positions[0]!;

    if (positions.some(point =>
        !point.toArray().every(Number.isFinite)
    )) {
        invalid(operation, "Contour contains non-finite coordinates");
    }

    const extent = positions.reduce(
        (size, point) => Math.max(size, point.distanceTo(origin)),
        0
    );
    const tolerance = lengthTolerance(precision, extent);
    const distances = [0];
    const edges = closed ? positions.length : positions.length - 1;

    for (let i = 0; i < edges; i++) {
        const distance = positions[i]!.distanceTo(
            positions[(i + 1) % positions.length]!
        );

        if (!(distance > tolerance) || !Number.isFinite(distance)) {
            invalid(operation, "Contour contains a collapsed edge");
        }

        distances.push(distances.at(-1)! + distance);
    }

    const length = distances.at(-1)!;
    const stations = distances.slice(0, closed ? -1 : undefined)
        .map(distance => distance / length);

    return { points: positions, stations, length, closed };
}

/** Keep an authored corner's original coordinate whenever a station hits it. */
export function atContourStation<T extends THREE.Vector2 | THREE.Vector3>(
    contour: MeasuredContour<T>,
    station: number,
    operation: string,
    precision: GeometryPrecision
): T {
    if (!Number.isFinite(station) || station < 0 || station > 1) {
        invalid(operation, "Invalid contour station");
    }

    const points = contour.points;
    const stations = contour.stations;
    const epsilon = lengthTolerance(precision, contour.length) /
        contour.length;

    if (station >= 1 - epsilon) {
        return (contour.closed ? points[0]! : points.at(-1)!).clone() as T;
    }

    for (let i = 0; i < stations.length; i++) {
        if (Math.abs(station - stations[i]!) <= epsilon) {
            return points[i]!.clone() as T;
        }
    }

    for (let i = 0; i < stations.length; i++) {
        const from = stations[i]!;
        const to = stations[i + 1] ?? 1;

        if (station > from && station < to) {
            const first = points[i]!;
            const second = points[(i + 1) % points.length]!;
            const fraction = (station - from) / (to - from);

            if (first instanceof THREE.Vector3) {
                return first.clone().lerp(
                    second as THREE.Vector3, fraction
                ) as T;
            }

            return (first as THREE.Vector2).clone().lerp(
                second as THREE.Vector2, fraction
            ) as T;
        }
    }

    invalid(operation, "Station falls outside the contour");
}

/** True only when the requested station preserves that authored corner. */
export function hasCornerStation(
    station: number,
    stations: readonly number[],
    contourLength: number,
    precision: GeometryPrecision
): boolean {
    const tolerance = lengthTolerance(precision, contourLength) /
        contourLength;

    return stations.some(value =>
        Math.abs(value - station) <= tolerance
    );
}

/** Validate a cyclic parameter sequence, with no repeated final seam. */
export function validateContourStations(
    stations: readonly number[],
    closed: boolean,
    operation: string
): void {
    if (
        stations.length < (closed ? 3 : 2) ||
        stations[0] !== 0 ||
        (!closed && stations.at(-1) !== 1) ||
        stations.some((station, i) =>
            !Number.isFinite(station) ||
            station < 0 ||
            (closed ? station >= 1 : station > 1) ||
            (i > 0 && station <= stations[i - 1]!)
        )
    ) {
        invalid(operation, "Invalid ordered contour stations");
    }
}
