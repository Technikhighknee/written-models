import * as THREE from "three";

import {
    tableTimberGeometry,
    tableTimberBetweenSurfaces,
    type TableTimberGeometry
} from "./components/tableTimberGeometry";
import { oakPlankPanel, oakTimberShop } from "./components/oakSeating";

const HALF_WIDTH = 1.05;
const HALF_DEPTH = 0.62;
const POST_SIZE = 0.115;
const POST_HEIGHT = 2.25;
const COUNTER_FRAME_HEIGHT = 0.85;
const RAIL_SIZE = 0.095;
const FRAME_TOP = COUNTER_FRAME_HEIGHT + RAIL_SIZE / 2;
const COUNTER_DEPTH = 0.66;
const COUNTER_LENGTH = 1.975;
const COUNTER_CENTER_Z = 0.43;
const SIDES = [-1, 1] as const;

const point = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z);

export default {
    slug: "market-stall",
    title: "Medieval Market Stall",
    description: "An oak sales counter supported by a fitted frame, open to the merchant behind.",
    category: "architecture" as const,
    create
};

function create(): THREE.Group {
    const stall = new THREE.Group();
    stall.name = "MedievalMarketStall";

    const workshop = oakTimberShop(3);
    const posts = new Map<string, TableTimberGeometry>();
    const sideRails = new Map<number, TableTimberGeometry>();

    const key = (x: number, z: number) => `${x}:${z}`;
    const postAt = (x: number, z: number) => {
        const post = posts.get(key(x, z));
        if (!post) throw new Error("Market stall post is missing");
        return post;
    };
    const surfaceOf = (member: TableTimberGeometry) => ({
        geometry: member.geometry.geometry,
        localToWorld: member.localToParent
    });

    // Build the supports first. Every rail is fitted to these actual
    // finite faces, rather than independently guessing its endpoints.
    for (const sideX of SIDES) {
        for (const sideZ of SIDES) {
            const x = sideX * HALF_WIDTH;
            const z = sideZ * HALF_DEPTH;
            const post = tableTimberGeometry(
                point(x, 0, z),
                point(x, POST_HEIGHT, z),
                POST_SIZE, POST_SIZE
            );
            posts.set(key(x, z), post);
            stall.add(workshop.timberFromGeometry(
                `Post-${sideX}-${sideZ}`, post
            ));
        }
    }

    function addBetween(
        name: string,
        first: TableTimberGeometry,
        last: TableTimberGeometry,
        from: THREE.Vector3,
        to: THREE.Vector3,
        height: number,
        depth: number
    ): TableTimberGeometry {
        const member = tableTimberBetweenSurfaces({
            first: { target: surfaceOf(first), near: from },
            last: { target: surfaceOf(last), near: to },
            width: height,
            depth,
            referenceDirection: point(0, 1, 0)
        });
        stall.add(workshop.timberFromGeometry(name, member));
        return member;
    }

    function addRail(
        name: string,
        from: readonly [number, number],
        to: readonly [number, number]
    ): TableTimberGeometry {
        return addBetween(
            name, postAt(...from), postAt(...to),
            point(from[0], COUNTER_FRAME_HEIGHT, from[1]),
            point(to[0], COUNTER_FRAME_HEIGHT, to[1]),
            RAIL_SIZE, RAIL_SIZE
        );
    }

    // +Z faces customers; -Z is the merchant's entrance.
    // Leave the entire rear span open from the ground upward.
    // The counter occupies only the front part of this U-shaped frame,
    // preserving working space behind the boards.
    const frontBearer = addRail(
        "CounterFrontRail",
        [-HALF_WIDTH, HALF_DEPTH],
        [HALF_WIDTH, HALF_DEPTH]
    );
    for (const sideX of SIDES) {
        const x = sideX * HALF_WIDTH;
        const rail = addRail(
            `CounterEndRail-${sideX}`,
            [x, -HALF_DEPTH],
            [x, HALF_DEPTH]
        );
        sideRails.set(sideX, rail);
    }

    // A rear bearer joins the existing side rails; the customer's
    // front bearer is already part of the U-shaped post frame.
    const backZ = 0.115;
    const backHeight = 0.087;
    const backY = FRAME_TOP - backHeight / 2;
    const backBearer = addBetween(
        "CounterRearBearer",
        sideRails.get(-1)!, sideRails.get(1)!,
        point(-HALF_WIDTH, backY, backZ),
        point(HALF_WIDTH, backY, backZ),
        backHeight, 0.075
    );

    // Three joists carry the countertop almost to its end grain.
    // Their upper faces share the same elevation as both supporting rails.
    const joistHeight = 0.079;
    const joistY = FRAME_TOP - joistHeight / 2;
    for (const x of [-0.83, 0, 0.83]) {
        addBetween(
            `CounterJoist-${x}`,
            backBearer, frontBearer,
            point(x, joistY, backZ),
            point(x, joistY, HALF_DEPTH),
            joistHeight, 0.075
        );
    }

    const planks = oakPlankPanel({
        name: "SalesCounterBoards",
        length: COUNTER_LENGTH,
        depth: COUNTER_DEPTH,
        thickness: 0.044,
        planks: 5,
        widthWeights: [1.07, 0.94, 1.03, 0.96, 1.00],
        seed: 1402,
        gap: 0.003,
        wear: 0.50,
        crown: 0.00055
    });
    planks.position.set(
        0,
        FRAME_TOP + 0.044 / 2,
        COUNTER_CENTER_Z
    );
    stall.add(planks);

    // A single vertical apron closes the otherwise exposed front framing.
    // Its rear face meets the front rail; the counter overhangs it toward
    // the customer. It terminates short of the post faces, like the top.
    const apronHeight = 0.15;
    const apronThickness = 0.028;
    const apron = oakPlankPanel({
        name: "CounterFrontApron",
        length: COUNTER_LENGTH,
        depth: apronHeight,
        thickness: apronThickness,
        planks: 1,
        seed: 321,
        gap: 0,
        wear: 0.25,
        crown: 0.0003
    });
    apron.rotation.x = Math.PI / 2;
    apron.position.set(
        0,
        FRAME_TOP - apronHeight / 2,
        HALF_DEPTH + RAIL_SIZE / 2 + apronThickness / 2
    );
    stall.add(apron);

    return stall;
}
