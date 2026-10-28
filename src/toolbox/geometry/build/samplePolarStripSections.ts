import * as THREE from "three";
import type { Section3 } from "../definitions/geometry";
import {
    GeometryOperationError
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

export interface PolarStripOptions {
    /** Radius/height pairs along a common rotation axis. */
    meridian: readonly THREE.Vector2Like[];
    count: number;
    angleOffset?: number;
    /** Physical separation at each station's reference radius, in metres. */
    gap?: number;
    /** Independent, increasing normalized width stations, including 0 and 1. */
    outerStations: readonly number[];
    innerStations: readonly number[];
    outerRadiusAt(radius: number, height: number, station: number): number;
    innerRadiusAt(radius: number, height: number, station: number): number;
    precision?: GeometryPrecision;
}

function fail(
    reason: "invalid-input" | "degenerate-geometry" | "self-intersection",
    message: string
): never {
    throw new GeometryOperationError(
        "samplePolarStripSections", reason, message
    );
}

function validateStations(stations: readonly number[]): void {
    if (
        stations.length < 2 ||
        stations[0] !== 0 ||
        stations.at(-1) !== 1 ||
        stations.some((t, index) =>
            !Number.isFinite(t) ||
            t < 0 || t > 1 ||
            (index > 0 && t <= stations[index - 1]!)
        )
    ) {
        fail("invalid-input", "Polar strip stations must increase from 0 to 1");
    }
}

/** Same Y-axis convention as the authored radial constructions. */
export function polarPoint(
    radius: number,
    height: number,
    angle: number
): THREE.Vector3 {
    return new THREE.Vector3(
        radius * Math.sin(angle),
        height,
        radius * Math.cos(angle)
    );
}

function intersects(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    tolerance: number
): boolean {
    const orient = (
        p: THREE.Vector3,
        q: THREE.Vector3,
        r: THREE.Vector3
    ): number => (q.x - p.x) * (r.z - p.z) -
        (q.z - p.z) * (r.x - p.x);

    const ab = Math.hypot(b.x - a.x, b.z - a.z);
    const cd = Math.hypot(d.x - c.x, d.z - c.z);
    const threshold = tolerance * Math.max(ab, cd);
    const s1 = orient(a, b, c);
    const s2 = orient(a, b, d);
    const s3 = orient(c, d, a);
    const s4 = orient(c, d, b);

    return (
        (s1 > threshold && s2 < -threshold ||
            s1 < -threshold && s2 > threshold) &&
        (s3 > threshold && s4 < -threshold ||
            s3 < -threshold && s4 > threshold)
    );
}

function validateSection(
    points: readonly THREE.Vector3[],
    tolerance: number
): void {
    const count = points.length;

    for (let i = 0; i < count; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % count]!;

        if (!(a.distanceTo(b) > tolerance)) {
            fail("degenerate-geometry", "Polar strip contour has a collapsed edge");
        }

        for (let j = i + 2; j < count; j++) {
            if (i === 0 && j === count - 1) continue;

            const c = points[j]!;
            const d = points[(j + 1) % count]!;

            if (intersects(a, b, c, d, tolerance)) {
                fail("self-intersection", "Polar strip contour crosses itself");
            }
        }
    }
}

/**
 * Sample a circular partition into individual, positioned Section3 loops.
 * The visible outer arc and hidden inner arc may have entirely different
 * station densities. They form one closed contour per longitudinal row;
 * neither surface receives invented subdivisions.
 *
 * All strips use the same base angular partition. Gaps are applied about
 * the reference meridian at each height, not to the adjusted radii.
 */
export function samplePolarStripSections({
    meridian,
    count,
    angleOffset = 0,
    gap = 0,
    outerStations,
    innerStations,
    outerRadiusAt,
    innerRadiusAt,
    precision
}: PolarStripOptions): Section3[][] {
    const policy = resolvePrecision(precision);
    validateStations(outerStations);
    validateStations(innerStations);

    if (
        meridian.length < 2 ||
        !Number.isInteger(count) ||
        count < 3 ||
        ![angleOffset, gap].every(Number.isFinite) ||
        gap < 0 ||
        typeof outerRadiusAt !== "function" ||
        typeof innerRadiusAt !== "function" ||
        meridian.some((point, index) =>
            !point ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            point.x <= policy.absoluteLength ||
            (index > 0 && point.y <= meridian[index - 1]!.y)
        )
    ) {
        fail("invalid-input", "Invalid polar strip layout");
    }

    const span = 2 * Math.PI / count;
    const shared = [...new Set([
        ...outerStations, ...innerStations
    ])].sort((a, b) => a - b);
    const probes = [...shared, ...shared.slice(1).map(
        (station, index) => (station + shared[index]!) / 2
    )];

    return Array.from({ length: count }, (_, strip) =>
        meridian.map(({ x: radius, y: height }) => {
            const halfGap = gap / (2 * radius);
            const width = span - 2 * halfGap;
            const tolerance = lengthTolerance(policy, radius);

            if (!(width > 0) ||
                width * radius <= tolerance) {
                fail("degenerate-geometry", "Polar strip gap closes its angular interval");
            }

            function evaluate(
                fn: PolarStripOptions["outerRadiusAt"],
                station: number
            ): number {
                const value = fn(radius, height, station);

                if (!Number.isFinite(value) || value <= tolerance) {
                    fail("degenerate-geometry", "Polar strip radius collapsed");
                }

                return value;
            }

            // Validate actual wall separation at both sets of authored
            // stations and between them without inserting any vertices.
            for (const station of probes) {
                if (
                    evaluate(outerRadiusAt, station) -
                    evaluate(innerRadiusAt, station) <= tolerance
                ) {
                    fail("degenerate-geometry", "Polar strip wall thickness collapsed");
                }
            }

            const start = angleOffset + strip * span + halfGap;
            const point = (
                fn: PolarStripOptions["outerRadiusAt"],
                station: number
            ): THREE.Vector3 => polarPoint(
                evaluate(fn, station),
                height,
                start + station * width
            );

            const outer = outerStations.map(station =>
                point(outerRadiusAt, station)
            );
            const inner = innerStations.map(station =>
                point(innerRadiusAt, station)
            );
            const loop = [...outer, ...inner.slice().reverse()];

            validateSection(loop, tolerance);

            return {
                outer: { points: loop, closed: true }
            };
        })
    );
}
