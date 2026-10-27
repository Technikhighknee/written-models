/**
 * A reusable *geometric* recessed joint profile at either edge of a strip.
 * Nothing here depends on wood, grain, paint or material IDs. The caller
 * decides which surface(s) receive the geometry and which receive a tint.
 */
export interface EdgeRecessOptions {
    start: number;
    end: number;
    shoulder: number;
    depth: number;
    floor?: number;
    atStart: boolean;
    atEnd: boolean;
}

function validate(o: EdgeRecessOptions): void {
    if (![o.start, o.end, o.shoulder, o.depth, o.floor ?? 0]
        .every(Number.isFinite) ||
        o.start >= o.end || o.shoulder <= 0 || o.depth < 0 ||
        (o.floor ?? 0) < 0 || (o.floor ?? 0) >= o.shoulder ||
        2 * o.shoulder >= o.end - o.start) {
        throw new RangeError("Invalid recessed edge profile");
    }
}

/** Exact support stations for the two sloping shoulders and recess floors. */
export function edgeRecessStations(options: EdgeRecessOptions): number[] {
    validate(options);
    const {start, end, shoulder, floor = 0, atStart, atEnd} = options;
    return [
        ...(atStart ? [
            ...(floor > 0 ? [start + floor] : []),
            start + shoulder
        ] : []),
        ...(atEnd ? [
            end - shoulder,
            ...(floor > 0 ? [end - floor] : [])
        ] : [])
    ];
}

/** Inward displacement at an arbitrary coordinate across the strip. */
export function edgeRecessDepth(
    coordinate: number, options: EdgeRecessOptions
): number {
    validate(options);
    if (!Number.isFinite(coordinate)) {
        throw new RangeError("Invalid recess sample position");
    }
    const {start, end, shoulder, depth, floor = 0, atStart, atEnd} = options;
    const ramp = shoulder - floor;
    const left = atStart ? (start + shoulder - coordinate) / ramp : 0;
    const right = atEnd ? (coordinate - (end - shoulder)) / ramp : 0;
    return depth * Math.max(0, Math.min(1, Math.max(left, right)));
}
