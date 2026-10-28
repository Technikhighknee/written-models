import * as THREE from "three";

import {oakPlank, oakPlankPanel, oakTimberShop} from "./components/oakSeating";
import {piercedBoard} from "../toolbox/geometry/construction/piercedBoard";
import {profiledBoard} from "../toolbox/geometry/construction/profiledBoard";
import {toBufferGeometry} from "../toolbox/geometry/mesh/toBufferGeometry";
import {tintVertices} from "../toolbox/geometry/materials/tintVertices";
import {offsetMeshUvs} from "../toolbox/geometry/uv/offsetMeshUvs";
import {oakBoardFace, oakVariant} from "../materials/wood/oak";
import {cm, mm} from "../toolbox/units/length";

export default {
    create,
    slug: "tavern-chair",
    title: "Oak Tavern Chair",
    description: "A pegged oak frame chair with a boarded seat and a raked, panelled back."
};

const SEAT_HEIGHT = cm(46);
const SEAT_THICKNESS = cm(3.8);
const SEAT_UNDERSIDE = SEAT_HEIGHT - SEAT_THICKNESS;
const APRON_Y = SEAT_UNDERSIDE - cm(8.3) / 2;
const SEAT_WIDTH = cm(47);
const SEAT_BACK = -cm(26.2);
const SEAT_REAR_BOARD_FRONT = -cm(8.7);
const SEAT_FRONT_BOARD_BACK = -cm(8.5);
const SEAT_FRONT = cm(21);

const FRONT_X = cm(18.5);
const FRONT_Z = cm(16.0);
const REAR_X = cm(18.5);
const REAR_FOOT_Z = -cm(17.3);
const REAR_TOP_Z = -cm(24.5);
const REAR_HEIGHT = cm(96);
const FRONT_POST_SIZE = cm(6.2);
const BACK_POST_SIZE = cm(6.6);

function rearZ(height: number): number {
    return REAR_FOOT_Z +
        (REAR_TOP_Z - REAR_FOOT_Z) * height / REAR_HEIGHT;
}

function rearFront(height: number): number {
    return rearZ(height) + BACK_POST_SIZE / 2;
}

function create(): THREE.Group {
    const chair = new THREE.Group();
    chair.name = "TavernChair";
    const oak = oakTimberShop(5);

    addSeat(chair);

    addPosts(chair, oak);
    addSeatFrame(chair, oak);
    addBack(chair, oak);
    addDrawPegs(chair, oak);
    return chair;
}

type Workshop = ReturnType<typeof oakTimberShop>;

function addSeat(chair: THREE.Group): void {
    const seatCenterY = SEAT_HEIGHT - SEAT_THICKNESS / 2;

    const front = oakPlankPanel({
        name: "FrontSeatBoards",
        length: SEAT_WIDTH,
        depth: SEAT_FRONT - SEAT_FRONT_BOARD_BACK,
        thickness: SEAT_THICKNESS,
        planks: 2,
        widthWeights: [1.05, 0.95],
        gap: mm(1.8),
        seed: 412,
        wear: 0.5,
        crown: mm(0.6)
    });
    front.position.set(
        0, seatCenterY, (SEAT_FRONT + SEAT_FRONT_BOARD_BACK) / 2
    );
    chair.add(front);

    const slope = (REAR_TOP_Z - REAR_FOOT_Z) / REAR_HEIGHT;
    const halfStileDepth = BACK_POST_SIZE / 2 *
        Math.sqrt(1 + slope * slope);
    const clearance = mm(1.5);
    const openingAt = (height: number): readonly [number, number] => [
        rearZ(height) - halfStileDepth - clearance,
        rearZ(height) + halfStileDepth + clearance
    ];

    const rear = piercedBoard({
        width: SEAT_WIDTH,
        depth: SEAT_REAR_BOARD_FRONT - SEAT_BACK,
        centerZ: (SEAT_BACK + SEAT_REAR_BOARD_FRONT) / 2,
        thickness: SEAT_THICKNESS,
        crown: mm(0.6),
        bevel: mm(1.3),
        openings: ([-1, 1] as const).map(side => ({
            minX: side * REAR_X - BACK_POST_SIZE / 2 - clearance,
            maxX: side * REAR_X + BACK_POST_SIZE / 2 + clearance,
            topZ: openingAt(SEAT_HEIGHT),
            bottomZ: openingAt(SEAT_UNDERSIDE)
        }))
    });
    const backBoard = oakPlank(
        "RearSeatBoardWithStileMortises",
        rear, 6, 0.97,
        {u: cm(3), v: cm(13)}
    );
    backBoard.position.y = seatCenterY;
    chair.add(backBoard);
}

