import * as THREE from "three";

import {
    tableTimberGeometry,
    tableTimberBetweenSurfaces,
    type TableTimberGeometry
} from "./components/tableTimberGeometry";
import {
    oakPanelGeometry, oakPlank, oakPlankPanel, oakTimberShop
} from "./components/oakSeating";
import { transformGeometry } from "../toolbox/geometry/edit/geometryEdits";
import { loftPairedSurfaceRows } from "../toolbox/geometry/build/loftPairedSurfaceRows";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { heavyCanvas } from "../materials/fabric/heavyCanvas";

const HALF_WIDTH = 1.05;
const HALF_DEPTH = 0.62;
const POST_SIZE = 0.115;
const POST_HEIGHT = 2.21;
const COUNTER_FRAME_HEIGHT = 0.85;
const RAIL_SIZE = 0.095;
const UPPER_FRAME_HEIGHT = 2.14;
const UPPER_RAIL_SIZE = 0.11;
const BRACE_START_HEIGHT = 1.75;
const FRAME_TOP = COUNTER_FRAME_HEIGHT + RAIL_SIZE / 2;
const COUNTER_DEPTH = 0.66;
const COUNTER_LENGTH = 2 * HALF_WIDTH + POST_SIZE;
const COUNTER_FRONT_BOARD_LENGTH = 1.975;
const COUNTER_APRON_LENGTH = 1.975;
const COUNTER_CENTER_Z = 0.365;
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
    const upperLongRails = new Map<number, TableTimberGeometry>();
    const upperEndRails = new Map<number, TableTimberGeometry>();

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
        depth: number,
        referenceDirection = point(0, 1, 0)
    ): TableTimberGeometry {
        const member = tableTimberBetweenSurfaces({
            first: { target: surfaceOf(first), near: from },
            last: { target: surfaceOf(last), near: to },
            width: height,
            depth,
            referenceDirection
        });
        stall.add(workshop.timberFromGeometry(name, member));
        return member;
    }

    function addRail(
        name: string,
        from: readonly [number, number],
        to: readonly [number, number],
        height = COUNTER_FRAME_HEIGHT,
        size = RAIL_SIZE
    ): TableTimberGeometry {
        return addBetween(
            name, postAt(...from), postAt(...to),
            point(from[0], height, from[1]),
            point(to[0], height, to[1]),
            size, size
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

    // The upper ring terminates on the actual post faces. None of the
    // four rails passes through a post or through another rail.
    for (const sideZ of SIDES) {
        const z = sideZ * HALF_DEPTH;
        const member = addRail(
            `UpperLongRail-${sideZ}`,
            [-HALF_WIDTH, z],
            [HALF_WIDTH, z],
            UPPER_FRAME_HEIGHT,
            UPPER_RAIL_SIZE
        );
        upperLongRails.set(sideZ, member);
    }
    for (const sideX of SIDES) {
        const x = sideX * HALF_WIDTH;
        const member = addRail(
            `UpperEndRail-${sideX}`,
            [x, -HALF_DEPTH],
            [x, HALF_DEPTH],
            UPPER_FRAME_HEIGHT,
            UPPER_RAIL_SIZE
        );
        upperEndRails.set(sideX, member);
    }

    // Both directions are braced. Each knee is cut against the inner
    // face of its post and the real lower face of the corresponding rail.
    const braceEndHeight = UPPER_FRAME_HEIGHT - UPPER_RAIL_SIZE / 2;
    for (const sideX of SIDES) {
        for (const sideZ of SIDES) {
            const x = sideX * HALF_WIDTH;
            const z = sideZ * HALF_DEPTH;
            const post = postAt(x, z);

            addBetween(
                `LongKnee-${sideX}-${sideZ}`,
                post,
                upperLongRails.get(sideZ)!,
                point(x - sideX * POST_SIZE / 2, BRACE_START_HEIGHT, z),
                point(sideX * 0.70, braceEndHeight, z),
                0.062,
                0.068,
                point(0, 0, 1)
            );
            addBetween(
                `EndKnee-${sideX}-${sideZ}`,
                post,
                upperEndRails.get(sideX)!,
                point(x, BRACE_START_HEIGHT, z - sideZ * POST_SIZE / 2),
                point(x, braceEndHeight, sideZ * 0.27),
                0.062,
                0.068,
                point(1, 0, 0)
            );
        }
    }

    // The ridge bears on the gable ties through two short king posts.
    // All three pieces are constructed from actual support surfaces.
    const ridgeHeight = 2.62;
    const ridgeSize = 0.105;
    const ridge = tableTimberGeometry(
        point(-1.125, ridgeHeight, 0),
        point(1.125, ridgeHeight, 0),
        ridgeSize, ridgeSize
    );
    stall.add(workshop.timberFromGeometry("RidgeBeam", ridge));

    for (const sideX of SIDES) {
        const x = sideX * HALF_WIDTH;
        addBetween(
            `RidgeSupport-${sideX}`,
            upperEndRails.get(sideX)!,
            ridge,
            point(x, UPPER_FRAME_HEIGHT + UPPER_RAIL_SIZE / 2, 0),
            point(x, ridgeHeight - ridgeSize / 2, 0),
            0.075,
            0.075,
            point(1, 0, 0)
        );
    }

    // Every rafter meets the ridge on its side face and bears on the
    // upper long rail's top face. Their actual end cuts follow the
    // contacted surfaces; no beam is sunk into its support.
    for (const x of [-0.96, -0.48, 0, 0.48, 0.96]) {
        for (const sideZ of SIDES) {
            const z = sideZ * HALF_DEPTH;
            addBetween(
                `Rafter-${x}-${sideZ}`,
                ridge,
                upperLongRails.get(sideZ)!,
                point(x, ridgeHeight, sideZ * ridgeSize / 2),
                point(x, UPPER_FRAME_HEIGHT + UPPER_RAIL_SIZE / 2, z),
                0.064,
                0.054,
                point(1, 0, 0)
            );
        }
    }

    // One continuous linen sheet folds over the ridge and sits just above
    // the rafters. The closed edge folds are real thin geometry, not a
    // double-sided plane. Slight slack between the five rafter positions
    // gives the taut fabric a softer silhouette without clipping wood.
    const roofTopAtRidge = ridgeHeight + ridgeSize / 2 + 0.008;
    const roofTopAtRafters = ridgeHeight + 0.033;
    const roofTopAtEaves = UPPER_FRAME_HEIGHT + UPPER_RAIL_SIZE / 2 + 0.034;
    const rafterPositions = [-0.96, -0.48, 0, 0.48, 0.96];
    const xStations = [-1.12, -0.96, -0.72, -0.48, -0.24, 0,
        0.24, 0.48, 0.72, 0.96, 1.12];
    const zStations = [-HALF_DEPTH, -0.48, -0.36, -0.24, -0.14,
        -ridgeSize / 2, 0, ridgeSize / 2,
        0.14, 0.24, 0.36, 0.48, HALF_DEPTH];

    function clothHeight(x: number, z: number): number {
        const distance = Math.abs(z);
        const onSlope = distance > ridgeSize / 2;
        const height = onSlope
            ? THREE.MathUtils.lerp(
                roofTopAtRafters,
                roofTopAtEaves,
                (distance - ridgeSize / 2) / (HALF_DEPTH - ridgeSize / 2)
            )
            : THREE.MathUtils.lerp(
                roofTopAtRidge,
                roofTopAtRafters,
                distance / (ridgeSize / 2)
            );

        const index = rafterPositions.findIndex((position, i) =>
            i < rafterPositions.length - 1 &&
            x >= position && x <= rafterPositions[i + 1]!
        );
        const between = index < 0 ? 0 :
            (x - rafterPositions[index]!) /
            (rafterPositions[index + 1]! - rafterPositions[index]!);
        const slack = 0.007 *
            Math.sin(Math.PI * between) ** 2 *
            Math.sin(Math.PI * distance / HALF_DEPTH) ** 2;

        return height - slack;
    }

    const roofThickness = 0.004;
    const roofGeometry = loftPairedSurfaceRows(xStations.map(x => ({
        outer: zStations.map(z =>
            point(x, clothHeight(x, z), z)
        ),
        inner: zStations.map(z =>
            point(x, clothHeight(x, z) - roofThickness, z)
        )
    })));
    const canvas = heavyCanvas();
    stall.add(surfaceMesh({
        name: "LinenRoof",
        geometry: roofGeometry,
        materials: {
            outer: canvas.outside,
            inner: canvas.inside,
            "edge-left": canvas.hem,
            "edge-right": canvas.hem,
            "cap-start": canvas.hem,
            "cap-end": canvas.hem
        }
    }));

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

    const boards = oakPanelGeometry({
        name: "SalesCounterBoards",
        length: COUNTER_LENGTH,
        depth: COUNTER_DEPTH,
        thickness: 0.044,
        planks: 5,
        widthWeights: [1.07, 0.94, 1.03, 0.96, 1.17],
        seed: 1402,
        gap: 0.003,
        wear: 0.50,
        crown: 0.00055
    });
    const planks = new THREE.Group();
    planks.name = "SalesCounterBoards";

    boards.forEach((board, index) => {
        const geometry = index === 4
            ? transformGeometry(
                board,
                new THREE.Matrix4().makeScale(
                    COUNTER_FRONT_BOARD_LENGTH / COUNTER_LENGTH, 1, 1
                )
            )
            : board;
        const seed = (1402 + index * 3 + 2) % 8;
        const tone = 0.96 + 0.012 * ((1402 + index * 5) % 5);
        planks.add(oakPlank(
            `SalesCounterBoard${index + 1}`, geometry, seed, tone
        ));
    });

    planks.position.set(0, FRAME_TOP + 0.044 / 2, COUNTER_CENTER_Z);
    stall.add(planks);

    // A single vertical apron closes the otherwise exposed front framing.
    // Its rear face meets the front rail; the counter overhangs it toward
    // the customer. It terminates short of the post faces, like the top.
    const apronHeight = 0.15;
    const apronThickness = 0.028;
    const apron = oakPlankPanel({
        name: "CounterFrontApron",
        length: COUNTER_APRON_LENGTH,
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
