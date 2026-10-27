import * as THREE from "three";
import { cm, mm } from "../toolbox/units/length";
import { turnedVessel } from "../toolbox/geometry/construction/turnedVessel";
import { sweepSection } from "../toolbox/geometry/construction/sweepSection";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { roundedRectangle } from "../toolbox/shapes/primitives/roundedRectangle";
import { paleStoneware } from "../materials/ceramic/paleStoneware";

export default {
    create,
    slug: "beer-mug",
    title: "Medieval Beer Jug",
    description: "A modest, wheel-thrown stoneware drinking jug with a strap handle."
};

// Late 14th–early 15th century everyday Siegburg-inspired drinking jug.
// Real open drinking cavity, thick clay foot and one hand-applied strap
// handle. No fantasy ornament, metal rings or anachronistic hinged lid.
function create(): THREE.Group {
    const mug = new THREE.Group();
    mug.name = "MedievalBeerJug";
    const clay = paleStoneware();

    const bowl = surfaceMesh({
        name: "WheelThrownStoneware",
        geometry: turnedVessel({
            outline: [
                {y: 0,        radius: cm(4.2)},
                {y: cm(1.4),  radius: cm(4.45)},
                {y: cm(7.2),  radius: cm(5.4)},
                {y: cm(10.6), radius: cm(4.85)},
                {y: cm(13.1), radius: cm(3.65)},
                {y: cm(17.1), radius: cm(3.8)}
            ],
            wallThickness: mm(4.5),
            floorThickness: cm(1.1),
            radialSegments: 40,
            samplesPerSpan: 5,
            turning: {
                from: cm(12.1), to: cm(16.35),
                pitch: mm(5.5), depth: mm(0.3)
            },
            footImpressions: {
                count: 12, depth: mm(1.6), height: cm(1.2)
            }
        }),
        materials: {
            base: clay.body,
            outer: clay.body,
            rim: clay.lip,
            inner: clay.body,
            floor: clay.body
        }
    });
    mug.add(bowl);

    // A generous C-shaped finger opening. The strap's ends enter the
    // actual clay wall; caps and most of each joint are buried, while
    // the flared shoulders stay visible as hand-worked attachments.
    const handle = surfaceMesh({
        name: "AppliedClayStrapHandle",
        geometry: sweepSection({
            path: [
                new THREE.Vector3(cm(3.65), cm(14.35), 0),
                new THREE.Vector3(cm(5.7), cm(15.0), 0),
                new THREE.Vector3(cm(8.45), cm(13.3), 0),
                new THREE.Vector3(cm(9.45), cm(10.3), 0),
                new THREE.Vector3(cm(9.25), cm(7.7), 0),
                new THREE.Vector3(cm(7.75), cm(6.3), 0),
                new THREE.Vector3(cm(5.2), cm(6.4), 0)
            ],
            section: roundedRectangle(cm(1.75), mm(9.5), mm(3))
                .getPoints(3),
            referenceAxis: new THREE.Vector3(0, 0, 1),
            endFlare: 0.28,
            segments: 28
        }),
        materials: clay.body
    });
    mug.add(handle);
    return mug;
}
