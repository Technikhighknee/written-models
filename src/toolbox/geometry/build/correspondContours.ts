import * as THREE from "three";
import type {
    Contour3,
    ContourCorrespondence
} from "../definitions/geometry";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import {
    atContourStation,
    measureContour,
    validateContourStations
} from "../topology/contourSampling";

type Landmark = ContourCorrespondence["landmarks"][number];

function invalid(message: string): never {
    throw new GeometryOperationError(
        "correspondContours", "invalid-input", message
    );
}

function rotated<T>(values: readonly T[], seam: number): T[] {
    return [...values.slice(seam), ...values.slice(0, seam)];
}

/**
 * Match two authored contours using named feature anchors.
 *
 * Each landmark-to-landmark arc is independently measured by length.
 * The union of its authored corner fractions supplies shared stations,
 * preserving every original vertex while interpolating only where needed.
 * Landmarks must already describe the same traversal direction.
 */
export function correspondContours(
    first: Contour3,
    second: Contour3,
    landmarks: ContourCorrespondence["landmarks"],
    precision?: GeometryPrecision
): ContourCorrespondence {
    const policy = resolvePrecision(precision);

    if (
        !first || !second ||
        first.closed !== second.closed ||
        !Array.isArray(landmarks) ||
        landmarks.length < (first.closed ? 1 : 2)
    ) {
        invalid("Matching contours require compatible closure and landmarks");
    }

    const closed = first.closed;
    const firstPoints = first.points.map(point =>
        new THREE.Vector3(point.x, point.y, point.z)
    );
    const secondPoints = second.points.map(point =>
        new THREE.Vector3(point.x, point.y, point.z)
    );

    if (
        landmarks.some(mark =>
            !mark.id?.trim() ||
            !Number.isInteger(mark.first) ||
            !Number.isInteger(mark.second) ||
            mark.first < 0 || mark.first >= firstPoints.length ||
            mark.second < 0 || mark.second >= secondPoints.length
        ) ||
        new Set(landmarks.map(mark => mark.id)).size !== landmarks.length ||
        new Set(landmarks.map(mark => mark.first)).size !== landmarks.length ||
        new Set(landmarks.map(mark => mark.second)).size !== landmarks.length
    ) {
        invalid("Invalid or duplicate landmark references");
    }

    const firstSeam = closed ? landmarks[0]!.first : 0;
    const secondSeam = closed ? landmarks[0]!.second : 0;

    const firstArc = measureContour(
        rotated(firstPoints, firstSeam), closed, "correspondContours", policy
    );
    const secondArc = measureContour(
        rotated(secondPoints, secondSeam), closed, "correspondContours", policy
    );

    function mappedIndex(index: number, seam: number, size: number): number {
        return closed ? (index - seam + size) % size : index;
    }

    const aligned = landmarks.map(mark => ({
        id: mark.id,
        first: mappedIndex(mark.first, firstSeam, firstPoints.length),
        second: mappedIndex(mark.second, secondSeam, secondPoints.length)
    })).sort((a, b) => a.first - b.first);

    if (
        (!closed && (
            aligned[0]!.first !== 0 ||
            aligned[0]!.second !== 0 ||
            aligned.at(-1)!.first !== firstPoints.length - 1 ||
            aligned.at(-1)!.second !== secondPoints.length - 1
        )) ||
        aligned.some((mark, index) =>
            index > 0 && mark.second <= aligned[index - 1]!.second
        )
    ) {
        invalid("Landmarks must follow the same contour traversal order");
    }

    // One interval for each pair of anchors, including the periodic seam.
    const intervals = closed ? aligned.length : aligned.length - 1;
    const stations: number[] = [];
    const matchedFirst: THREE.Vector3[] = [];
    const matchedSecond: THREE.Vector3[] = [];
    const resolvedLandmarks: Landmark[] = [];

    for (let i = 0; i < intervals; i++) {
        const start = aligned[i]!;
        const end = aligned[(i + 1) % aligned.length]!;
        const last = closed && i === intervals - 1;
        const firstStart = firstArc.stations[start.first]!;
        const secondStart = secondArc.stations[start.second]!;
        const firstEnd = last ? 1 : firstArc.stations[end.first]!;
        const secondEnd = last ? 1 : secondArc.stations[end.second]!;

        const firstSpan = firstEnd - firstStart;
        const secondSpan = secondEnd - secondStart;

        if (!(firstSpan > 0) || !(secondSpan > 0)) {
            invalid("Collapsed landmark interval");
        }

        const fractions = [0, 1];

        for (const station of firstArc.stations) {
            if (station > firstStart && station < firstEnd) {
                fractions.push((station - firstStart) / firstSpan);
            }
        }
        for (const station of secondArc.stations) {
            if (station > secondStart && station < secondEnd) {
                fractions.push((station - secondStart) / secondSpan);
            }
        }

        fractions.sort((a, b) => a - b);
        const firstTolerance = lengthTolerance(policy, firstArc.length) /
            firstArc.length;
        const secondTolerance = lengthTolerance(policy, secondArc.length) /
            secondArc.length;
        const fractionTolerance = Math.min(
            firstTolerance / firstSpan, secondTolerance / secondSpan
        );
        const unique: number[] = [];

        for (const fraction of fractions) {
            const previous = unique.at(-1);
            if (
                previous !== undefined &&
                fraction - previous <= fractionTolerance
            ) {
                continue;
            }
            unique.push(fraction);
        }

        resolvedLandmarks.push({
            id: start.id,
            first: stations.length,
            second: stations.length
        });

        for (const fraction of unique) {
            if (fraction === 1) continue;

            const onFirst = firstStart + fraction * firstSpan;
            const onSecond = secondStart + fraction * secondSpan;

            stations.push(onFirst);
            matchedFirst.push(atContourStation(
                firstArc, onFirst, "correspondContours", policy
            ));
            matchedSecond.push(atContourStation(
                secondArc, onSecond, "correspondContours", policy
            ));
        }
    }

    if (!closed) {
        stations.push(1);
        matchedFirst.push(firstArc.points.at(-1)!.clone());
        matchedSecond.push(secondArc.points.at(-1)!.clone());

        const end = aligned.at(-1)!;
        resolvedLandmarks.push({
            id: end.id,
            first: stations.length - 1,
            second: stations.length - 1
        });
    }

    validateContourStations(stations, closed, "correspondContours");
    measureContour(matchedFirst, closed, "correspondContours", policy);
    measureContour(matchedSecond, closed, "correspondContours", policy);

    // A corner is not preserved merely because its parameter is close.
    // Its original 3D coordinates must survive the shared resampling.
    if (
        firstPoints.some(vertex =>
            !matchedFirst.some(sample => sample.equals(vertex))
        ) ||
        secondPoints.some(vertex =>
            !matchedSecond.some(sample => sample.equals(vertex))
        )
    ) {
        invalid("Landmark station union lost an authored contour corner");
    }

    return {
        stations,
        first: { points: matchedFirst, closed },
        second: { points: matchedSecond, closed },
        landmarks: resolvedLandmarks
    };
}
