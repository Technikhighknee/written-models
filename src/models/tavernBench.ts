import * as THREE from "three";
import {createTrestleSupport} from "./components/trestleSupport";
import {oakPlankPanel, oakTimberShop} from "./components/oakSeating";
import {cm, m} from "../toolbox/units/length";

export default {
    create,
    slug: "tavern-bench",
    title: "Oak Tavern Bench",
    description: "A long, hand-planed oak form with paired braced trestles and a pegged stretcher."
};

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

    for (const [name, x] of [
        ["LeftBenchTrestle", -supportOffset],
        ["RightBenchTrestle", supportOffset]
    ] as const) {
        const support = createTrestleSupport(supports, workshop.timber);
        support.name = name;
        support.position.x = x;
        bench.add(support);

        // Oak draw-pins are visible on the outer face of the uprights and
        // on the feet. They are physical fittings, not texture dots.
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

    // The long stretcher meets the actual inner faces of both posts.
    const postInside = supportOffset - supports.postWidth / 2;
    const tieY = cm(18);
    bench.add(workshop.timber(
        "LongLowStretcher",
        new THREE.Vector3(-postInside, tieY, 0),
        new THREE.Vector3(postInside, tieY, 0),
        cm(7.5), cm(7.5)
    ));

    return bench;
}
