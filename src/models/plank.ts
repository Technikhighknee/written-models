import * as THREE from "three";

import { cm, m } from "../toolbox/units/length";
import { loftSectionWalls } from "../toolbox/geometry/build/loftSectionWalls";
import { capBoundary } from "../toolbox/geometry/build/finishBoundaries";
import type { GeometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { oakVariant } from "../materials/wood/oak";

export default {
    create,
    slug: "plank",
    title: "Wooden Plank",
    description: "A humble piece of wood.",
    category: "materials" as const
};

const LENGTH = m(1.2);
const WIDTH = cm(22);
const THICKNESS = cm(3);

/** Five authored sections form one curved board with true quad end grain. */
export function buildPlankGeometry(): GeometryResult {
    function section(z: number, lift = 0): THREE.Vector3[] {
        return [
            new THREE.Vector3(-WIDTH / 2, -THICKNESS / 2 + lift, z),
            new THREE.Vector3(WIDTH / 2, -THICKNESS / 2 + lift, z),
            new THREE.Vector3(WIDTH / 2, THICKNESS / 2 + lift, z),
            new THREE.Vector3(-WIDTH / 2, THICKNESS / 2 + lift, z)
        ];
    }

    const slices = [
        section(-LENGTH / 2),
        section(-LENGTH / 4, cm(0.4)),
        section(0, cm(0.7)),
        section(LENGTH / 4, cm(0.4)),
        section(LENGTH / 2)
    ];

    let result = loftSectionWalls(
        slices.map(points => ({
            outer: { points, closed: true }
        })),
        {
            uvMode: "edge",
            surfaceAt: ({ edge }) => `side-${edge}`,
            smoothingGroupAt: ({ edge }) => `side-${edge}`
        }
    );

    // End-grain UVs retain the same physical origin as the original
    // section caps, independently of their outward winding.
    const frame = new THREE.Matrix4();
    for (const [end, z] of [
        ["start", -LENGTH / 2],
        ["end", LENGTH / 2]
    ] as const) {
        result = capBoundary(result, result.boundaries[`${end}-outer`]![0]!, {
            region: `cap-${end}`,
            uvFrame: frame.makeTranslation(
                -WIDTH / 2, -THICKNESS / 2, z
            ),
            tessellation: "quad-if-planar"
        });
    }

    return result;
}

function create(): THREE.Group {
    const group = new THREE.Group();
    group.name = "WoodenPlank";

    const wood = oakVariant(6);
    const plank = surfaceMesh({
        name: "Plank",
        geometry: buildPlankGeometry(),
        materials: {
            "side-0": wood.face,
            "side-1": wood.face,
            "side-2": wood.face,
            "side-3": wood.face,
            "cap-start": wood.endGrain,
            "cap-end": wood.endGrain
        }
    });
    group.add(plank);

    return group;
}
