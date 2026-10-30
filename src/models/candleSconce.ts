import * as THREE from "three";

import { extrudeContour } from "../toolbox/geometry/build/extrudeContour";
import { sweepSection } from "../toolbox/geometry/build/sweepSection";
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

    const armAt = (t: number) => new THREE.Vector3(
        0,
        0.025 + 0.145 * t,
        0.01 + 0.28 * t - 0.022 * Math.sin(Math.PI * t)
    );
    const armTangent = (t: number) => new THREE.Vector3(
        0,
        0.145,
        0.28 - 0.022 * Math.PI * Math.cos(Math.PI * t)
    );
    const tangent = armTangent(0).normalize();
    const across = new THREE.Vector3(1, 0, 0);
    const upright = new THREE.Vector3()
        .crossVectors(tangent, across).normalize();
    const frame = new THREE.Matrix4()
        .makeBasis(across, upright, tangent)
        .setPosition(armAt(0));

    const arm = sweepSection({
        path: { at: armAt, tangent: armTangent },
        startingFrame: frame,
        stations: [0, 0.2, 0.4, 0.6, 0.8, 1],
        sectionAt: t => ({
            outer: {
                closed: true,
                points: circle(0.014 * (1 + 0.12 * t), 0, 0, 8)
            }
        }),
        wall: {
            outerRegion: "forged-arm",
            smoothingGroupAt: () => "rounded-iron"
        }
    });

    const cupCenter = armAt(1);
    const cup = revolveProfile({
        closed: false,
        points: [
            point(0, 0), point(0.052, 0),
            point(0.055, 0.008), point(0.055, 0.027),
            point(0.043, 0.035), point(0.039, 0.035),
            point(0.037, 0.026), point(0.037, 0.009),
            point(0, 0.009)
        ]
    }, {
        axisOrigin: cupCenter,
        axisDirection: new THREE.Vector3(0, 1, 0),
        radialDirection: new THREE.Vector3(1, 0, 0),
        angle: 2 * Math.PI,
        segments: 24,
        surfaceAt: ({ meridianInterval }) =>
            meridianInterval >= 3 && meridianInterval <= 5
                ? "rim" : "cup"
    });

    return { plate, arm, cup, armAt, cupCenter };
}

function create(): THREE.Group {
    const sconce = new THREE.Group();
    sconce.name = "ForgedIronCandleSconce";

    const { plate, arm, cup } = buildSconceGeometry();

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
            name: "CurvedForgedArm",
            geometry: arm,
            materials: iron
        }),
        surfaceMesh({
            name: "CandleCup",
            geometry: cup,
            materials: cupIron
        })
    );

    return sconce;
}
