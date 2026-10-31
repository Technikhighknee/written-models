import * as THREE from "three";

import { wellStonework } from "./components/wellStonework";
import { wellBucket, BUCKET_HANDLE_TOP } from "./components/wellBucket";
import { oakTimberShop } from "./components/oakSeating";
import { tableTimberGeometry } from "./components/tableTimberGeometry";
import { boxMesh } from "../toolbox/geometry/construction/boxMesh";
import { cylinderMesh } from "../toolbox/geometry/construction/cylinderMesh";
import { sweepSection } from "../toolbox/geometry/build/sweepSection";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { oakVariant } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";

export default {
    slug: "village-well",
    title: "Village Well",
    description: "A stone-lined communal well with a timber roof, winding drum and hanging bucket.",
    category: "architecture" as const,
    create
};

const POST_X = 0.93;
const DRUM_Y = 1.68;
const BUCKET_BASE = 0.65;
const BUCKET_X = 0.05;
const BUCKET_Z = 0.08;
const ROOF_RISE = 0.45;
const ROOF_RUN = 1.02;
const ROOF_RIDGE = 2.47;
const ROOF_ANGLE = Math.atan2(ROOF_RISE, ROOF_RUN);

function create(): THREE.Group {
    const well = new THREE.Group();
    well.name = "VillageWell";

    well.add(wellStonework());
    well.add(wellWater());
    well.add(timberFrame());
    well.add(windingMechanism());

    const bucket = wellBucket();
    bucket.position.set(BUCKET_X, BUCKET_BASE, BUCKET_Z);
    well.add(bucket);

    well.add(hangingRope());

    return well;
}

/** A dark recessed surface, not a fake solid stone cap over the opening. */
function wellWater(): THREE.Mesh {
    const surface = surfaceMesh({
        name: "WaterBelowTheRim",
        geometry: geometryResult(cylinderMesh({
            radiusTop: 0.445,
            radiusBottom: 0.445,
            height: 0.008,
            radialSegments: 32
        })),
        materials: new THREE.MeshPhysicalMaterial({
            name: "Deep Well Water",
            color: "#243c3c",
            metalness: 0,
            roughness: 0.3,
            clearcoat: 0.25,
            clearcoatRoughness: 0.22
        })
    });
    surface.position.y = 0.065;
    return surface;
}

function timberFrame(): THREE.Group {
    const frame = new THREE.Group();
    frame.name = "OakRoofAndSupports";
    const workshop = oakTimberShop(4);

    const beam = (
        name: string,
        start: THREE.Vector3,
        end: THREE.Vector3,
        width: number,
        depth: number
    ): void => {
        frame.add(workshop.timberFromGeometry(
            name, tableTimberGeometry(start, end, width, depth)
        ));
    };

    for (const side of [-1, 1]) {
        const x = side * POST_X;
        beam(
            side < 0 ? "LeftUpright" : "RightUpright",
            new THREE.Vector3(x, 0, 0),
            new THREE.Vector3(x, 2.43, 0),
            0.145, 0.145
        );
    }

    // Ridge bearer sits in the two posts; the sloping rafters are
    // carried by it and contact the underside of the roof planking.
    beam(
        "RidgeBearer",
        new THREE.Vector3(-1.09, 2.405, 0),
        new THREE.Vector3(1.09, 2.405, 0),
        0.13, 0.13
    );

    for (const [index, x] of [-POST_X, 0, POST_X].entries()) {
        for (const side of [-1, 1]) {
            beam(
                "Rafter" + (index + 1) + (side < 0 ? "Back" : "Front"),
                new THREE.Vector3(x, 2.405, 0),
                new THREE.Vector3(x, 1.97, side * 0.985),
                0.085, 0.11
            );
        }
    }

    // Small knee-braces meet the underside of the ridge bearer and
    // keep the otherwise tall uprights from looking free-standing.
    for (const side of [-1, 1]) {
        beam(
            side < 0 ? "LeftKneeBrace" : "RightKneeBrace",
            new THREE.Vector3(side * POST_X, 2.12, 0),
            new THREE.Vector3(side * 1.045, 2.355, 0),
            0.075, 0.075
        );
    }

    const roof = new THREE.Group();
    roof.name = "WeatheredBoardRoof";

    const boardsPerSlope = 8;
    const boardWidth = 0.255;
    const boardGap = 0.006;
    const boardDepth = Math.hypot(ROOF_RUN, ROOF_RISE) + 0.025;
    const plankGeometry = geometryResult(boxMesh({
        width: boardWidth,
        height: 0.037,
        depth: boardDepth
    }));

    for (const side of [-1, 1]) {
        for (let i = 0; i < boardsPerSlope; i++) {
            const cut = (i * 5 + (side + 1) * 2) % 8;
            const wood = oakVariant(cut);
            const board = surfaceMesh({
                name: (side < 0 ? "BackRoofBoard" : "FrontRoofBoard") + (i + 1),
                geometry: plankGeometry,
                materials: {
                    px: wood.face,
                    nx: wood.face,
                    py: wood.aged,
                    ny: wood.aged,
                    pz: wood.endGrain,
                    nz: wood.endGrain
                }
            });

            board.position.set(
                (i - (boardsPerSlope - 1) / 2) * (boardWidth + boardGap),
                ROOF_RIDGE - ROOF_RISE / 2,
                side * ROOF_RUN / 2
            );
            board.rotation.x = side * ROOF_ANGLE;
            roof.add(board);
        }
    }

    beam(
        "RidgeCover",
        new THREE.Vector3(-1.055, 2.49, 0),
        new THREE.Vector3(1.055, 2.49, 0),
        0.065, 0.095
    );

    frame.add(roof);
    return frame;
}

