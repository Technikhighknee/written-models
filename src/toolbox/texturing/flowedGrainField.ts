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
 * Wood-facing recipe adapter for the generic continuous flow-coordinate
 * field. It deliberately preserves the old oak grain parameters, including
 * its phase wrapping and subordinate secondary-wave contribution.
 */
export function flowedGrainField({
    rings, bend, firstPhase = 0, secondPhase = 0
}: FlowedGrainOptions): (u: number, v: number, microWarp?: number) => number {
    return periodicFlowField({
        cycles: rings, bend, firstPhase, secondPhase,
        secondaryWeight: 0.30
    });
}
