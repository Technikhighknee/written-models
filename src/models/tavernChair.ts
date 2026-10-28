import * as THREE from "three";
import {oakPlank, oakPlankPanel, oakTimberShop} from "./components/oakSeating";
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
    description: "A sturdy oak chair with raked back posts, pegged stretchers and a framed, three-plank back."
};

function create(): THREE.Group {
    const chair = new THREE.Group();
    chair.name = "TavernChair";
    const shop = oakTimberShop(5);

    const seatHeight = cm(46.5);
    const seatThickness = cm(4.1);
    const seatCenterY = seatHeight - seatThickness / 2;
    const legTop = seatHeight - seatThickness;

    // The full-width seat has three boards. The rear plank has cut-outs
    // around both continuous back posts, rather than ending between them.
    const seatLength = cm(48.4);
    const frontSeat = oakPlankPanel({
        name: "FrontSeatBoards",
        length: seatLength,
        depth: cm(27.2),
        thickness: seatThickness,
        planks: 2,
        seed: 412,
        widthWeights: [1.07, 0.93],
        gap: mm(2.2),
        wear: 0.55,
        crown: mm(0.65)
    });
    frontSeat.position.set(0, seatCenterY, cm(6.4));
    chair.add(frontSeat);

    // Rear posts pass through corner cut-outs. The middle of the plank
    // extends behind them; its outboard ends clear their front faces.
    // profiledBoard constructs the stepped outline as real geometry.
    const edgeAt = (t: number) => {
        const x = Math.abs((t - 0.5) * seatLength);
        const notch = THREE.MathUtils.smoothstep(x, cm(16.8), cm(18.0));
        const handPlaned = mm(0.55) * Math.sin(Math.PI * 2 * t + 0.7);
        return -cm(25.1) + cm(5.45) * notch + handPlaned;
    };
    const controlXs = [
        -seatLength / 2, -cm(19.0), -cm(18.5), -cm(18.2),
        -cm(17.9), -cm(17.6), -cm(17.4), -cm(16.8),
        0, cm(16.8), cm(17.4), cm(17.6), cm(17.9),
        cm(18.2), cm(18.5), cm(19.0), seatLength / 2
    ];
    const rearPlank = profiledBoard({
        length: seatLength,
        thickness: seatThickness,
        chamfer: mm(2.4),
        crown: mm(0.65),
        leftEdge: edgeAt,
        rightEdge: t => -cm(7.55) + mm(0.45) *
            Math.sin(2 * Math.PI * t + 1.2),
        longitudinalStations: controlXs.map(x => x / seatLength + 0.5),
        start: {cornerWear: [mm(1.2), mm(1.0)]},
        end: {cornerWear: [mm(1.0), mm(1.4)]}
    });
    const backSeat = oakPlank(
        "RearNotchedSeatPlank",
        rearPlank, 6, 0.978,
        {u: cm(4.5), v: cm(14.0)}
    );
    backSeat.position.y = seatCenterY;
    chair.add(backSeat);

    // The rear legs continue into the backrest as single raked timbers.
    // All four feet are cut against the floor plane, not simply squared
    // off perpendicular to their angled centerlines.
    const frontLegX = cm(18.7);
    const backLegX = cm(21.5);
    const frontLegZ = cm(16.3);
    const rearFootZ = -cm(20.4);
    const rearTopZ = -cm(27.0);
    const rearTop = cm(94);
    const post = cm(6.6);

    for (const side of [-1, 1] as const) {
        const frontName = side < 0 ? "Left" : "Right";
        const frontX = side * frontLegX;
        const rearX = side * backLegX;

        chair.add(shop.timber(
            `${frontName}FrontLeg`,
            new THREE.Vector3(frontX * 1.035, 0, cm(18.3)),
            new THREE.Vector3(frontX, legTop, frontLegZ),
            post, post, {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, -1, 0)
            }
        ));

        chair.add(shop.timber(
            `${frontName}BackPost`,
            new THREE.Vector3(rearX * 1.015, 0, rearFootZ),
            new THREE.Vector3(rearX, rearTop, rearTopZ),
            post, post, {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, -1, 0)
            }
        ));

        const frontInsideZ = cm(12.9);
        const rearInsideZ = -cm(20.5);
        const sideXFront = side * frontLegX;
        const sideXRear = side * backLegX;

        for (const [name, y, thickness] of [
            ["UpperSideApron", cm(38.5), cm(6.7)],
            ["LowerSideStretcher", cm(18.0), cm(4.5)]
        ] as const) {
            chair.add(shop.timber(
                `${frontName}${name}`,
                new THREE.Vector3(sideXFront, y, frontInsideZ),
                new THREE.Vector3(sideXRear, y, rearInsideZ),
                cm(4.6), thickness, {
                    startNormal: new THREE.Vector3(0, 0, -1),
                    endNormal: new THREE.Vector3(0, 0, 1)
                }
            ));
        }

        // Pins sit on the visible front and outer side faces of the posts.
        chair.add(shop.peg(
            `${frontName}FrontJointPin`,
            new THREE.Vector3(frontX, cm(38.5), frontLegZ + post / 2),
            new THREE.Vector3(0, 0, 1),
            mm(5.7)
        ));
        chair.add(shop.peg(
            `${frontName}BackJointPin`,
            new THREE.Vector3(
                rearX + side * post / 2, cm(39), -cm(23.2)
            ),
            new THREE.Vector3(side, 0, 0),
            mm(5.7)
        ));
    }

    // The aprons carry the seat on four sides and tie the posts together.
    const frontInsideX = frontLegX - post / 2;
    const backInsideX = backLegX - post / 2;
    chair.add(shop.timber(
        "FrontSeatApron",
        new THREE.Vector3(-frontInsideX, cm(38.2), frontLegZ),
        new THREE.Vector3(frontInsideX, cm(38.2), frontLegZ),
        cm(7.0), cm(5.2)
    ));
    chair.add(shop.timber(
        "RearSeatApron",
        new THREE.Vector3(-backInsideX, cm(38.2), -cm(23.0)),
        new THREE.Vector3(backInsideX, cm(38.2), -cm(23.0)),
        cm(7), cm(4.7)
    ));
    chair.add(shop.timber(
        "FrontLowStretcher",
        new THREE.Vector3(-frontInsideX, cm(18), cm(17.3)),
        new THREE.Vector3(frontInsideX, cm(18), cm(17.3)),
        cm(4.3), cm(4.5)
    ));

    const back = oakPlankPanel({
        name: "VerticalBackPlanks",
        length: cm(23.8),
        depth: cm(36.2),
        thickness: cm(2.65),
        planks: 3,
        widthWeights: [0.96, 1.08, 0.96],
        gap: mm(1.6),
        seed: 625,
        wear: 0.68,
        crown: mm(0.35)
    });

    // Local plank X follows the raked back; Z follows the seat width.
    const slope = (rearTopZ - rearFootZ) / rearTop;
    const vertical = new THREE.Vector3(0, 1, slope).normalize();
    const facing = new THREE.Vector3(0, -slope, 1).normalize();
    back.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
        vertical, facing, new THREE.Vector3(1, 0, 0)
    ));
    back.position.set(0, cm(75.6), -cm(25.8));
    chair.add(back);

    // A shaped, raised crest and a separate lower bearer frame the back
    // boards. The crest's silhouette is authored, not a decorative texture.
    const crest = profiledBoard({
        length: cm(42.5),
        thickness: cm(3.0),
        chamfer: mm(2),
        crown: mm(0.45),
        leftEdge: t => -cm(3.6) - cm(0.3) * Math.sin(Math.PI * t) ** 2,
        rightEdge: t => cm(3.5) + cm(1.25) * Math.sin(Math.PI * t) ** 2,
        start: {cornerWear: [mm(1.3), mm(1.8)]},
        end: {cornerWear: [mm(1.5), mm(1.4)]}
    });
    offsetMeshUvs(crest, cm(3), cm(12));
    const crestOak = oakVariant(4);
    const crestGeometry = tintVertices(
        toBufferGeometry(crest, {
            outer: 0, inner: 0, "edge-left": 0, "edge-right": 0,
            "cap-start": 1, "cap-end": 1
        }),
        new THREE.Color(0.966, 0.966, 0.966)
    );
    const crestMesh = new THREE.Mesh(crestGeometry, [
        oakBoardFace(4), crestOak.tinted.endGrain
    ]);
    crestMesh.name = "CurvedCrestRail";
    crestMesh.rotation.x = -Math.PI / 2;
    crestMesh.position.set(0, cm(88.3), -cm(26.8));
    chair.add(crestMesh);

    chair.add(shop.timber(
        "LowerBackBearer",
        new THREE.Vector3(-backInsideX, cm(63.2), -cm(24.9)),
        new THREE.Vector3(backInsideX, cm(63.2), -cm(24.9)),
        cm(4.4), cm(4.4)
    ));

    return chair;
}
