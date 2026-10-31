import * as THREE from "three";

import { cooperedStaves } from "./cooperedStaves";
import { cooperedHead } from "./cooperedHead";
import { forgedBand } from "./forgedBand";
import { sweepSection } from "../../toolbox/geometry/build/sweepSection";
import { surfaceMesh } from "../../toolbox/geometry/mesh/surfaceMesh";
import { offsetMeshUvs } from "../../toolbox/geometry/edit/geometryEdits";
import { oakVariant, oakBoardFace } from "../../materials/wood/oak";
import { wroughtIron } from "../../materials/metal/wroughtIron";
import { cm, mm } from "../../toolbox/units/length";

export const BUCKET_HEIGHT = cm(29);
export const BUCKET_HANDLE_TOP = cm(36);

const STAVES = 12;

const PROFILE = [
    new THREE.Vector2(cm(12.6), 0),
    new THREE.Vector2(cm(13.1), cm(10)),
    new THREE.Vector2(cm(14.0), BUCKET_HEIGHT)
];

/**
 * The well's bucket is a real open, coopered vessel, not a capped cone.
 * The iron handle shares the exact visible suspension point with the rope.
 */
export function wellBucket(): THREE.Group {
    const bucket = new THREE.Group();
    bucket.name = "HangingWoodenBucket";

    const pieces = cooperedStaves(PROFILE, {
        count: STAVES,
        thickness: cm(1.3),
        edgeRoundover: mm(0.8),
        seamGap: mm(0.85)
    });

    pieces.forEach((geometry, i) => {
        const cut = (i * 3 + 1) % 8;
        const wood = oakVariant(cut);

        bucket.add(surfaceMesh({
            name: "BucketStave" + (i + 1),
            geometry: offsetMeshUvs(
                geometry,
                cm(2) + i * cm(1.7),
                cm(6) + (i % 5) * cm(9)
            ),
            materials: {
                outer: wood.face,
                inner: wood.aged,
                "edge-left": wood.face,
                "edge-right": wood.face,
                "cap-start": wood.endGrain,
                "cap-end": wood.endGrain
            }
        }));
    });

    const boards = cooperedHead(cm(11.5), {
        planks: 4,
        thickness: cm(1.9),
        radialSegments: 24
    });

    boards.forEach((geometry, index) => {
        const floor = surfaceMesh({
            name: "BucketBottomBoard" + (index + 1),
            geometry,
            materials: oakBoardFace((index * 3 + 2) % 8)
        });
        floor.position.y = cm(2.8);
        bucket.add(floor);
    });

    for (const [index, y] of [cm(5), cm(24)].entries()) {
        bucket.add(surfaceMesh({
            name: index === 0 ? "LowerBucketHoop" : "UpperBucketHoop",
            geometry: forgedBand(PROFILE, {
                y,
                width: cm(2.1),
                thickness: mm(2.6),
                clearance: mm(0.5),
                bevel: mm(0.4),
                radialSegments: 36
            }),
            materials: wroughtIron()
        }));
    }

    // An iron bail pivots through the side staves, with its arch over the rim.
    const handleWidth = cm(13.5);
    const handleRise = cm(17);
    const anchorHeight = cm(19);
    const at = (t: number) => {
        const angle = Math.PI * (1 - t);
        return new THREE.Vector3(
            handleWidth * Math.cos(angle),
            anchorHeight + handleRise * Math.sin(angle),
            0
        );
    };
    const tangent = (t: number) => {
        const angle = Math.PI * (1 - t);
        return new THREE.Vector3(
            handleWidth * Math.sin(angle),
            -handleRise * Math.cos(angle),
            0
        );
    };

    const startingFrame = new THREE.Matrix4()
        .makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1), tangent(0)
        ))
        .setPosition(at(0));

    const handle = sweepSection({
        path: { at, tangent },
        startingFrame,
        stations: Array.from({ length: 25 }, (_, i) => i / 24),
        sectionAt: () => ({
            outer: {
                closed: true,
                points: Array.from({ length: 8 }, (_, i) => {
                    const angle = i * 2 * Math.PI / 8;
                    return new THREE.Vector2(
                        mm(5.5) * Math.cos(angle),
                        mm(5.5) * Math.sin(angle)
                    );
                })
            }
        }),
        ends: "cap"
    });

    bucket.add(surfaceMesh({
        name: "SwingingIronBail",
        geometry: handle,
        materials: wroughtIron()
    }));

    return bucket;
}
