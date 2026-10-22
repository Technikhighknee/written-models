import * as THREE from "three";
import { getBounds } from "../toolbox/spatial/queries/bounds.js";
import { createBeamBetween } from "../toolbox/geometry/construction/beams.js";
import { rectangle } from "../toolbox/shapes/primitives/rectangle.js";
import { extrude } from "../toolbox/shapes/operations/extrude.js";

export default {
    create,
    slug: "table",
    title: "Simple Table",
    description: "It all began with a table...",
}



function create() {
    const table = new THREE.Group();
    table.name = "TavernTable";

    const wood = new THREE.MeshStandardMaterial({
        color: "#855632",
        roughness: 0.9
    });

    const top = createTop(wood);

    table.add(top);
    table.add(...createLegs(top, wood));

    return table;
}

function createTop(material) {
    const geometry = extrude(
        rectangle(2, 1.1),
        {
            thickness: 0.14,
            bevel: {
                size: 0.05,
                thickness: 0.02
            }
        }
    );

    const tabletop = new THREE.Mesh(geometry, material);

    tabletop.name = "TableTop";
    tabletop.position.set(0, 1, 0);

    return tabletop;
}

function createLegs(top, material) {
    const bounds = getBounds(top);

    const WIDTH = 0.12;
    const DEPTH = 0.12;
    const INSET = 0.12;
    const FLOOR = 0;

    const left = bounds.min.x + INSET + WIDTH / 2;
    const right = bounds.max.x - INSET - WIDTH / 2;
    const front = bounds.max.z - INSET - DEPTH / 2;
    const back = bounds.min.z + INSET + DEPTH / 2;

    const positions =  [
        ["LegFL", left, front],
        ["LegFR", right, front],
        ["LegBL", left, back],
        ["LegBR", right, back]
    ];

    return positions.map(([name, x, z]) => {
        const start = new THREE.Vector3(x, FLOOR, z);
        const end = new THREE.Vector3(x, bounds.min.y, z);

        const leg = createBeamBetween(
            start, end, WIDTH, DEPTH, material
        );

        leg.name = name;
        return leg;
    });
}
