import * as THREE from "three";

import { oakPlank, oakPlankPanel, oakTimberShop } from "./components/oakSeating";
import {
    CHAIR,
    CHAIR_FRONT_SEAT,
    CHAIR_BACK_INFILL,
    buildChairFrameGeometry,
    buildChairRearSeatGeometry,
    buildChairCrestGeometry,
    chairBackTransform,
    chairCrestTransform
} from "./components/chairGeometry";
import { cm } from "../toolbox/units/length";

export default {
    create,
    slug: "tavern-chair",
    title: "Oak Tavern Chair",
    description: "A pegged oak frame chair with a boarded seat and a raked, panelled back.",
    category: "furniture" as const
};

function create(): THREE.Group {
    const chair = new THREE.Group();
    chair.name = "TavernChair";

    const seatCenterY = CHAIR.seatHeight - CHAIR.seatThickness / 2;
    const front = oakPlankPanel(CHAIR_FRONT_SEAT);
    front.position.set(
        0,
        seatCenterY,
        (CHAIR.seatFront + CHAIR.frontBoardBack) / 2
    );
    chair.add(front);

    const rear = oakPlank(
        "RearSeatBoardWithCornerHousings",
        buildChairRearSeatGeometry(),
        6,
        0.97,
        { u: cm(3), v: cm(13) }
    );
    rear.position.y = seatCenterY;
    chair.add(rear);

    const wood = oakTimberShop(5);
    const frame = buildChairFrameGeometry();

    // The shared workshop handles oak, end grain, UVs and tints.
    // All contact geometry is already authored before rendering starts.
    for (const [name, timber] of frame.posts) {
        chair.add(wood.timberFromGeometry(name, timber));
    }

    for (const { name, timber } of frame.rails) {
        chair.add(wood.timberFromGeometry(name, timber));
    }

    const back = oakPlankPanel(CHAIR_BACK_INFILL);
    const placement = chairBackTransform();
    back.position.copy(placement.position);
    back.quaternion.copy(placement.quaternion);
    chair.add(back);

    const crest = oakPlank(
        "ShapedCrestRail",
        buildChairCrestGeometry(),
        4,
        0.965,
        { u: cm(2), v: cm(12) }
    );
    const crestPlacement = chairCrestTransform();
    crest.rotation.x = crestPlacement.rotationX;
    crest.position.copy(crestPlacement.position);
    chair.add(crest);

    for (const { name, point, outward, radius } of frame.pegs) {
        chair.add(wood.peg(name, point, outward, radius));
    }

    return chair;
}
