import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftBoard } from "./loftBoard";

export interface RadialStavesOptions {
    count: number;
    thickness: number;
    seamGap?: number;
    edgeRoundover?: number;
    angleOffset?: number;
    /**
     * Independent normalized width stations for the hidden face.
     * Omitting this preserves the original symmetric section topology.
     * [0, 1] is the lowest-density closed inner surface.
     */
    innerWidthSamples?: readonly number[];
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
        angleOffset = 0,
        innerWidthSamples
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

    // Three samples already capture the stave's transverse curvature.
    // Add edge support loops only when a real roundover is requested.
    // Keeping the center sample prevents the board from becoming a flat wedge.
    const widthSamples = edgeRoundover > 0
        ? [0, 0.055, 0.5, 0.945, 1]
        : [0, 0.5, 1];

    const innerSamples = innerWidthSamples ?? widthSamples;
    if (
        innerSamples.length < 2 ||
        innerSamples[0] !== 0 ||
        innerSamples[innerSamples.length - 1] !== 1 ||
        innerSamples.some((value, i) =>
            !Number.isFinite(value) ||
            value < 0 || value > 1 ||
            (i > 0 && value <= innerSamples[i - 1]!)
        )
    ) {
        throw new RangeError("Invalid inner width stations");
    }

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

            // Unlike the outer shoulder loops, the hidden surface needs
            // only the samples that express its actual interior shape.
            const inner = innerSamples.map(u =>
                polar(radius - thickness, y, start + u * span)
            );

            return { outer, inner };
        });

        boards.push(loftBoard(sections));
    }

    return boards;
}
