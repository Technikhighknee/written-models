export interface PositionsFromEndsOptions {
    start: number;
    end: number;
    fromStart?: readonly number[];
    fromEnd?: readonly number[];
}

export function positionsFromEnds({
    start,
    end,
    fromStart = [],
    fromEnd = []
}: PositionsFromEndsOptions): number[] {
    const length = end - start;

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        !Number.isFinite(length) ||
        length <= 0
    ) {
        throw new RangeError("Invalid interval");
    }

    const offsets = [...fromStart, ...fromEnd];

    if (offsets.some(offset =>
        !Number.isFinite(offset) ||
        offset < 0 ||
        offset > length
    )) {
        throw new RangeError("Offset outside interval");
    }

    return [
        ...fromStart.map(offset => start + offset),
        ...fromEnd.map(offset => end - offset)
    ].sort((a , b) => a - b);
}
