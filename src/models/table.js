import * as THREE from "three";
import { getBounds } from "../toolbox/spatial/bounds.js";
import { createBeamBetween } from "../toolbox/geometry/beams.js";

export default {
    create: createTable,
    slug: "table",
    title: "Simple Table",
    description: "It all began with a table...",
}

function createTable() {
    const table = new THREE.Group();
    table.name = "TavernTable";

    const wood = new THREE.MeshStandardMaterial({
        color: "#855632",
        roughness: 0.9
    });

    function addBox(name, size, position) {
        const geometry = new THREE.BoxGeometry(...size);
        const mesh = new THREE.Mesh(geometry, wood);

        mesh.name = name;
        mesh.position.set(...position);

        table.add(mesh);
    }

    const shape = new THREE.Shape();

    shape.moveTo(-1, -0.55);
    shape.lineTo( 1, -0.55);
    shape.lineTo( 1,  0.55);
    shape.lineTo(-1,  0.55);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.10,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.05,
        bevelSegments: 1,
        steps: 1
    });

    geometry.translate(0, 0, -0.05);
    geometry.rotateX(-Math.PI / 2);

    const tabletop = new THREE.Mesh(geometry, wood);

    tabletop.name = "TableTop";
    tabletop.position.set(0, 1, 0);

    table.add(tabletop);

    const bounds = getBounds(tabletop);

    const LEG_WIDTH = 0.12;
    const LEG_DEPTH = 0.12;
    const LEG_INSET = 0.12;

    const FLOOR_Y = 0;

    const left = bounds.min.x + LEG_INSET + LEG_WIDTH / 2;
    const right = bounds.max.x - LEG_INSET - LEG_WIDTH / 2;
    const front = bounds.max.z - LEG_INSET - LEG_DEPTH / 2;
    const back = bounds.min.z + LEG_INSET + LEG_DEPTH / 2;

    const legs = [
        ["LegFL", left, front],
        ["LegFR", right, front],
        ["LegBL", left, back],
        ["LegBR", right, back]
    ];

    for (const [name, x, z] of legs) {
        const start = new THREE.Vector3(x, FLOOR_Y, z);
        const end = new THREE.Vector3(x, bounds.min.y, z);

        const leg = createBeamBetween(start, end, LEG_WIDTH, LEG_DEPTH, wood);
        leg.name = name;
        table.add(leg);
    }

    return table;
}