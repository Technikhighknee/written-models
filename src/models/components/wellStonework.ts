import * as THREE from "three";

import { AuthoredMeshBuilder } from "../../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult, type GeometryResult } from "../../toolbox/geometry/kernel/GeometryResult";
import { seededVariation } from "../../toolbox/spatial/layout/seededVariation";
import { weightedCuts } from "../../toolbox/spatial/layout/weightedCuts";

export const WELL_OPENING_RADIUS = 0.466;

interface StoneCourse {
    count: number;
    innerRadius: number;
    outerRadius: number;
    bottom: number;
    height: number;
    offset: number;
    seed: number;
    coping: boolean;
}

/**
 * One low-poly stone block. The visible joints and outer contour are real;
 * fine chips, cracks and weathering can live in the material later.
 */
function addStone(
    mesh: AuthoredMeshBuilder,
    course: StoneCourse,
    index: number,
    from: number,
    to: number
): void {
    const variation = (channel: number) =>
        seededVariation(course.seed, index, channel);
    const bottom = course.bottom + variation(1) * 0.003;
    const top = course.bottom + course.height + variation(2) * 0.009;
    const outer = course.outerRadius + variation(3) * 0.012;
    const inner = course.innerRadius + variation(4) * 0.006;
    const gap = 0.006 / outer;
    const start = from + course.offset + gap;
    const end = to + course.offset - gap;

    // The coping has a single chamfer at its exposed upper edge.
    // Lower courses need only their block silhouettes.
    const levels = [
        { y: bottom, inset: 0, endInset: 0 },
        ...(course.coping
            ? [{ y: top - 0.024, inset: 0, endInset: 0 }]
            : []),
        {
            y: top,
            inset: course.coping ? 0.016 : 0,
            endInset: course.coping ? 0.012 : 0
        }
    ];

    const positions: THREE.Vector3[] = [];

    for (const level of levels) {
        const angles = [
            start + level.endInset,
            (start + end) / 2,
            end - level.endInset
        ];
        const polar = (angle: number, radius: number) =>
            new THREE.Vector3(
                Math.sin(angle) * radius,
                level.y,
                Math.cos(angle) * radius
            );

        for (const angle of angles) {
            positions.push(polar(angle, outer - level.inset));
        }
        for (const angle of [...angles].reverse()) {
            positions.push(polar(angle, inner + level.inset));
        }
    }

    const ids = positions.map(point => mesh.addVertex(point));
    const face = (corners: readonly number[], uvs: readonly THREE.Vector2[]) =>
        mesh.addIndexedFace(corners.map(i => ids[i]!), uvs, "stone");
    const cap = (corners: readonly number[]) =>
        face(corners, corners.map(i => new THREE.Vector2(
            positions[i]!.x, positions[i]!.z
        )));

    const perimeter = [0];
    for (let edge = 0; edge < 6; edge++) {
        const a = positions[edge]!;
        const b = positions[(edge + 1) % 6]!;
        perimeter.push(perimeter[edge]! + Math.hypot(
            b.x - a.x, b.z - a.z
        ));
    }

    for (let level = 0; level < levels.length - 1; level++) {
        for (let edge = 0; edge < 6; edge++) {
            const next = (edge + 1) % 6;
            const a = level * 6 + edge;
            const b = level * 6 + next;
            const c = (level + 1) * 6 + next;
            const d = (level + 1) * 6 + edge;
            const u0 = perimeter[edge]!;
            const u1 = perimeter[edge + 1]!;

            face([a, b, c, d], [
                new THREE.Vector2(u0, positions[a]!.y),
                new THREE.Vector2(u1, positions[b]!.y),
                new THREE.Vector2(u1, positions[c]!.y),
                new THREE.Vector2(u0, positions[d]!.y)
            ]);
        }
    }

    const crown = (levels.length - 1) * 6;
    cap([crown, crown + 1, crown + 4, crown + 5]);
    cap([crown + 1, crown + 2, crown + 3, crown + 4]);
    cap([5, 4, 1, 0]);
    cap([4, 3, 2, 1]);
}

/** Three staggered courses, compiled into a single authored mesh. */
export function buildWellStonework(): GeometryResult {
    const mesh = new AuthoredMeshBuilder({ weld: "none" });
    const courses: StoneCourse[] = [
        {
            count: 12, innerRadius: 0.482, outerRadius: 0.755,
            bottom: 0.003, height: 0.18, offset: 0, seed: 9,
            coping: false
        },
        {
            count: 14, innerRadius: 0.478, outerRadius: 0.767,
            bottom: 0.182, height: 0.185, offset: Math.PI / 14,
            seed: 23, coping: false
        },
        {
            count: 18, innerRadius: WELL_OPENING_RADIUS, outerRadius: 0.796,
            bottom: 0.364, height: 0.242, offset: Math.PI / 18,
            seed: 41, coping: true
        }
    ];

    for (const course of courses) {
        const weights = Array.from(
            { length: course.count },
            (_, i) => 1 + seededVariation(course.seed, i, 0) * 0.16
        );
        const cuts = weightedCuts(0, Math.PI * 2, course.count, weights);

        for (let i = 0; i < course.count; i++) {
            addStone(mesh, course, i, cuts[i]!, cuts[i + 1]!);
        }
    }

    return geometryResult(mesh.build());
}
