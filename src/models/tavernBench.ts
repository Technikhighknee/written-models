import * as THREE from "three";

import { createTrestleSupport } from "./components/trestleSupport";
import { oakPlankPanel, oakTimberShop } from "./components/oakSeating";
import { getControlResult } from "../toolbox/geometry/mesh/toBufferGeometry";
import { cm, m } from "../toolbox/units/length";

export default {
    create,
    slug: "tavern-bench",
    title: "Oak Tavern Bench",
    description: "A long, hand-planed oak form with paired braced trestles and a pegged stretcher."
};

function surfaceOf(
    mesh: THREE.Mesh,
    parent = new THREE.Matrix4()
) {
    const geometry = getControlResult(mesh.geometry)?.geometry;
    if (!geometry) {
        throw new Error("Bench member has no authored surface");
    }
    mesh.updateMatrix();

    return {
        geometry,
        localToWorld: parent.clone().multiply(mesh.matrix)
    };
}

function create(): THREE.Group {
    const bench = new THREE.Group();
    bench.name = "TavernBench";

    const length = m(1.52);
    const width = cm(40);
    const thickness = cm(4.5);
    const seatHeight = cm(46);
    const underside = seatHeight - thickness;

    const seat = oakPlankPanel({
        name: "ThreePlankSeat",
        length,
        depth: width,
        thickness,
        planks: 3,
        widthWeights: [1.02, 0.93, 1.05],
        seed: 321,
        wear: 0.76,
        crown: 0.00055
    });
    seat.position.y = seatHeight - thickness / 2;
    bench.add(seat);

    const workshop = oakTimberShop(3);
    const supportOffset = cm(55);
    const supports = {
        height: underside,
        footLength: cm(43),
        headLength: cm(32),
        postWidth: cm(9.5),
        postDepth: cm(9.8),
        crossWidth: cm(10.5),
        footHeight: cm(7),
        headHeight: cm(7),
        braceSize: cm(3.3)
    };

    const trestles = new Map<string, THREE.Group>();

    for (const [name, x] of [
        ["LeftBenchTrestle", -supportOffset],
        ["RightBenchTrestle", supportOffset]
    ] as const) {
        const members = new Map<string, THREE.Mesh>();
        const support = createTrestleSupport(
            supports,
            (part, start, end, memberWidth, memberDepth, contacts) => {
                const foot = members.get("Foot");
                const post = members.get("Post");
                const wood = contacts && foot && post
                    ? workshop.fittedTimber(
                        part,
                        { target: surfaceOf(foot), near: start },
                        { target: surfaceOf(post), near: end },
                        memberWidth, memberDepth,
                        new THREE.Vector3(1, 0, 0)
                    )
                    : workshop.timber(
                        part, start, end,
                        memberWidth, memberDepth, contacts
                    );
                members.set(part, wood);
                return wood;
            }
        );

        support.name = name;
        support.position.x = x;
        trestles.set(name, support);
        bench.add(support);

        // Draw-pins stay separately authored solids in their original seats.
        for (const y of [cm(19), cm(32)]) {
            bench.add(workshop.peg(
                `${name}PostPin${Math.round(y * 100)}`,
                new THREE.Vector3(x, y, supports.postDepth / 2),
                new THREE.Vector3(0, 0, 1)
            ));
        }
        for (const z of [-cm(14.2), cm(14.2)]) {
            bench.add(workshop.peg(
                `${name}FootPin${Math.round(z * 100)}`,
                new THREE.Vector3(x, supports.footHeight, z),
                new THREE.Vector3(0, 1, 0),
                cm(0.55)
            ));
        }
    }

    // The full 75 mm section must fit on BOTH finite inner post faces.
    const left = trestles.get("LeftBenchTrestle")!;
    const right = trestles.get("RightBenchTrestle")!;
    left.updateMatrix();
    right.updateMatrix();

    const tieY = cm(18);
    const firstPost = left.getObjectByName("Post") as THREE.Mesh;
    const lastPost = right.getObjectByName("Post") as THREE.Mesh;

    bench.add(workshop.fittedTimber(
        "LongLowStretcher",
        {
            target: surfaceOf(firstPost, left.matrix),
            near: new THREE.Vector3(-supportOffset, tieY, 0)
        },
        {
            target: surfaceOf(lastPost, right.matrix),
            near: new THREE.Vector3(supportOffset, tieY, 0)
        },
        cm(7.5), cm(7.5),
        new THREE.Vector3(0, 1, 0)
    ));

    return bench;
}
