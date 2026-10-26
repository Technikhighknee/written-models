import type { MeshData } from "../mesh/MeshData";
import { straightBoard } from "./straightBoard";

export interface BoardPanelOptions {
    length: number;
    width: number;
    thickness: number;
    count: number;
    /** Relative plank widths, normalized to fill the complete panel. */
    widthWeights?: readonly number[];
    /** A real open gap, if desired. Zero joins the board edges. */
    gap?: number;
    chamfer?: number;
    crown?: number;
}

/**
 * A collection of separate, closed quad boards joined across local Z.
 * Individual meshes remain individually selectable, material-assignable
 * and exportable. All longitudinal grain follows local X.
 */
export function boardPanel({
    length, width, thickness, count,
    widthWeights,
    gap = 0,
    chamfer = 0,
    crown = 0
}: BoardPanelOptions): MeshData[] {
    if (
        !Number.isInteger(count) || count < 1 ||
        !Number.isFinite(width) || !Number.isFinite(gap) ||
        width <= 0 || gap < 0 || gap * (count - 1) >= width ||
        (widthWeights !== undefined && (
            widthWeights.length !== count ||
            widthWeights.some(weight => !Number.isFinite(weight) || weight <= 0)
        ))
    ) {
        throw new RangeError("Invalid board panel layout");
    }

    const available = width - gap * (count - 1);
    const weights = widthWeights ?? Array.from({ length: count }, () => 1);
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);

    const boards: MeshData[] = [];
    let cursor = -width / 2;

    for (let i = 0; i < count; i++) {
        const boardWidth = available * weights[i]! / totalWeight;
        const board = straightBoard({
            length,
            width: boardWidth,
            thickness,
            chamfer,
            crown
        });

        const center = cursor + boardWidth / 2;

        for (const vertex of board.vertices) {
            vertex.z += center;
        }

        boards.push(board);
        cursor += boardWidth + gap;
    }

    return boards;
}