function windingMechanism(): THREE.Group {
    const winding = new THREE.Group();
    winding.name = "WindingDrumAndCrank";
    const oak = oakVariant(5);
    const iron = wroughtIron();

    const cylinder = (
        name: string,
        radius: number,
        length: number,
        x: number,
        y: number,
        z: number,
        materials: THREE.Material | Readonly<Record<string, THREE.Material>>
    ): THREE.Mesh => {
        const part = surfaceMesh({
            name,
            geometry: geometryResult(cylinderMesh({
                radiusTop: radius,
                radiusBottom: radius,
                height: length,
                radialSegments: 16
            })),
            materials
        });
        part.rotation.z = -Math.PI / 2;
        part.position.set(x, y, z);
        winding.add(part);
        return part;
    };

    cylinder("OakWindingDrum", 0.102, 1.75, 0, DRUM_Y, 0, {
        side: oak.face,
        top: oak.endGrain,
        bottom: oak.endGrain
    });

    for (const side of [-1, 1]) {
        cylinder(
            side < 0 ? "LeftAxleSpindle" : "RightAxleSpindle",
            0.029, 0.22, side * 0.96, DRUM_Y, 0, iron
        );
        cylinder(
            side < 0 ? "LeftBearingPlate" : "RightBearingPlate",
            0.066, 0.011, side * 1.011, DRUM_Y, 0, iron
        );
    }

    const arm = tableTimberGeometry(
        new THREE.Vector3(1.07, DRUM_Y, 0),
        new THREE.Vector3(1.07, DRUM_Y, 0.27),
        0.034, 0.044
    );
    const armMesh = surfaceMesh({
        name: "CrankArm",
        geometry: arm.geometry,
        materials: iron
    });
    armMesh.applyMatrix4(arm.localToParent);
    winding.add(armMesh);

    cylinder(
        "TurnedWoodenCrankGrip",
        0.035, 0.18, 1.16, DRUM_Y, 0.27, {
            side: oak.aged,
            top: oak.endGrain,
            bottom: oak.endGrain
        }
    );

    return winding;
}

function hangingRope(): THREE.Group {
    const rope = new THREE.Group();
    rope.name = "HempRope";
    const hemp = new THREE.MeshStandardMaterial({
        name: "Twisted Hemp",
        color: "#a18b62",
        roughness: 1,
        metalness: 0
    });

    const section = () => ({
        outer: {
            closed: true,
            points: Array.from({ length: 8 }, (_, i) => {
                const angle = i * Math.PI / 4;
                return new THREE.Vector2(
                    0.011 * Math.cos(angle),
                    0.011 * Math.sin(angle)
                );
            })
        }
    });
    const startFrame = (
        at: (t: number) => THREE.Vector3,
        tangent: (t: number) => THREE.Vector3
    ) => new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1), tangent(0).normalize()
        )
    ).setPosition(at(0));

    // Four turns rest directly against the drum. The last turn is
    // tangent to the hanging length rather than ending mid-air.
    const turns = Math.PI * 8;
    const spoolAt = (t: number) => new THREE.Vector3(
        -0.045 + 0.095 * t,
        DRUM_Y - 0.111 * Math.sin(turns * t),
        0.111 * Math.cos(turns * t)
    );
    const spoolTangent = (t: number) => new THREE.Vector3(
        0.095,
        -0.111 * turns * Math.cos(turns * t),
        -0.111 * turns * Math.sin(turns * t)
    );

    rope.add(surfaceMesh({
        name: "RopeWoundOntoDrum",
        geometry: sweepSection({
            path: { at: spoolAt, tangent: spoolTangent },
            sectionAt: section,
            startingFrame: startFrame(spoolAt, spoolTangent),
            stations: Array.from({ length: 97 }, (_, i) => i / 96),
            ends: "cap"
        }),
        materials: hemp
    }));

    const ropeEndY = BUCKET_BASE + BUCKET_HANDLE_TOP;
    const drop = DRUM_Y - ropeEndY;
    const looseAt = (t: number) => new THREE.Vector3(
        BUCKET_X,
        DRUM_Y - drop * t,
        0.111 + (BUCKET_Z - 0.111) * t + 0.018 * Math.sin(Math.PI * t)
    );
    const looseTangent = (t: number) => new THREE.Vector3(
        0,
        -drop,
        BUCKET_Z - 0.111 + 0.018 * Math.PI * Math.cos(Math.PI * t)
    );

    rope.add(surfaceMesh({
        name: "RopeToBucketBail",
        geometry: sweepSection({
            path: { at: looseAt, tangent: looseTangent },
            sectionAt: section,
            startingFrame: startFrame(looseAt, looseTangent),
            stations: Array.from({ length: 13 }, (_, i) => i / 12),
            ends: "cap"
        }),
        materials: hemp
    }));

    return rope;
}
