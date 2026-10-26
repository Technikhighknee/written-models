import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftBoard } from "./loftBoard";

export interface RadialStavesOptions {
    count: number;
    thickness: number;
    seamGap?: number;
    edgeRoundover?: number;
    angleOffset?: number;
}

/**
 * Shapes separate, tapered boards around a barrel-like radius/height profile.
 * Radius controls the stave's width as well as its longitudinal curvature;
 * its outer and inner faces also bend across the width.
 */
export function radialStaves(
    profile: readonly THREE.Vector2Like[],
    {
        count,
        thickness,
        seamGap = 0,
        edgeRoundover = 0,
        angleOffset = 0
    }: RadialStavesOptions
): MeshData[] {
    const values = [thickness, seamGap, edgeRoundover, angleOffset];

    if (
        !Number.isInteger(count) ||
        count < 3 ||
        values.some(value => !Number.isFinite(value)) ||
        thickness <= 0 ||
        seamGap < 0 ||
        edgeRoundover < 0 ||
        edgeRoundover >= thickness ||
        profile.length < 2 ||
        profile.some((point, index) =>
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            point.x <= thickness ||
            (index > 0 && point.y <= profile[index - 1]!.y) ||
            seamGap >= (2 * Math.PI * point.x) / count
        )
    ) {
        throw new RangeError("Invalid radial stave dimensions or profile");
    }

    const step = (2 * Math.PI) / count;
    const boards: MeshData[] = [];

    // Extra stations near each edge give the board an actual little
    // roundover, rather than hiding sharp edges with a normal map.
    const widthSamples = [0, 0.055, 0.2, 0.35, 0.5, 0.65, 0.8, 0.945, 1];

    function polar(radius: number, y: number, theta: number): THREE.Vector3 {
        return new THREE.Vector3(
            radius * Math.sin(theta),
            y,
            radius * Math.cos(theta)
        );
    }

    for (let board = 0; board < count; board++) {
        const sections = profile.map(({ x: radius, y }) => {
            const halfGapAngle = seamGap / (2 * radius);
            const start = angleOffset + board * step + halfGapAngle;
            const span = step - 2 * halfGapAngle;

            const outer = widthSamples.map(u => {
                const distanceToEdge = Math.min(u, 1 - u);
                const blend = Math.min(1, distanceToEdge / 0.055);
                const r = radius - edgeRoundover * (1 - blend);

                return polar(r, y, start + u * span);
            });

            const inner = widthSamples.map(u =>
                polar(radius - thickness, y, start + u * span)
            );

            return { outer, inner };
        });

        boards.push(loftBoard(sections));
    }

    return boards;
}
