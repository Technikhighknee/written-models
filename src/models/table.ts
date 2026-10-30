import * as THREE from "three";

import { boardedSurface } from "./components/boardedSurface";
import { offsetMeshUvs as offsetAuthoredUvs } from "../toolbox/geometry/edit/geometryEdits";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import type { GeometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import {
    tableTimberGeometry,
    tableTimberBetweenSurfaces,
    type TableTimberGeometry
} from "./components/tableTimberGeometry";
import {
    trestleTimbers,
    type TrestleSupportOptions
} from "./components/trestleSupport";
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

const TABLE_TOP: TopSpec = {
    length: m(1.8),
    depth: cm(90),
    thickness: cm(5),
    surfaceHeight: cm(76),
    boardWeights: [1.07, 0.94, 1.03, 0.96],
    chamfer: mm(3),
    crown: mm(0.6)
};

export default {
    create,
    slug: "table",
    title: "Tavern Trestle Table",
    description: "A broad oak board resting on two braced trestles."
};

function create(): THREE.Group {
    const table = new THREE.Group();
    table.name = "TavernTable";

    const topSpec = TABLE_TOP;

    const topCenterHeight = topSpec.surfaceHeight - topSpec.thickness / 2;
    const top = new THREE.Group();
    top.name = "TableTop";
    top.position.y = topCenterHeight;
    table.add(top);

    buildTop(top, topSpec);
    buildTrestles(top, topSpec, topCenterHeight);

    return table;
}

/** The tabletop is authored before material or render geometry creation. */
export function buildTabletopGeometry(
    spec: TopSpec = TABLE_TOP
): GeometryResult[] {
    return boardedSurface({
        length: spec.length,
        width: spec.depth,
        thickness: spec.thickness,
        weights: spec.boardWeights,
        gap: mm(2.5),
        chamfer: spec.chamfer,
        crown: spec.crown,
        seed: 1400,
        edgeWander: mm(4.2),
        endStagger: mm(12),
        cornerWear: mm(7),
        thicknessVariation: mm(1.4),
        chamferVariation: 0.33
    });
}

function buildTop(parent: THREE.Group, spec: TopSpec): void {
    const boards = buildTabletopGeometry(spec);

    const tones = coherentVariation({
        count: boards.length,
        seed: 11,
        radius: 2
    });

    for (let i = 0; i < boards.length; i++) {
        const seed = (i * 3 + 2) % 8;
        const wood = oakVariant(seed);
        const oakFace = oakBoardFace(seed);
        const meshData = offsetAuthoredUvs(
            boards[i]!,
            cm(1.5) + i * cm(3.2),
            cm(9) + i * cm(7)
        );
        const tone = 0.967 + 0.023 * tones[i]!;
        parent.add(surfaceMesh({
            name: `Plank${i + 1}`,
            geometry: meshData,
            materials: {
                outer: oakFace,
                inner: oakFace,
                "edge-left": oakFace,
                "edge-right": oakFace,
                "cap-start": wood.tinted.endGrain,
                "cap-end": wood.tinted.endGrain
            },
            tint: new THREE.Color(tone, tone, tone)
        }));
    }
}

function buildTrestles(
    parent: THREE.Group,
    spec: TopSpec,
    topCenterHeight: number
): void {
    let timberNumber = 0;

    function surfaceOf(
        member: TableTimberGeometry,
        parentTransform = new THREE.Matrix4()
    ) {
        return {
            geometry: member.geometry.geometry,
            localToWorld: parentTransform.clone().multiply(
                member.localToParent
            )
        };
    }

    function renderTimber(
        name: string,
        member: TableTimberGeometry
    ): THREE.Mesh {
        const piece = timberNumber++;
        const seed = (piece * 5 + 1) % 8;
        const material = oakVariant(seed);
        const face = oakBoardFace(seed);
        const endGrain = material.tinted.endGrain;
        const uvOffset = {
            u: cm(1.4) + (piece * cm(3.7)) % cm(16),
            v: (piece * cm(31)) % cm(49)
        };

        const beam = surfaceMesh({
            name,
            geometry: offsetAuthoredUvs(
                member.geometry, uvOffset.u, uvOffset.v
            ),
            materials: member.fitted
                ? {
                    "side-0": face,
                    "side-1": face,
                    "side-2": face,
                    "side-3": face,
                    "cap-start": endGrain,
                    "cap-end": endGrain
                }
                : {
                    px: face,
                    nx: face,
                    py: endGrain,
                    ny: endGrain,
                    pz: face,
                    nz: face
                },
            tint: new THREE.Color(0.97, 0.97, 0.97)
        });
        beam.applyMatrix4(member.localToParent);
        return beam;
    }

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

    const supportX = cm(60);
    const posts: {
        part: TableTimberGeometry;
        transform: THREE.Matrix4;
    }[] = [];

    for (const [name, x] of [
        ["LeftTrestle", -supportX],
        ["RightTrestle", supportX]
    ] as const) {
        const authored = new Map<string, TableTimberGeometry>();

        // Author every contact and cut before compiling any render mesh.
        for (const cut of trestleTimbers(support)) {
            const foot = authored.get("Foot");
            const post = authored.get("Post");
            const brace = cut.contacts &&
                (cut.name === "BraceBack" || cut.name === "BraceFront");

            const member = brace && foot && post
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
                    cut.start, cut.end, cut.width, cut.depth, cut.contacts
                );
            authored.set(cut.name, member);
        }

        const trestle = new THREE.Group();
        trestle.name = name;
        for (const [memberName, member] of authored) {
            trestle.add(renderTimber(memberName, member));
        }
        trestle.position.set(x, -topCenterHeight, 0);
        trestle.updateMatrix();
        parent.add(trestle);

        posts.push({
            part: authored.get("Post")!,
            transform: trestle.matrix.clone()
        });
    }

    const tieHeight = cm(34) - topCenterHeight;
    const start = new THREE.Vector3(-supportX, tieHeight, 0);
    const end = new THREE.Vector3(supportX, tieHeight, 0);
    const fittedTie = tableTimberBetweenSurfaces({
        first: {
            target: surfaceOf(posts[0]!.part, posts[0]!.transform),
            near: start
        },
        last: {
            target: surfaceOf(posts[1]!.part, posts[1]!.transform),
            near: end
        },
        width: cm(10.5),
        depth: cm(10.5),
        referenceDirection: new THREE.Vector3(0, 1, 0)
    });

    parent.add(renderTimber("LongStretcher", fittedTie));
}
