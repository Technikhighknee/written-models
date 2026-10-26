import * as THREE from "three";

import { createBeamBetween } from "../toolbox/geometry/construction/beams";
import { boardPanel } from "../toolbox/geometry/construction/boardPanel";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { tintVertices } from "../toolbox/geometry/materials/tintVertices";
import { offsetMeshUvs } from "../toolbox/geometry/uv/offsetMeshUvs";
import { coherentVariation } from "../toolbox/spatial/layout/coherentVariation";
import { cm, m, mm } from "../toolbox/units/length";
import { rectangleCornerMounts } from "../toolbox/geometry/features/rectangleCornerMounts";
import { attachByFrames } from "../toolbox/spatial/relationships/attachByFrames";
import { createFrame } from "../toolbox/spatial/frames/frames";
import { oak } from "../materials/wood/oak";
import type { OakMaterials } from "../materials/wood/oak";

interface TopSpec {
    width: number;
    depth: number;
    thickness: number;
    surfaceHeight: number;
    boards: number;
    chamfer: number;
    crown: number;
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
    description: "It all began with a table..."
};

function create(): THREE.Group {
    const table = new THREE.Group();
    table.name = "TavernTable";

    const wood = oak();

    const topSpec: TopSpec = {
        width: m(2),
        depth: cm(110),
        thickness: cm(4.5),
        surfaceHeight: cm(78),
        boards: 5,
        chamfer: mm(2.5),
        crown: mm(0.5)
    };

    const legSpec: LegSpec = {
        width: cm(10.5),
        depth: cm(10.5),
        inset: cm(13)
    };

    // All joinery is relative to this frame, not to world-space heights.
    // Moving or rotating the tabletop carries the entire structure with it.
    const top = new THREE.Group();
    top.name = "TableTop";
    top.position.y = topSpec.surfaceHeight - topSpec.thickness / 2;
    table.add(top);

    createTopBoards(top, topSpec, wood);
    createUnderframe(top, topSpec, legSpec, wood);

    return table;
}

function createTopBoards(
    top: THREE.Group,
    spec: TopSpec,
    wood: OakMaterials
): void {
    const boards = boardPanel({
        length: spec.width,
        width: spec.depth,
        thickness: spec.thickness,
        count: spec.boards,
        gap: 0,
        chamfer: spec.chamfer,
        crown: spec.crown
    });

    const tones = coherentVariation({
        count: boards.length,
        seed: 11,
        radius: 2
    });

    const surfaceMaterials = {
        outer: 0,
        inner: 0,
        "edge-left": 0,
        "edge-right": 0,
        "cap-start": 1,
        "cap-end": 1
    };

    for (let i = 0; i < boards.length; i++) {
        // Different UV excerpts prevent an obvious line of repeated knots.
        // UVs are still measured in meters, and all boards share one oak map.
        const meshData = offsetMeshUvs(
            boards[i]!,
            (i * 0.073) % 0.32,
            (i * 0.37) % 1.6
        );

        const tone = 0.965 + 0.025 * tones[i]!;
        const geometry = tintVertices(
            toBufferGeometry(meshData, surfaceMaterials),
            new THREE.Color(tone, tone, tone)
        );

        const board = new THREE.Mesh(geometry, [
            wood.tinted.face,
            wood.tinted.endGrain
        ]);

        board.name = `TopBoard${i + 1}`;
        top.add(board);
    }
}

function createUnderframe(
    top: THREE.Group,
    spec: TopSpec,
    legs: LegSpec,
    wood: OakMaterials
): void {
    const timber: THREE.Material[] = [
        wood.face, wood.face, wood.endGrain,
        wood.endGrain, wood.face, wood.face
    ];

    const legLength = spec.surfaceHeight - spec.thickness;
    const mountPoints = rectangleCornerMounts({
        width: spec.width,
        depth: spec.depth,
        thickness: spec.thickness,
        footprintWidth: legs.width,
        footprintDepth: legs.depth,
        inset: legs.inset,
        face: "bottom"
    });

    const halfLeg = legLength / 2;
    const legTop = createFrame(
        new THREE.Vector3(0, halfLeg, 0),
        new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            Math.PI
        )
    );

    for (const mount of mountPoints) {
        const leg = createBeamBetween(
            new THREE.Vector3(0, -halfLeg, 0),
            new THREE.Vector3(0, halfLeg, 0),
            legs.width,
            legs.depth,
            timber
        );

        leg.name = `Leg${mount.name}`;
        attachByFrames(top, leg, mount.frame, legTop);
    }

    const legX = spec.width / 2 - legs.inset - legs.width / 2;
    const legZ = spec.depth / 2 - legs.inset - legs.depth / 2;

    // A fitted apron joins the inside faces of the four legs.
    const apronHeight = cm(11.5);
    const apronThickness = cm(4.2);
    const apronY = -spec.thickness / 2 - apronHeight / 2;

    for (const z of [-legZ, legZ]) {
        addBeam(
            top, `LongApron${z < 0 ? "Back" : "Front"}`,
            new THREE.Vector3(-legX + legs.width / 2, apronY, z),
            new THREE.Vector3(legX - legs.width / 2, apronY, z),
            apronHeight, apronThickness, timber
        );
    }

    for (const x of [-legX, legX]) {
        addBeam(
            top, `EndApron${x < 0 ? "Left" : "Right"}`,
            new THREE.Vector3(x, apronY, -legZ + legs.depth / 2),
            new THREE.Vector3(x, apronY, legZ - legs.depth / 2),
            apronThickness, apronHeight, timber
        );
    }

    // Cross rails tie the legs together; the long central rail joins
    // those cross rails, rather than hanging unsupported in space.
    const railSize = cm(7);
    const railY = cm(23) - top.position.y;

    for (const x of [-legX, legX]) {
        addBeam(
            top, `LowCrossRail${x < 0 ? "Left" : "Right"}`,
            new THREE.Vector3(x, railY, -legZ + legs.depth / 2),
            new THREE.Vector3(x, railY, legZ - legs.depth / 2),
            railSize, railSize, timber
        );
    }

    addBeam(
        top, "LongStretcher",
        new THREE.Vector3(-legX + railSize / 2, railY, 0),
        new THREE.Vector3(legX - railSize / 2, railY, 0),
        railSize, railSize, timber
    );
}

function addBeam(
    parent: THREE.Group,
    name: string,
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    depth: number,
    materials: THREE.Material[]
): void {
    const beam = createBeamBetween(start, end, width, depth, materials);
    beam.name = name;
    parent.add(beam);
}
