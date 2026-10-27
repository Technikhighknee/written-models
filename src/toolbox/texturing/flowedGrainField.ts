import { periodicFlowField } from "./periodicFlowField";

export interface FlowedGrainOptions {
    /** Whole growth bands per physical tile width; integer for clean wrapping. */
    rings: number;
    /** Maximum phase displacement, measured in ring intervals. */
    bend: number;
    firstPhase?: number;
    secondPhase?: number;
}

/**
 * Wood grain adapter for the periodic flow field. Ring count, bend and
 * phases control the continuous fiber pattern, with a subtle secondary
 * wave contribution that maintains tile wrapping.
 */
export function flowedGrainField({
    rings, bend, firstPhase = 0, secondPhase = 0
}: FlowedGrainOptions): (u: number, v: number, microWarp?: number) => number {
    return periodicFlowField({
        cycles: rings, bend, firstPhase, secondPhase,
        secondaryWeight: 0.30
    });
}
