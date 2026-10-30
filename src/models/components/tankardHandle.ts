import * as THREE from "three";

import { cm, mm } from "../../toolbox/units/length";
import { sweepSection } from "../../toolbox/geometry/build/sweepSection";
import { fitBoundary } from "../../toolbox/geometry/queries/fitBoundary";
import { topologyOf } from "../../toolbox/geometry/kernel/topology";
import type { GeometryResult } from "../../toolbox/geometry/kernel/GeometryResult";

/**
 * The grip is one curved wooden member with two fitted end faces.
 * Both contacts are determined from the *real* exterior of its stave,
 * without creating a temporary rendering mesh or guessing a cylinder.
 */
export function tankardHandle(
    stave: GeometryResult,
    upperBandCenter: number,
    bandWidth: number
): GeometryResult {
    const upperHandleY = upperBandCenter - bandWidth / 2 - cm(1.25);

    const w = mm(10);
    const d = mm(7);
    const bevel = mm(2.2);
    const section = [
        [-w + bevel, -d], [w - bevel, -d],
        [w, -d + bevel], [w, d - bevel],
        [w - bevel, d], [-w + bevel, d],
        [-w, d - bevel], [-w, -d + bevel]
    ].map(([x, y]) => new THREE.Vector2(x!, y!));

    const path = new THREE.CatmullRomCurve3(
        [
            new THREE.Vector3(cm(4.95), upperHandleY, 0),
            new THREE.Vector3(cm(6.55), cm(12.2), 0),
            new THREE.Vector3(cm(7.65), cm(11.85), 0),
            new THREE.Vector3(cm(8.6), cm(11.2), 0),
            new THREE.Vector3(cm(9.2), cm(9.9), 0),
            new THREE.Vector3(cm(9.2), cm(7.5), 0),
            new THREE.Vector3(cm(9.16), cm(5.4), 0),
            new THREE.Vector3(cm(8.6), cm(4.05), 0),
            new THREE.Vector3(cm(7.55), cm(3.3), 0),
            new THREE.Vector3(cm(6.3), cm(3.2), 0),
            new THREE.Vector3(cm(4.95), cm(3.4), 0)
        ], false, "centripetal"
    );
    const tangent = path.getTangent(0).normalize();
    const across = new THREE.Vector3(0, 0, 1);
    const up = new THREE.Vector3()
        .crossVectors(tangent, across).normalize();
    const startingFrame = new THREE.Matrix4()
        .makeBasis(across, up, tangent)
        .setPosition(path.getPoint(0));

    let handle = sweepSection({
        path: {
            at: progress => path.getPoint(progress),
            tangent: progress => path.getTangent(progress)
        },
        sectionAt: progress => {
            const nearEnd = Math.max(
                Math.max(0, 1 - progress * 7) ** 2,
                Math.max(0, 1 - (1 - progress) * 7) ** 2
            );
            const scale = 1 + 0.03 * nearEnd;

            return {
                outer: {
                    points: section.map(point =>
                        point.clone().multiplyScalar(scale)
                    ),
                    closed: true
                }
            };
        },
        startingFrame,
        stations: Array.from({length: 19}, (_, i) => i / 18),
        wall: {
            outerRegion: "side",
            smoothingGroupAt: () => "swept-section"
        }
    });

    const target = {
        geometry: stave.geometry,
        localToWorld: new THREE.Matrix4()
    };
    for (const region of ["cap-start", "cap-end"]) {
        const rims = topologyOf(handle).regionBoundaries(region);
        if (rims.length !== 1 || !rims[0]!.closed) {
            throw new Error(`Handle requires exactly one closed ${region} rim`);
        }

        handle = fitBoundary(handle, rims[0]!, target, {
            projection: {
                kind: "ray",
                direction: new THREE.Vector3(-1, 0, 0),
                originOffset: cm(9),
                maxDistance: cm(16)
            },
            sourceLocalToWorld: new THREE.Matrix4(),
            clearance: -mm(0.5),
            falloffRings: 1
        });
    }

    return handle;
}
