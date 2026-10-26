import * as THREE from "three";

import { boardPanel } from "../toolbox/geometry/construction/boardPanel";
import { createTimberBetween } from "../toolbox/geometry/construction/timber";
import {
    createTrestleSupport,
    type TrestleTimberFactory,
    type TrestleSupportOptions
} from "../toolbox/geometry/construction/trestleSupport";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { tintVertices } from "../toolbox/geometry/materials/tintVertices";
import { offsetMeshUvs } from "../toolbox/geometry/uv/offsetMeshUvs";
import { coherentVariation } from "../toolbox/spatial/layout/coherentVariation";
import { cm, m, mm } from "../toolbox/units/length";
import { oakVariant, oakBoardFace } from "../materials/wood/oak";

interface TopSpec {
    length: number;
    depth: number;
    thickness: number;
    surfaceHeight: number;
    boardWeights: readonly number[];
    chamfer: number;
    crown: number;
}

export default {
    create,
    slug: "table",
    title: "Tavern Trestle Table",
    description: "A broad oak board resting on two braced trestles."
};

function create(): THREE.Group {
    const table = new THREE.Group();
    table.name = "TavernTable";

    const topSpec: TopSpec = {
        length: m(2),
        depth: cm(92),
        thickness: cm(6),
        surfaceHeight: cm(78),
        boardWeights: [1.07, 0.94, 1.03, 0.96],
        chamfer: mm(3),
        crown: mm(0.6)
    };

    const topCenterHeight = topSpec.surfaceHeight - topSpec.thickness / 2;
    const top = new THREE.Group();
    top.name = "TableTop";
    top.position.y = topCenterHeight;
    table.add(top);

    buildTop(top, topSpec);
    buildTrestles(top, topSpec, topCenterHeight);

    return table;
}

function buildTop(parent: THREE.Group, spec: TopSpec): void {
    const boards = boardPanel({
        length: spec.length,
        width: spec.depth,
        thickness: spec.thickness,
        count: spec.boardWeights.length,
        widthWeights: spec.boardWeights,
        chamfer: spec.chamfer,
        crown: spec.crown
    });

    const tones = coherentVariation({
        count: boards.length,
        seed: 11,
        radius: 2
    });

    // All long surfaces are the same planed oak cut; only sawed ends show
    // transverse grain. The loft uses actual meter UVs on every quad.
    const surfaceMaterials = {
        outer: 0,
        inner: 0,
        "edge-left": 0,
        "edge-right": 0,
        "cap-start": 1,
        "cap-end": 1
    };

    for (let i = 0; i < boards.length; i++) {
        const seed = (i * 3 + 2) % 8;
        const wood = oakVariant(seed);
        const meshData = offsetMeshUvs(
            boards[i]!,
            cm(1.5) + i * cm(3.2),
            cm(9) + i * cm(7)
        );
        const tone = 0.967 + 0.023 * tones[i]!;
        const geometry = tintVertices(
            toBufferGeometry(meshData, surfaceMaterials),
            new THREE.Color(tone, tone, tone)
        );

        const board = new THREE.Mesh(geometry, [
            oakBoardFace(seed),
            wood.tinted.endGrain
        ]);
        board.name = `Plank${i + 1}`;
        parent.add(board);
    }
}

function buildTrestles(
    parent: THREE.Group,
    spec: TopSpec,
    topCenterHeight: number
): void {
    let timberNumber = 0;

    // A fixed set of related oak cuts, and dedicated UV windows, keep
    // the framing related to the tabletop without repeating its pattern.
    const timber: TrestleTimberFactory = (
        name, start, end, width, depth
    ) => {
        const piece = timberNumber++;
        const seed = (piece * 5 + 1) % 8;
        const material = oakVariant(seed);
        const beam = createTimberBetween(
            start, end, width, depth,
            {
                face: oakBoardFace(seed),
                endGrain: material.tinted.endGrain
            },
            {
                u: cm(1.4) + (piece * cm(3.7)) % cm(16),
                v: (piece * cm(31)) % cm(49)
            }
        );

        // oakBoardFace and the tinted end grain expect vertex colors.
        tintVertices(beam.geometry, new THREE.Color(0.97, 0.97, 0.97));
        beam.name = name;
        return beam;
    };

    const support: TrestleSupportOptions = {
        height: spec.surfaceHeight - spec.thickness,
        footLength: cm(80),
        headLength: cm(72),
        postWidth: cm(14.5),
        postDepth: cm(13.5),
        crossWidth: cm(16),
        footHeight: cm(10),
        headHeight: cm(10.5),
        braceSize: cm(7)
    };

    const supportX = cm(66);

    for (const [name, x] of [
        ["LeftTrestle", -supportX],
        ["RightTrestle", supportX]
    ] as const) {
        const trestle = createTrestleSupport(support, timber);
        trestle.name = name;

        // All framing belongs to the table top's coordinate frame.
        // Reposition or rotate TableTop, and the whole assembly follows.
        trestle.position.set(x, -topCenterHeight, 0);
        parent.add(trestle);
    }

    // Longitudinal tie between the inside faces of both upright posts.
    // The ends meet the posts, not empty space or the outer foot.
    const insideX = supportX - support.postWidth / 2;
    const tieHeight = cm(34);
    const tie = timber(
        "LongStretcher",
        new THREE.Vector3(-insideX, tieHeight - topCenterHeight, 0),
        new THREE.Vector3(insideX, tieHeight - topCenterHeight, 0),
        cm(10.5),
        cm(10.5)
    );
    parent.add(tie);
}
