import * as THREE from "three";

import {oakPlank, oakPlankPanel, oakTimberShop} from "./components/oakSeating";
import {cutBoard} from "../toolbox/geometry/construction/cutBoard";
import {profiledBoard} from "../toolbox/geometry/construction/profiledBoard";
import {toBufferGeometry} from "../toolbox/geometry/mesh/toBufferGeometry";
import {tintVertices} from "../toolbox/geometry/materials/tintVertices";
import {offsetMeshUvs} from "../toolbox/geometry/uv/offsetMeshUvs";
import {oakBoardFace, oakVariant} from "../materials/wood/oak";
import {cm, mm} from "../toolbox/units/length";
import {supportFacePlane, pointOnContactPlane} from "../toolbox/geometry/construction/supportFacePlane";

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
const SEAT_WIDTH = cm(49);
const SEAT_BACK = -cm(26.2);
const SEAT_REAR_BOARD_FRONT = -cm(8.7);
const SEAT_FRONT_BOARD_BACK = -cm(8.5);
const SEAT_FRONT = cm(21);

const FRONT_X = cm(18.5);
const FRONT_Z = cm(16.0);
const REAR_X = cm(20.5);
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

    const posts = addPosts(chair, oak);
    addSeatFrame(chair, oak, posts);
    addBack(chair, oak, posts);
    addDrawPegs(chair, oak, posts);
    return chair;
}

type Workshop = ReturnType<typeof oakTimberShop>;
type Side = -1 | 1;

interface ChairPosts {
    front: Map<Side, THREE.Mesh>;
    rear: Map<Side, THREE.Mesh>;
}

/** Trim each end to the actual authored surface of its supporting timber. */
function fittedRail(
    chair: THREE.Group,
    oak: Workshop,
    name: string,
    first: THREE.Mesh,
    last: THREE.Mesh,
    firstHint: THREE.Vector3,
    lastHint: THREE.Vector3,
    firstFacing: THREE.Vector3,
    lastFacing: THREE.Vector3,
    castingAxis: THREE.Vector3,
    width: number,
    depth: number
): void {
    const startPlane = supportFacePlane(first, firstFacing);
    const endPlane = supportFacePlane(last, lastFacing);
    const start = pointOnContactPlane(startPlane, firstHint, castingAxis);
    const end = pointOnContactPlane(endPlane, lastHint, castingAxis);
    chair.add(oak.timber(
        name, start, end, width, depth,
        {startNormal: startPlane.normal, endNormal: endPlane.normal}
    ));
}

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

    // The rear board extends between the back stiles. Open housings at
    // its corners follow the posts, while the front edge stays continuous.
    const clearance = mm(2.6);
    const innerStileFaceX = REAR_X - BACK_POST_SIZE / 2;
    const cheekX = innerStileFaceX - clearance;
    const frontOfStile = (height: number) =>
        rearFront(height) + clearance;

    const rear = cutBoard({
        width: SEAT_WIDTH,
        depth: SEAT_REAR_BOARD_FRONT - SEAT_BACK,
        centerZ: (SEAT_BACK + SEAT_REAR_BOARD_FRONT) / 2,
        thickness: SEAT_THICKNESS,
        crown: mm(0.6),
        bevel: mm(1.25),
        cuts: [
            {
                minX: -SEAT_WIDTH / 2,
                maxX: -cheekX,
                topZ: [SEAT_BACK, frontOfStile(SEAT_HEIGHT)],
                bottomZ: [SEAT_BACK, frontOfStile(SEAT_UNDERSIDE)]
            },
            {
                minX: cheekX,
                maxX: SEAT_WIDTH / 2,
                topZ: [SEAT_BACK, frontOfStile(SEAT_HEIGHT)],
                bottomZ: [SEAT_BACK, frontOfStile(SEAT_UNDERSIDE)]
            }
        ]
    });
    const backBoard = oakPlank(
        "RearSeatBoardWithCornerHousings",
        rear, 6, 0.97,
        {u: cm(3), v: cm(13)}
    );
    backBoard.position.y = seatCenterY;
    chair.add(backBoard);
}

function addPosts(chair: THREE.Group, oak: Workshop): ChairPosts {
    const posts: ChairPosts = {
        front: new Map(),
        rear: new Map()
    };
    for (const sign of [-1, 1] as const) {
        const side = sign < 0 ? "Left" : "Right";

        // Front legs finish against the bearing surface under the seat.
        const frontLeg = oak.timber(
            `${side}FrontLeg`,
            new THREE.Vector3(sign * (FRONT_X + mm(3)), 0, FRONT_Z + mm(9)),
            new THREE.Vector3(sign * FRONT_X, SEAT_UNDERSIDE, FRONT_Z),
            FRONT_POST_SIZE, FRONT_POST_SIZE,
            {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, -1, 0)
            }
        );
        chair.add(frontLeg);
        posts.front.set(sign, frontLeg);

        // Each rear leg continues into the backrest as a single timber.
        const backStile = oak.timber(
            `${side}BackStile`,
            new THREE.Vector3(sign * REAR_X, 0, REAR_FOOT_Z),
            new THREE.Vector3(sign * REAR_X, REAR_HEIGHT, REAR_TOP_Z),
            BACK_POST_SIZE, BACK_POST_SIZE,
            {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, -1, 0)
            }
        );
        chair.add(backStile);
        posts.rear.set(sign, backStile);
    }
    return posts;
}

