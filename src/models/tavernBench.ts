import * as THREE from "three";

import {
    trestleTimbers,
    type TrestleSupportOptions
} from "./components/trestleSupport";
import {
    tableTimberGeometry,
    tableTimberBetweenSurfaces,
    type TableTimberGeometry
} from "./components/tableTimberGeometry";
import { oakPlankPanel, oakTimberShop } from "./components/oakSeating";
import { cm, m } from "../toolbox/units/length";

export default {
    create,
    slug: "tavern-bench",
    title: "Oak Tavern Bench",
    description: "A long, hand-planed oak form with paired braced trestles and a pegged stretcher."
};

const SEAT_LENGTH = m(1.52);
const SEAT_WIDTH = cm(40);
const SEAT_THICKNESS = cm(4.5);
const SEAT_HEIGHT = cm(46);
const SUPPORT_OFFSET = cm(55);
const TIE_HEIGHT = cm(18);

const SUPPORT: TrestleSupportOptions = {
    height: SEAT_HEIGHT - SEAT_THICKNESS,
    footLength: cm(43),
    headLength: cm(32),
    postWidth: cm(9.5),
    postDepth: cm(9.8),
    crossWidth: cm(10.5),
    footHeight: cm(7),
    headHeight: cm(7),
    braceSize: cm(3.3)
};

export const BENCH_SEAT = {
    name: "ThreePlankSeat",
    length: SEAT_LENGTH,
    depth: SEAT_WIDTH,
    thickness: SEAT_THICKNESS,
    planks: 3,
    widthWeights: [1.02, 0.93, 1.05],
    seed: 321,
    wear: 0.76,
    crown: 0.00055
} as const;

function surfaceOf(
    part: TableTimberGeometry,
    parent = new THREE.Matrix4()
) {
    return {
        geometry: part.geometry.geometry,
        localToWorld: parent.clone().multiply(part.localToParent)
    };
}

/** The real five-piece support, fitted before any materials are created. */
export function buildBenchTrestleGeometry(): ReadonlyMap<
    string, TableTimberGeometry
> {
    const members = new Map<string, TableTimberGeometry>();

    for (const cut of trestleTimbers(SUPPORT)) {
        const foot = members.get("Foot");
        const post = members.get("Post");
        const part = cut.contacts && foot && post
            ? tableTimberBetweenSurfaces({
                first: {
                    target: surfaceOf(foot),
                    near: cut.start
                },
                last: {
                    target: surfaceOf(post),
                    near: cut.end
                },
                width: cut.width,
                depth: cut.depth,
                referenceDirection: new THREE.Vector3(1, 0, 0)
            })
            : tableTimberGeometry(
                cut.start,
                cut.end,
                cut.width,
                cut.depth,
                cut.contacts
            );

        members.set(cut.name, part);
    }

    return members;
}

/** Fit the full tie section between both real post faces in bench space. */
export function buildBenchStretcherGeometry(
    leftPost: TableTimberGeometry,
    rightPost: TableTimberGeometry
): TableTimberGeometry {
    return tableTimberBetweenSurfaces({
        first: {
            target: surfaceOf(
                leftPost,
                new THREE.Matrix4().makeTranslation(-SUPPORT_OFFSET, 0, 0)
            ),
            near: new THREE.Vector3(-SUPPORT_OFFSET, TIE_HEIGHT, 0)
        },
        last: {
            target: surfaceOf(
                rightPost,
                new THREE.Matrix4().makeTranslation(SUPPORT_OFFSET, 0, 0)
            ),
            near: new THREE.Vector3(SUPPORT_OFFSET, TIE_HEIGHT, 0)
        },
        width: cm(7.5),
        depth: cm(7.5),
        referenceDirection: new THREE.Vector3(0, 1, 0)
    });
}

function create(): THREE.Group {
    const bench = new THREE.Group();
    bench.name = "TavernBench";

    const seat = oakPlankPanel(BENCH_SEAT);
    seat.position.y = SEAT_HEIGHT - SEAT_THICKNESS / 2;
    bench.add(seat);

    const workshop = oakTimberShop(3);
    const trestles: TableTimberGeometry[] = [];

    for (const [name, x] of [
        ["LeftBenchTrestle", -SUPPORT_OFFSET],
        ["RightBenchTrestle", SUPPORT_OFFSET]
    ] as const) {
        const parts = buildBenchTrestleGeometry();
        const support = new THREE.Group();
        support.name = name;

        for (const [partName, timber] of parts) {
            support.add(workshop.timberFromGeometry(partName, timber));
        }
        support.position.x = x;
        bench.add(support);
        trestles.push(parts.get("Post")!);

        // The eight draw-pins are independent, individually oriented solids.
        for (const y of [cm(19), cm(32)]) {
            bench.add(workshop.peg(
                `${name}PostPin${Math.round(y * 100)}`,
                new THREE.Vector3(x, y, SUPPORT.postDepth / 2),
                new THREE.Vector3(0, 0, 1)
            ));
        }
        for (const z of [-cm(14.2), cm(14.2)]) {
            bench.add(workshop.peg(
                `${name}FootPin${Math.round(z * 100)}`,
                new THREE.Vector3(x, SUPPORT.footHeight, z),
                new THREE.Vector3(0, 1, 0),
                cm(0.55)
            ));
        }
    }

    const tie = buildBenchStretcherGeometry(
        trestles[0]!, trestles[1]!
    );
    bench.add(workshop.timberFromGeometry("LongLowStretcher", tie));
    return bench;
}
