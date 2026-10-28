export type TriangleIndices = [number, number, number];

export interface StitchStationsOptions {
    firstStations: readonly number[];
    secondStations: readonly number[];
    reverse?: boolean;
}

function stationsFor(
    points: readonly number[],
    supplied?: readonly number[]
): readonly number[] {
    if (points.length < 2 || points.some(index =>
        !Number.isInteger(index) || index < 0
    )) {
        throw new RangeError("Stitch needs ordered vertex indices");
    }

    if (supplied === undefined) {
        return points.map((_, index) => index / (points.length - 1));
    }

    if (
        supplied.length !== points.length ||
        supplied[0] !== 0 ||
        supplied.at(-1) !== 1 ||
        supplied.some((station, index) =>
            !Number.isFinite(station) ||
            station < 0 || station > 1 ||
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
    const firstStations = stationsFor(first, explicit?.firstStations);
    const secondStations = stationsFor(second, explicit?.secondStations);
    const reverse = typeof options === "boolean"
        ? options : (options.reverse ?? false);

    const triangles: TriangleIndices[] = [];
    let a = 0;
    let b = 0;

    while (a < first.length - 1 || b < second.length - 1) {
        const advanceA = a < first.length - 1 &&
            (b === second.length - 1 ||
                firstStations[a + 1]! < secondStations[b + 1]!);

        const face: TriangleIndices = advanceA
            ? [first[a]!, second[b]!, first[a + 1]!]
            : [first[a]!, second[b]!, second[b + 1]!];

        triangles.push(reverse
            ? [face[0], face[2], face[1]]
            : face);

        if (advanceA) a++;
        else b++;
    }

    return triangles;
}
