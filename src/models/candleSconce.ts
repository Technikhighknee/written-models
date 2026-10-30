import * as THREE from "three";

import { extrudeContour } from "../toolbox/geometry/build/extrudeContour";
import { sweepSection } from "../toolbox/geometry/build/sweepSection";
import { capBoundary } from "../toolbox/geometry/build/finishBoundaries";
import { joinGeometry } from "../toolbox/geometry/build/joinGeometry";
import { revolveProfile } from "../toolbox/geometry/build/revolveProfile";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { wroughtIron } from "../materials/metal/wroughtIron";

export default {
    create,
    slug: "candle-sconce",
    title: "Forged Iron Candle Sconce",
    description: "A wall-mounted iron candle holder with a pierced mounting plate, curved arm and hollow cup."
};

const point = (x: number, y: number) => new THREE.Vector2(x, y);

function circle(radius: number, centerX: number, centerY: number, count: number) {
    return Array.from({ length: count }, (_, index) => {
        const angle = index * Math.PI * 2 / count;
        return point(
            centerX + radius * Math.cos(angle),
            centerY + radius * Math.sin(angle)
        );
    });
}

export function buildSconceGeometry() {
    const plate = extrudeContour({
        outer: {
            closed: true,
            points: [
                point(-0.06, -0.08), point(-0.07, 0.10),
                point(-0.04, 0.16), point(0.04, 0.16),
                point(0.07, 0.10), point(0.06, -0.08)
            ]
        },
        holes: [{
            closed: true,
            points: circle(0.009, 0, 0.125, 12)
        }]
    }, {
        frame: new THREE.Matrix4(),
        depth: 0.02,
        layers: [
            { position: 0, contourOffset: 0 },
            { position: 0.2, contourOffset: -0.001 },
            { position: 0.8, contourOffset: -0.001 },
            { position: 1, contourOffset: 0 }
        ]
    });

    // The arm turns upright before reaching the candle tray. Its last
    // section is the first ring of the tray itself, not an embedded cap.
    const spine = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, 0.025, 0.01),
        new THREE.Vector3(0, 0.052, 0.13),
        new THREE.Vector3(0, 0.118, 0.29),
        new THREE.Vector3(0, 0.17, 0.29)
    );
    const armAt = (t: number) => spine.getPoint(t);
    const armTangent = (t: number) => spine.getTangent(t);
    const tangent = armTangent(0).normalize();
    const across = new THREE.Vector3(1, 0, 0);
    const upright = new THREE.Vector3()
        .crossVectors(tangent, across).normalize();
    const frame = new THREE.Matrix4()
        .makeBasis(across, upright, tangent)
        .setPosition(armAt(0));

    const armWalls = sweepSection({
        path: { at: armAt, tangent: armTangent },
        startingFrame: frame,
        ends: "open",
        stations: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
        sectionAt: t => ({
            outer: {
                closed: true,
                points: circle(
                    0.014 + 0.002 * THREE.MathUtils.smoothstep(t, 0.7, 1),
                    0, 0, 24
                )
            }
        }),
        wall: {
            outerRegion: "forged-arm",
            smoothingGroupAt: () => "sconce-forging"
        }
    });

    // Only the plate-side end needs a cap. The cup-side end stays open
    // so the two true boundary loops can be welded into one solid.
    const arm = capBoundary(
        armWalls,
        armWalls.boundaries["start-outer"]![0]!,
        {
            region: "arm-base",
            uvFrame: frame,
            tessellation: "triangulate"
        }
    );

    const cupCenter = armAt(1);
    const endRing = arm.boundaries["end-outer"]![0]!;
    const radial = arm.geometry.vertices[endRing.vertices[0]!]!
        .clone().sub(cupCenter).normalize();

    const cup = revolveProfile({
        closed: false,
        points: [
            point(0.016, 0),
            point(0.019, 0.005),
            point(0.025, 0.009),
            point(0.034, 0.012),
            point(0.050, 0.012),
            point(0.055, 0.015),
            point(0.055, 0.034),
            point(0.047, 0.042),
            point(0.039, 0.042),
            point(0.037, 0.033),
            point(0.037, 0.022),
            point(0.033, 0.022),
            point(0, 0.022)
        ]
    }, {
        axisOrigin: cupCenter,
        axisDirection: armTangent(1),
        radialDirection: radial,
        angle: 2 * Math.PI,
        segments: 24,
        surfaceAt: ({ meridianInterval }) =>
            meridianInterval >= 6 && meridianInterval <= 8
                ? "rim" : "cup",
        smoothingGroupAt: () => "sconce-forging"
    });

    const armAndCup = joinGeometry([arm, cup], {
        weld: [{
            firstPart: 0,
            first: arm.boundaries["end-outer"]![0]!,
            secondPart: 1,
            second: cup.boundaries["open-0"]![0]!
        }]
    });

    return { plate, armAndCup, armAt, cupCenter };
}

function create(): THREE.Group {
    const sconce = new THREE.Group();
    sconce.name = "ForgedIronCandleSconce";

    const { plate, armAndCup } = buildSconceGeometry();

    const iron = wroughtIron().clone();
    iron.name = "Sconce · Forged Iron";
    const cupIron = iron.clone();
    cupIron.name = "Sconce · Darkened Candle Cup";
    cupIron.color.set("#77716a");
    cupIron.roughness = 0.78;

    sconce.add(
        surfaceMesh({
            name: "PiercedMountingPlate",
            geometry: plate,
            materials: iron
        }),
        surfaceMesh({
            name: "ContinuousForgedArmAndCandleCup",
            geometry: armAndCup,
            materials: {
                "arm-base": iron,
                "forged-arm": iron,
                cup: iron,
                rim: cupIron
            }
        })
    );

    return sconce;
}
