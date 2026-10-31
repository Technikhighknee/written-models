import * as THREE from "three";

import { extrudeContour } from "../../toolbox/geometry/build/extrudeContour";
import { surfaceMesh } from "../../toolbox/geometry/mesh/surfaceMesh";
import { limestoneVariant } from "../../materials/stone/limestone";

export const WELL_OPENING_RADIUS = 0.46;
export const WELL_RIM_HEIGHT = 0.92;

interface RingCourse {
    count: number;
    innerRadius: number;
    outerRadius: number;
    bottom: number;
    height: number;
    offset: number;
    seed: number;
}

/** Independent wedge-shaped masonry units with real mortar joints. */
function stoneCourse(
    parent: THREE.Group,
    {
        count, innerRadius, outerRadius, bottom, height, offset, seed
    }: RingCourse
): void {
    const step = Math.PI * 2 / count;
    const frame = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 1, 0)
    ).setPosition(new THREE.Vector3(0, bottom, 0));

    for (let i = 0; i < count; i++) {
        const variation = Math.sin((seed + i * 17) * 8.123);
        const radius = outerRadius + variation * 0.004;
        const start = offset + step * i + 0.004;
        const end = offset + step * (i + 1) - 0.004;
        const arc = (r: number, from: number, to: number) =>
            [0, 0.5, 1].map(t => {
                const angle = from + (to - from) * t;
                return new THREE.Vector2(
                    Math.cos(angle) * r,
                    -Math.sin(angle) * r
                );
            });

        const outline = [
            ...arc(radius, start, end),
            ...arc(innerRadius, end, start)
        ];
        const geometry = extrudeContour({
            outer: { points: outline, closed: true }
        }, {
            frame,
            depth: height,
            caps: true
        });

        const tone = Math.abs((i * 7 + seed * 3) % 11);
        const finish = bottom < 0.21 && tone % 4 === 0
            ? 5 + (tone % 2)
            : tone % 5;

        parent.add(surfaceMesh({
            name: "Stone" + String(i + 1).padStart(2, "0"),
            geometry,
            materials: limestoneVariant(finish)
        }));
    }
}

/**
 * A low, genuinely hollow, coursed stone wellhead; the raised coping is
 * made of separate broad stones, not a texture painted over a cylinder.
 */
export function wellStonework(): THREE.Group {
    const stones = new THREE.Group();
    stones.name = "StoneWellhead";

    for (let course = 0; course < 4; course++) {
        const row = new THREE.Group();
        row.name = "MasonryCourse" + (course + 1);
        stoneCourse(row, {
            count: 16,
            innerRadius: WELL_OPENING_RADIUS,
            outerRadius: 0.755,
            bottom: course * 0.19 + 0.003,
            height: 0.187,
            offset: course % 2 ? Math.PI / 16 : 0,
            seed: course + 2
        });
        stones.add(row);
    }

    const coping = new THREE.Group();
    coping.name = "WornCopingStones";
    stoneCourse(coping, {
        count: 18,
        innerRadius: WELL_OPENING_RADIUS - 0.018,
        outerRadius: 0.795,
        bottom: 0.763,
        height: WELL_RIM_HEIGHT - 0.763,
        offset: Math.PI / 18,
        seed: 13
    });
    stones.add(coping);

    return stones;
}