function addPosts(chair: THREE.Group, oak: Workshop): void {
    for (const sign of [-1, 1] as const) {
        const side = sign < 0 ? "Left" : "Right";

        // Front legs stop against the underside of the seat; the seat
        // remains a complete, uninterrupted wooden panel.
        chair.add(oak.timber(
            `${side}FrontLeg`,
            new THREE.Vector3(sign * (FRONT_X + mm(3)), 0, FRONT_Z + mm(9)),
            new THREE.Vector3(sign * FRONT_X, SEAT_UNDERSIDE, FRONT_Z),
            FRONT_POST_SIZE, FRONT_POST_SIZE,
            {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, -1, 0)
            }
        ));

        // Each rear leg and back upright is a SINGLE continuous timber.
        // Its rake also moves the back clear of the rear seat edge.
        chair.add(oak.timber(
            `${side}BackStile`,
            new THREE.Vector3(sign * REAR_X, 0, REAR_FOOT_Z),
            new THREE.Vector3(sign * REAR_X, REAR_HEIGHT, REAR_TOP_Z),
            BACK_POST_SIZE, BACK_POST_SIZE,
            {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, -1, 0)
            }
        ));
    }
}

function addSeatFrame(chair: THREE.Group, oak: Workshop): void {
    const innerFront = FRONT_X - FRONT_POST_SIZE / 2;
    const innerRear = REAR_X - BACK_POST_SIZE / 2;

    // Four rails form the rigid, mortise-and-tenon-style seat box.
    // Cross-grain sizes follow the actual beam axes: across-X beams
    // take their vertical height from the local width dimension.
    chair.add(oak.timber(
        "FrontSeatRail",
        new THREE.Vector3(-innerFront, APRON_Y, FRONT_Z),
        new THREE.Vector3(innerFront, APRON_Y, FRONT_Z),
        cm(8.3), cm(4.2),
        {
            startNormal: new THREE.Vector3(1, 0, 0),
            endNormal: new THREE.Vector3(-1, 0, 0)
        }
    ));

    const rearRailY = APRON_Y;
    const rearRailZ = rearZ(rearRailY) + cm(3);
    chair.add(oak.timber(
        "RearSeatRail",
        new THREE.Vector3(-innerRear, rearRailY, rearRailZ),
        new THREE.Vector3(innerRear, rearRailY, rearRailZ),
        cm(8.3), cm(4.2),
        {
            startNormal: new THREE.Vector3(1, 0, 0),
            endNormal: new THREE.Vector3(-1, 0, 0)
        }
    ));

    for (const sign of [-1, 1] as const) {
        const side = sign < 0 ? "Left" : "Right";

        function sideRail(name: string, height: number, depth: number): void {
            const frontContact = new THREE.Vector3(
                sign * FRONT_X, height, FRONT_Z - FRONT_POST_SIZE / 2
            );
            const backContact = new THREE.Vector3(
                sign * REAR_X, height, rearFront(height)
            );
            chair.add(oak.timber(
                `${side}${name}`,
                frontContact,
                backContact,
                cm(4.4),
                depth,
                {
                    startNormal: new THREE.Vector3(0, 0, -1),
                    endNormal: new THREE.Vector3(0, 0, 1)
                }
            ));
        }

        sideRail("SeatApron", APRON_Y, cm(8.3));
        sideRail("LowerStretcher", cm(18), cm(4.5));
    }

    // The lower rails lock all four legs together below the seat frame.
    chair.add(oak.timber(
        "FrontLowStretcher",
        new THREE.Vector3(-innerFront, cm(18), FRONT_Z),
        new THREE.Vector3(innerFront, cm(18), FRONT_Z),
        cm(4.4), cm(4.2),
        {
            startNormal: new THREE.Vector3(1, 0, 0),
            endNormal: new THREE.Vector3(-1, 0, 0)
        }
    ));
    chair.add(oak.timber(
        "RearLowStretcher",
        new THREE.Vector3(-innerRear, cm(18), rearZ(cm(18))),
        new THREE.Vector3(innerRear, cm(18), rearZ(cm(18))),
        cm(4.4), cm(4.2),
        {
            startNormal: new THREE.Vector3(1, 0, 0),
            endNormal: new THREE.Vector3(-1, 0, 0)
        }
    ));
}

