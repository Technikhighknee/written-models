import * as THREE from "three";

import { createBeamBetween } from "../toolbox/geometry/construction/beams";
import { rectangle } from "../toolbox/shapes/primitives/rectangle";
import { extrude } from "../toolbox/shapes/operations/extrude";
import { cm, m, } from "../toolbox/units/length";
import { rectangleCornerMounts } from "../toolbox/geometry/features/rectangleCornerMounts";
import { attachByFrames } from "../toolbox/spatial/relationships/attachByFrames";
import { createFrame } from "../toolbox/spatial/frames/frames";
import { oak } from "../materials/wood/oak";

interface TopSpec {
    width: number;
    depth: number;
    thickness: number;
    height: number;

    bevel: {
        size: number;
        thickness: number;
    };
}

interface LegSpec {
    width: number;
    depth: number;
    inset: number;
}

export default {
    create,
    slug: "table",
    title: "Simple Table",
    description: "It all began with a table...",
}

function create(): THREE.Group {
    const table = new THREE.Group();
    table.name = "TavernTable";

    const wood = oak();

    const topSpec: TopSpec = {
        width: m(2),
        depth: cm(110),
        thickness: cm(14),
        height: m(1),

        bevel: {
            size: cm(5),
            thickness: cm(2)
        }
    };

    const legSpec: LegSpec = {
        width: cm(12),
        depth: cm(12),
        inset: cm(12)
    };

    const top = createTop(topSpec, wood.face);

    table.add(top);

    // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z.
    // The leg ends show end grain; all vertical sides follow the wood fiber.
    createLegs(top, topSpec, legSpec, [
        wood.face, wood.face, wood.endGrain,
        wood.endGrain, wood.face, wood.face
    ]);

    return table;
}

function createTop(
    spec: TopSpec,
    material: THREE.Material
): THREE.Mesh {
    const shape = rectangle(
        spec.width,
        spec.depth
    );

    const geometry = extrude(shape, {
        thickness: spec.thickness,
        bevel: spec.bevel
    });

    const top = new THREE.Mesh(geometry, material);

    top.name = "TableTop";
    top.position.y = spec.height;

    return top;
}

function createLegs(
    top: THREE.Mesh,
    topSpec: TopSpec,
    legSpec: LegSpec,
    material: THREE.Material | THREE.Material[]
): void {
    const mounts = rectangleCornerMounts({
        width: topSpec.width,
        depth: topSpec.depth,
        thickness: topSpec.thickness,

        footprintWidth: legSpec.width,
        footprintDepth: legSpec.depth,

        inset: legSpec.inset,
        face: "bottom"
    });

    const length = topSpec.height - topSpec.thickness / 2;

    if (!Number.isFinite(length) || length <= 0) {
        throw new RangeError("Invalid table leg length");
    }

    const halfLength = length / 2;

    const legFrame = createFrame(
        new THREE.Vector3(0, halfLength, 0),
        new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            Math.PI
        )
    );

    for (const mount of mounts) {
        const leg = createBeamBetween(
            new THREE.Vector3(0, -halfLength, 0),
            new THREE.Vector3(0,  halfLength, 0),
            legSpec.width,
            legSpec.depth,
            material
        );

        leg.name = `Leg${mount.name}`;

        attachByFrames(
            top, leg,
            mount.frame,
            legFrame
        );
    }
}