function addSeatFrame(
    chair: THREE.Group,
    oak: Workshop,
    posts: ChairPosts
): void {
    const across = new THREE.Vector3(1, 0, 0);
    const towardBack = new THREE.Vector3(0, 0, -1);
    const towardFront = new THREE.Vector3(0, 0, 1);
    const left = posts.front.get(-1)!;
    const right = posts.front.get(1)!;
    const rearLeft = posts.rear.get(-1)!;
    const rearRight = posts.rear.get(1)!;
    const insideLeft = new THREE.Vector3(1, 0, 0);
    const insideRight = new THREE.Vector3(-1, 0, 0);

    for (const [name, height, width, depth] of [
        ["FrontSeatRail", APRON_Y, cm(8.3), cm(4.2)],
        ["FrontLowStretcher", cm(18), cm(4.4), cm(4.2)]
    ] as const) {
        fittedRail(
            chair, oak, name, left, right,
            new THREE.Vector3(-FRONT_X, height, FRONT_Z),
            new THREE.Vector3(FRONT_X, height, FRONT_Z),
            insideLeft, insideRight, across, width, depth
        );
    }

    for (const [name, height, width, depth] of [
        ["RearSeatRail", APRON_Y, cm(8.3), cm(4.2)],
        ["RearLowStretcher", cm(18), cm(4.4), cm(4.2)]
    ] as const) {
        fittedRail(
            chair, oak, name, rearLeft, rearRight,
            new THREE.Vector3(-REAR_X, height, rearZ(height)),
            new THREE.Vector3(REAR_X, height, rearZ(height)),
            insideLeft, insideRight, across, width, depth
        );
    }

    for (const sign of [-1, 1] as const) {
        const side = sign < 0 ? "Left" : "Right";
        for (const [name, height, depth] of [
            ["SeatApron", APRON_Y, cm(8.3)],
            ["LowerStretcher", cm(18), cm(4.5)]
        ] as const) {
            fittedRail(
                chair, oak, `${side}${name}`,
                posts.front.get(sign)!,
                posts.rear.get(sign)!,
                new THREE.Vector3(sign * FRONT_X, height, FRONT_Z),
                new THREE.Vector3(sign * REAR_X, height, rearZ(height)),
                towardBack, towardFront, towardBack,
                cm(4.4), depth
            );
        }
    }
}

function addBack(chair: THREE.Group, oak: Workshop, posts: ChairPosts): void {
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

    // The bearer meets the same inner faces as the lower stretchers.
    const lowerY = cm(54);
    fittedRail(
        chair, oak, "LowerBackRail",
        posts.rear.get(-1)!, posts.rear.get(1)!,
        new THREE.Vector3(-REAR_X, lowerY, rearZ(lowerY) + cm(1.3)),
        new THREE.Vector3(REAR_X, lowerY, rearZ(lowerY) + cm(1.3)),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(1, 0, 0),
        cm(5.2), cm(4.1)
    );

    const crown = profiledBoard({
        length: inner * 2,
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

function addDrawPegs(
    chair: THREE.Group,
    oak: Workshop,
    posts: ChairPosts
): void {
    for (const sign of [-1, 1] as const) {
        const side = sign < 0 ? "Left" : "Right";
        const outward = new THREE.Vector3(sign, 0, 0);

        function drawpeg(
            name: string,
            support: THREE.Mesh,
            height: number,
            z: number,
            radius: number
        ): void {
            const face = supportFacePlane(support, outward);
            const point = pointOnContactPlane(
                face,
                new THREE.Vector3(0, height, z),
                outward
            );
            chair.add(oak.peg(
                `${side}${name}Drawpeg`,
                point,
                new THREE.Vector3(
                    face.normal.x, face.normal.y, face.normal.z
                ),
                radius
            ));
        }

        for (const [name, y] of [
            ["Seat", APRON_Y],
            ["Stretcher", cm(18)]
        ] as const) {
            drawpeg(
                `Front${name}`, posts.front.get(sign)!,
                y, FRONT_Z, mm(5)
            );
        }

        for (const [name, y, offset] of [
            ["Seat", APRON_Y, 0],
            ["Stretcher", cm(18), 0],
            ["LowerBack", cm(54), cm(1.3)],
            ["Crest", cm(89), cm(1.3)]
        ] as const) {
            drawpeg(
                `Back${name}`, posts.rear.get(sign)!,
                y, rearZ(y) + offset, mm(5.5)
            );
        }
    }
}