function addBack(chair: THREE.Group, oak: Workshop): void {
    const inner = REAR_X - BACK_POST_SIZE / 2;
    const rake = (REAR_TOP_Z - REAR_FOOT_Z) / REAR_HEIGHT;
    const upright = new THREE.Vector3(0, 1, rake).normalize();
    const forward = new THREE.Vector3(0, -rake, 1).normalize();
    const across = new THREE.Vector3(1, 0, 0);

    // The central boards fit INSIDE the two long stiles, between real
    // bearing rails. The broad faces follow the rake of the back.
    const backBoards = oakPlankPanel({
        name: "BackInfill",
        length: cm(32),
        depth: inner * 2 - mm(5),
        thickness: cm(2.5),
        planks: 3,
        widthWeights: [0.96, 1.08, 0.96],
        gap: mm(1.7),
        seed: 625,
        wear: 0.55,
        crown: mm(0.5)
    });
    backBoards.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(upright, forward, across)
    );
    const backCenterY = cm(70);
    backBoards.position.set(
        0, backCenterY,
        rearZ(backCenterY) + cm(1.35)
    );
    chair.add(backBoards);

    // Lower bearer and raised crest trap the panel within the posts.
    const lowerY = cm(54);
    chair.add(oak.timber(
        "LowerBackRail",
        new THREE.Vector3(-inner, lowerY, rearZ(lowerY) + cm(1.3)),
        new THREE.Vector3(inner, lowerY, rearZ(lowerY) + cm(1.3)),
        cm(5.2), cm(4.1),
        {
            startNormal: new THREE.Vector3(1, 0, 0),
            endNormal: new THREE.Vector3(-1, 0, 0)
        }
    ));

    const crown = profiledBoard({
        length: inner * 2 - mm(2),
        thickness: cm(3),
        chamfer: mm(2.4),
        crown: mm(0.6),
        leftEdge: t => -cm(4.7) + mm(0.45) * Math.sin(Math.PI * t),
        rightEdge: t => cm(4.8) + cm(0.85) * Math.sin(Math.PI * t) ** 2,
        start: {cornerWear: [mm(1.1), mm(1.4)]},
        end: {cornerWear: [mm(1.6), mm(1.2)]}
    });
    offsetMeshUvs(crown, cm(2), cm(12));
    const material = oakVariant(4);
    const geometry = tintVertices(
        toBufferGeometry(crown, {
            outer: 0, inner: 0, "edge-left": 0, "edge-right": 0,
            "cap-start": 1, "cap-end": 1
        }),
        new THREE.Color(0.965, 0.965, 0.965)
    );
    const crest = new THREE.Mesh(geometry, [
        oakBoardFace(4), material.tinted.endGrain
    ]);
    crest.name = "ShapedCrestRail";
    // Local +Z across the board becomes world +Y.
    crest.rotation.x = -Math.PI / 2 + Math.atan(rake);
    const crownY = cm(89.0);
    crest.position.set(0, crownY, rearZ(crownY) + cm(1.35));
    chair.add(crest);
}

function addDrawPegs(chair: THREE.Group, oak: Workshop): void {
    for (const sign of [-1, 1] as const) {
        const side = sign < 0 ? "Left" : "Right";

        for (const [name, y, z] of [
            ["Seat", APRON_Y, FRONT_Z],
            ["Stretcher", cm(18), FRONT_Z]
        ] as const) {
            chair.add(oak.peg(
                `${side}Front${name}Drawpeg`,
                new THREE.Vector3(
                    sign * (FRONT_X + FRONT_POST_SIZE / 2), y, z
                ),
                new THREE.Vector3(sign, 0, 0),
                mm(5)
            ));
        }

        for (const [name, y] of [
            ["Seat", APRON_Y],
            ["Stretcher", cm(18)],
            ["LowerBack", cm(54)],
            ["Crest", cm(89.0)]
        ] as const) {
            chair.add(oak.peg(
                `${side}Back${name}Drawpeg`,
                new THREE.Vector3(
                    sign * (REAR_X + BACK_POST_SIZE / 2),
                    y, rearZ(y)
                ),
                new THREE.Vector3(sign, 0, 0),
                mm(5.5)
            ));
        }
    }
}
