export type TriangleIndices = [number, number, number];

export interface StitchStationsOptions {
    firstStations: readonly number[];
    secondStations: readonly number[];
    reverse?: boolean;
    /** Periodic loops reuse their first vertex at station 1. */
    closed?: boolean;
}

function stationsFor(
    points: readonly number[],
    supplied: readonly number[] | undefined,
    closed: boolean
): readonly number[] {
    if (
        points.length < (closed ? 3 : 2) ||
        points.some(index => !Number.isInteger(index) || index < 0)
    ) {
        throw new RangeError("Stitch needs ordered vertex indices");
    }

    if (supplied === undefined) {
        const divisor = closed ? points.length : points.length - 1;

        return points.map((_, index) => index / divisor);
    }

    if (
        supplied.length !== points.length ||
        supplied[0] !== 0 ||
        (!closed && supplied.at(-1) !== 1) ||
        supplied.some((station, index) =>
            !Number.isFinite(station) ||
            station < 0 || station > (closed ? 1 - Number.EPSILON : 1) ||
            (index > 0 && station <= supplied[index - 1]!)
        )
    ) {
        throw new RangeError("Invalid stitch stations");
    }

    return supplied;
}

/**
 * Connect ordered, disjoint open boundaries without adding vertices.
 * Shared stations control which side advances; no implicit equal-index
 * spacing is assumed when authored sampling positions are supplied.
 */
export function stitchPolylines(
    first: readonly number[],
    second: readonly number[],
    options: boolean | StitchStationsOptions = false
): TriangleIndices[] {
    if (new Set([...first, ...second]).size !== first.length + second.length) {
        throw new RangeError("Stitch needs disjoint boundary vertex IDs");
    }

    const explicit = typeof options === "boolean" ? undefined : options;
    const closed = explicit?.closed ?? false;
    const firstStations = stationsFor(first, explicit?.firstStations, closed);
    const secondStations = stationsFor(second, explicit?.secondStations, closed);
    const reverse = typeof options === "boolean"
        ? options : (options.reverse ?? false);

    // In a periodic bridge the seam closes using existing IDs, not
    // duplicate construction vertices.
    const from = closed ? [...first, first[0]!] : first;
    const to = closed ? [...second, second[0]!] : second;
    const fromStations = closed ? [...firstStations, 1] : firstStations;
    const toStations = closed ? [...secondStations, 1] : secondStations;

    const triangles: TriangleIndices[] = [];
    let a = 0;
    let b = 0;

    while (a < from.length - 1 || b < to.length - 1) {
        const advanceA = a < from.length - 1 &&
            (b === to.length - 1 ||
                fromStations[a + 1]! < toStations[b + 1]!);

        const face: TriangleIndices = advanceA
            ? [from[a]!, to[b]!, from[a + 1]!]
            : [from[a]!, to[b]!, to[b + 1]!];

        triangles.push(reverse
            ? [face[0], face[2], face[1]]
            : face);

        if (advanceA) a++;
        else b++;
    }

    return triangles;
}
