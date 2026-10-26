const TAU = Math.PI * 2;

export interface FlowedGrainOptions {
    /** Whole growth bands per physical tile width; integer for clean wrapping. */
    rings: number;
    /** Maximum phase displacement, measured in ring intervals. */
    bend: number;
    firstPhase?: number;
    secondPhase?: number;
}

/**
 * A CONTINUOUS grain coordinate, not a collection of painted arcs.
 *
 * Lines of constant phase run from one end of the board to the other.
 * Across-width displacement gently bends the whole fiber field, while
 * preserving periodic boundaries for reusable PBR textures.
 *
 * The phase increases by exactly `rings` when U increases by one,
 * and is unchanged when V increases by one. Pass additional periodic
 * microWarp to introduce subtler wood-specific unevenness.
 */
export function flowedGrainField({
    rings,
    bend,
    firstPhase = 0,
    secondPhase = 0
}: FlowedGrainOptions): (u: number, v: number, microWarp?: number) => number {
    if (
        !Number.isInteger(rings) || rings < 1 ||
        ![bend, firstPhase, secondPhase].every(Number.isFinite) ||
        bend < 0 || bend > rings / (Math.PI * 2.6)
    ) {
        throw new RangeError("Invalid continuous grain field");
    }

    return (u: number, v: number, microWarp = 0): number => {
        const envelope = Math.sin(Math.PI * u) ** 2;
        const deflection =
            Math.sin(TAU * v + firstPhase) +
            0.30 * Math.sin(2 * TAU * v + secondPhase);

        return rings * u + bend * envelope * deflection + microWarp;
    };
}
