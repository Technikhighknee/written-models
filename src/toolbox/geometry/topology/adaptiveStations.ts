import { GeometryOperationError } from "../kernel/GeometryResult";

/** A 3D point sampled from a curve or a corresponding section vertex. */
export interface Position3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface AdaptiveStationsOptions {
    maxDeviation: number;
    maxDepth?: number;
    /** Mandatory stations in ascending order, strictly between 0 and 1. */
    knots?: readonly number[];
    /** Reject when maximum subdivision is insufficient. */
    requireAccuracy?: boolean;
}

export interface StationSamplingResult {
    readonly stations: readonly number[];
    /** Largest sampled chord deviation among final intervals, in meters. */
    readonly observedMaxDeviation: number;
    /** Final intervals that exceed tolerance after reaching maxDepth. */
    readonly saturated: readonly [from: number, to: number][];
}

function failure(
    reason: "invalid-input" | "sampling-limit",
    message: string
): never {
    throw new GeometryOperationError(
        "sampleAdaptiveStations",
        reason,
        message
    );
}

/**
 * Sample shared stations for matching strips, retaining all authored knots.
 * The reported error is measured at quarter, half and three-quarter probes;
 * it is not an analytic bound on arbitrary input functions.
 */
export function sampleAdaptiveStations(
    sample: (t: number) => readonly Position3[],
    {
        maxDeviation,
        maxDepth = 5,
        knots = [],
        requireAccuracy = false
    }: AdaptiveStationsOptions
): StationSamplingResult {
    if (
        !Number.isFinite(maxDeviation) || maxDeviation <= 0 ||
        !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 8 ||
        knots.some((t, i) =>
            !Number.isFinite(t) ||
            t <= 0 ||
            t >= 1 ||
            (i > 0 && t <= knots[i - 1]!)
        )
    ) {
        failure("invalid-input", "Invalid adaptive station options");
    }

    const first = sample(0);
    if (!Array.isArray(first) || first.length === 0) {
        failure("invalid-input", "Curve must return nonempty sections");
    }

    function check(points: readonly Position3[]): void {
        if (
            !Array.isArray(points) ||
            points.length !== first.length ||
            points.some(point =>
                !point ||
                ![point.x, point.y, point.z].every(Number.isFinite)
            )
        ) {
            failure("invalid-input", "Inconsistent or invalid curve sample");
        }
    }

    check(first);
    const last = sample(1);
    check(last);

    const stations = [0];
    const saturated: [number, number][] = [];
    let observedMaxDeviation = 0;

    function visit(
        from: number,
        to: number,
        start: readonly Position3[],
        end: readonly Position3[],
        depth: number
    ): void {
        const quarter = sample(from + (to - from) * 0.25);
        const middle = sample((from + to) * 0.5);
        const threeQuarter = sample(from + (to - from) * 0.75);

        check(quarter);
        check(middle);
        check(threeQuarter);

        let maximum = 0;

        for (let i = 0; i < start.length; i++) {
            const a = start[i]!;
            const b = end[i]!;

            for (const [fraction, point] of [
                [0.25, quarter[i]!],
                [0.5, middle[i]!],
                [0.75, threeQuarter[i]!]
            ] as const) {
                const dx = point.x - (a.x + (b.x - a.x) * fraction);
                const dy = point.y - (a.y + (b.y - a.y) * fraction);
                const dz = point.z - (a.z + (b.z - a.z) * fraction);

                maximum = Math.max(maximum, Math.hypot(dx, dy, dz));
            }
        }

        if (maximum <= maxDeviation || depth === maxDepth) {
            observedMaxDeviation = Math.max(observedMaxDeviation, maximum);

            if (maximum > maxDeviation) {
                saturated.push([from, to]);
            }

            stations.push(to);
            return;
        }

        const middleStation = from + (to - from) * 0.5;
        visit(from, middleStation, start, middle, depth + 1);
        visit(middleStation, to, middle, end, depth + 1);
    }

    const anchors = [0, ...knots, 1];

    for (let i = 0; i < anchors.length - 1; i++) {
        const from = anchors[i]!;
        const to = anchors[i + 1]!;
        const start = i === 0 ? first : sample(from);
        const end = i === anchors.length - 2 ? last : sample(to);

        check(start);
        check(end);
        visit(from, to, start, end, 0);
    }

    if (requireAccuracy && saturated.length > 0) {
        failure(
            "sampling-limit",
            `Cannot satisfy deviation ${maxDeviation}m at depth ${maxDepth}`
        );
    }

    return { stations, observedMaxDeviation, saturated };
}

/** Existing consumers retain their station-array API during migration. */
export function adaptiveStations(
    sample: (t: number) => readonly Position3[],
    options: AdaptiveStationsOptions
): number[] {
    return [...sampleAdaptiveStations(sample, options).stations];
}
