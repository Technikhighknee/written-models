import type { MeshData } from "../mesh/MeshData";
import { straightBoard } from "./straightBoard";

export interface BoardPanelOptions {
    length: number;
    width: number;
    thickness: number;
    count: number;
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
    gap = 0,
    chamfer = 0,
    crown = 0
}: BoardPanelOptions): MeshData[] {
    if (
        !Number.isInteger(count) || count < 1 ||
        !Number.isFinite(width) || !Number.isFinite(gap) ||
        width <= 0 || gap < 0 || gap * (count - 1) >= width
    ) {
        throw new RangeError("Invalid board panel layout");
    }

    const boardWidth = (width - gap * (count - 1)) / count;

    return Array.from({ length: count }, (_, i) => {
        const board = straightBoard({
            length,
            width: boardWidth,
            thickness,
            chamfer,
            crown
        });
        const center = -width / 2 + boardWidth / 2 +
            i * (boardWidth + gap);

        for (const vertex of board.vertices) {
            vertex.z += center;
        }

        return board;
    });
}
