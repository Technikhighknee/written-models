const TAU = Math.PI * 2;

export interface PeriodicFlowOptions {
    cycles: number;
    bend: number;
    firstPhase?: number;
    secondPhase?: number;
    secondaryWeight?: number;
}

/**
 * A continuous, periodic coordinate field. Every line of constant phase
 * bends together and the wrapping boundaries remain exactly matched.
 *
 * Reusable for grain, brushed metal, fabric weave, leather, stone veining
 * and other longitudinally coherent material detail.
 */
export function periodicFlowField({
    cycles, bend,
    firstPhase = 0, secondPhase = 0,
    secondaryWeight = 0.30
}: PeriodicFlowOptions): (u: number, v: number, extraWarp?: number) => number {
    if (!Number.isInteger(cycles) || cycles < 1 ||
        ![bend, firstPhase, secondPhase, secondaryWeight]
            .every(Number.isFinite) ||
        bend < 0 || bend > cycles / (Math.PI * 2.6) ||
        secondaryWeight < 0 || secondaryWeight > 1) {
        throw new RangeError("Invalid periodic flow field");
    }

    return (u: number, v: number, extraWarp = 0): number => {
        const envelope = Math.sin(Math.PI * u) ** 2;
        const deflection =
            Math.sin(TAU * v + firstPhase) +
            secondaryWeight * Math.sin(2 * TAU * v + secondPhase);
        return cycles * u + bend * envelope * deflection + extraWarp;
    };
}
