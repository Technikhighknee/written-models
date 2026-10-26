import * as THREE from "three";

import { cm, m } from "../toolbox/units/length";
import { loftSections } from "../toolbox/geometry/construction/loftSections";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { oakVariant } from "../materials/wood/oak";

export default {
    create,
    slug: "plank",
    title: "Wooden Plank",
    description: "A humble piece of wood."
};

function create(): THREE.Group {
    const group = new THREE.Group();
    group.name = "WoodenPlank";

    const length = m(1.2);
    const width = cm(22);
    const thickness = cm(3);

    const wood = oakVariant(6);

    function section(
        z: number,
        lift: number = 0
    ): THREE.Vector3[] {
        const halfWidth = width / 2;
        const halfThickness = thickness / 2;

        return [
            new THREE.Vector3(-halfWidth, -halfThickness + lift, z),
            new THREE.Vector3( halfWidth, -halfThickness + lift, z),
            new THREE.Vector3( halfWidth,  halfThickness + lift, z),
            new THREE.Vector3(-halfWidth,  halfThickness + lift, z),
        ];
    }

    const sections = [
        section(-length / 2),
        section(-length / 4, cm(0.4)),
        section(0, cm(0.7)),
        section(length / 4, cm(0.4)),
        section(length / 2)
    ];

    const meshData = loftSections(sections);

    const geometry = toBufferGeometry(meshData, {
        "side-0": 0,
        "side-1": 0,
        "side-2": 0,
        "side-3": 0,
        "cap-start": 1,
        "cap-end": 1
    });

    const plank = new THREE.Mesh(
        geometry,
        [wood.face, wood.endGrain]
    );

    plank.name = "Plank";
    group.add(plank);

    return group;
}