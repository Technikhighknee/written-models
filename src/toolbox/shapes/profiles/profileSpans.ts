export type ProfileRadii = readonly [number, number];
export type ProfileOffset = readonly [number, number];

export interface ProfileStation {
    at: number;
    radii: ProfileRadii;
    offset?: ProfileOffset;
    surface?: string | null;
    variation?: number;
}

export interface ProfileSpan {
    /** Distance along the sweep axis, starting at the previous endpoint. */
    length: number;
    /** Section radii at the far end of this span. */
    to: ProfileRadii;
    /** Transverse displacement at the far end. */
    offset?: ProfileOffset;
    /** Baseline radial interpolation between the ends. */
    easing?: "linear" | "smooth" | "out";
    /** A smooth radial rise/fall, zero at both ends of the span. */
    bulge?: { radii: ProfileRadii; peak?: number };
    /** Radial deviation strength, tapered to zero at each fitted seam. */
    variation?: number;
    /** Longitudinal subdivisions: affect real quad topology. */
    samples?: number;
    /** Material region beginning with this span. */
    surface?: string;
}

export interface ProfileSpansOptions {
    start: { at: number; radii: ProfileRadii; offset?: ProfileOffset };
    spans: readonly ProfileSpan[];
}

/**
 * Compose a continuous axial profile from a few measurable, reusable form
 * operations. Endpoints are shared, not duplicated. Smooth bulges are useful
 * for knobs, tool handles, furniture spindles, ferrules and sculpted shafts.
 *
 * Geometry stays deliberate: samples controls the authored quad loops;
 * material changes happen exactly at the boundary between two spans.
 */
export function profileSpans({ start, spans }: ProfileSpansOptions): ProfileStation[] {
    const finite = (...values: number[]) => values.every(Number.isFinite);
    if (!finite(start.at, ...start.radii, ...(start.offset ?? [0, 0])) ||
        start.radii.some(value => value <= 0) || !spans.length) {
        throw new RangeError("Invalid profile start");
    }

    const stations: ProfileStation[] = [{
        at: start.at,
        radii: [...start.radii],
        ...(start.offset === undefined ? {} : { offset: [...start.offset] }),
        ...(spans[0]!.surface === undefined ? {} : { surface: spans[0]!.surface })
    }];

    let from = start;
    for (let index = 0; index < spans.length; index++) {
        const span = spans[index]!;
        const steps = span.samples ?? 4;
        const fromOffset = from.offset ?? [0, 0];
        const toOffset = span.offset ?? fromOffset;
        const rise = span.bulge?.radii ?? [0, 0];
        const peak = span.bulge?.peak ?? 0.5;
        if (!finite(span.length, ...span.to, ...toOffset, ...rise,
                peak, span.variation ?? 0) ||
            span.length <= 0 || span.to.some(value => value <= 0) ||
            !Number.isInteger(steps) || steps < 1 || steps > 64 ||
            peak <= 0 || peak >= 1) {
            throw new RangeError("Invalid profile span");
        }

        for (let step = 1; step <= steps; step++) {
            const t = step / steps;
            const eased = span.easing === "smooth"
                ? t * t * (3 - 2 * t)
                : span.easing === "out" ? t * (2 - t) : t;
            // Two half-sine-squared curves provide a rounded peak at any
            // authored location, with zero rise and zero slope at the ends.
            const side = t <= peak ? t / peak : (1 - t) / (1 - peak);
            const bump = Math.sin(side * Math.PI / 2) ** 2;
            const radii = from.radii.map((initial, dimension) =>
                initial + (span.to[dimension]! - initial) * eased +
                rise[dimension]! * bump
            ) as [number, number];
            if (radii.some(value => !(value > 0))) {
                throw new RangeError("Profile bulge collapsed a cross-section");
            }
            const offset = fromOffset.map((initial, dimension) =>
                initial + (toOffset[dimension]! - initial) * eased
            ) as [number, number];
            const nextSurface = step === steps ? spans[index + 1]?.surface : undefined;
            const station: ProfileStation = {
                at: from.at + span.length * t,
                radii,
                offset,
                variation: (span.variation ?? 0) * Math.sin(Math.PI * t) ** 2,
                ...(nextSurface === undefined ? {} : { surface: nextSurface })
            };
            stations.push(station);
        }
        from = {
            at: from.at + span.length,
            radii: span.to,
            offset: toOffset
        };
    }

    return stations;
}
