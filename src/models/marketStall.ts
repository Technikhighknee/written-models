import * as THREE from "three";

import {
    tableTimberGeometry,
    tableTimberBetweenSurfaces,
    type TableTimberGeometry
} from "./components/tableTimberGeometry";
import { oakTimberShop } from "./components/oakSeating";

const HALF_WIDTH = 1.05;
const HALF_DEPTH = 0.62;
const POST_SIZE = 0.115;
const POST_HEIGHT = 2.25;
const COUNTER_FRAME_HEIGHT = 0.85;
const RAIL_SIZE = 0.095;
const SIDES = [-1, 1] as const;

const point = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z);

export default {
    slug: "market-stall",
    title: "Medieval Market Stall",
    description: "The joined oak post-and-rail frame of a market stall.",
    category: "architecture" as const,
    create
};

function create(): THREE.Group {
    const stall = new THREE.Group();
    stall.name = "MedievalMarketStall";

    const workshop = oakTimberShop(3);
    const posts = new Map<string, TableTimberGeometry>();

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

    function addRail(
        name: string,
        from: readonly [number, number],
        to: readonly [number, number]
    ): void {
        const near = (position: readonly [number, number]) =>
            point(position[0], COUNTER_FRAME_HEIGHT, position[1]);

        const member = tableTimberBetweenSurfaces({
            first: {
                target: surfaceOf(postAt(...from)),
                near: near(from)
            },
            last: {
                target: surfaceOf(postAt(...to)),
                near: near(to)
            },
            width: RAIL_SIZE,
            depth: RAIL_SIZE,
            referenceDirection: point(0, 1, 0)
        });

        stall.add(workshop.timberFromGeometry(name, member));
    }

    // Four posts and four face-fitted rails form one coherent frame.
    // The sales planks, lower shelf and roof will follow in later stages.
    for (const sideZ of SIDES) {
        const z = sideZ * HALF_DEPTH;
        addRail(
            `CounterLongRail-${sideZ}`,
            [-HALF_WIDTH, z],
            [HALF_WIDTH, z]
        );
    }
    for (const sideX of SIDES) {
        const x = sideX * HALF_WIDTH;
        addRail(
            `CounterEndRail-${sideX}`,
            [x, -HALF_DEPTH],
            [x, HALF_DEPTH]
        );
    }

    return stall;
}
