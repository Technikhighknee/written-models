import * as THREE from "three";

import { mm, cm } from "../toolbox/units/length";
import { positionsFromEnds } from "../toolbox/spatial/layout/positionsFromEnds";
import { bandAroundProfile } from "../toolbox/geometry/construction/bandAroundProfile";
import { bulgedProfile } from "../toolbox/shapes/profiles/bulged";
import { radialStaves } from "../toolbox/geometry/construction/radialStaves";
import { circularPlankPanel } from "../toolbox/geometry/construction/circularPlankPanel";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { oak } from "../materials/wood/oak";
import type { OakMaterials } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";

type BarrelHeadSide = "top" | "bottom";

export default {
    create,
    slug: "barrel",
    title: "Wooden Barrel",
    description: "A barrel of possibilities.",
};

function create(): THREE.Group {
    const barrel = new THREE.Group();
    barrel.name = "Barrel";

    const wood = oak();

    const profile = bulgedProfile({
        height: cm(50),
        bottomDiameter: cm(30),
        topDiameter: cm(30),
        peakDiameter: cm(36),
        points: 9,
        curve: "quadratic"
    });

    const staveCount = 24;
    barrel.add(createBody(profile, wood, staveCount));
    barrel.add(createHead(profile, "top", cm(2)));
    barrel.add(createHead(profile, "bottom", cm(2)));

    // End (chime) hoops and the lighter quarter hoops sit on different
    // radii of the barrel. Both are driven tightly over the staves.
    const hoopPositions = positionsFromEnds({
        start: profile[0]!.y,
        end: profile.at(-1)!.y,
        fromStart: [cm(5.5), cm(15)],
        fromEnd: [cm(5.5), cm(15)]
    });

    const iron = wroughtIron();

    for (let i = 0; i < hoopPositions.length; i++) {
        const isChime = i === 0 || i === hoopPositions.length - 1;
        const width = isChime ? cm(2.2) : cm(1.8);
        barrel.add(createHoop(profile, hoopPositions[i]!, width, staveCount, iron));
    }

    return barrel;
}

function createBody(
    profile: readonly THREE.Vector2[],
    wood: OakMaterials,
    staveCount: number
): THREE.Group {
    const body = new THREE.Group();
    body.name = "Body";

    const shades: THREE.Material[] = [
        wood.face,
        wood.aged,
        wood.light,
        wood.dark
    ];

    const staves = radialStaves(profile, {
        count: staveCount,
        thickness: cm(2)
    });

    const surfaceMaterials = {
        outer: 0,
        inner: 0,
        "edge-left": 0,
        "edge-right": 0,
        "cap-start": 1,
        "cap-end": 1
    };

    // Deliberately varied tones, not a procedurally generated texture.
    const finish = [
        0, 1, 0, 2, 1, 0, 3, 1,
        0, 2, 0, 1, 3, 0, 1, 2,
        0, 3, 1, 0, 2, 1, 0, 3
    ];

    for (let i = 0; i < staves.length; i++) {
        const geometry = toBufferGeometry(staves[i]!, surfaceMaterials);
        const stave = new THREE.Mesh(geometry, [
            shades[finish[i]!]!,
            wood.endGrain
        ]);

        stave.name = `Stave${String(i + 1).padStart(2, "0")}`;
        body.add(stave);
    }

    return body;
}

function createHead(
    profile: readonly THREE.Vector2[],
    side: BarrelHeadSide,
    staveThickness: number
): THREE.Group {
    const isTop = side === "top";
    const rim = isTop ? profile.at(-1) : profile[0];

    if (!rim) {
        throw new RangeError("Barrel profile is empty");
    }

    const head = new THREE.Group();
    head.name = isTop ? "TopHead" : "BottomHead";

    const thickness = cm(1.6);
    const inset = cm(1.6);

    // A little of the rim sits inside the staves, as a real head does
    // in its croze. The visible face is recessed below the stave ends.
    const radius = rim.x - staveThickness + mm(7);
    const direction = isTop ? -1 : 1;
    head.position.y = rim.y + direction * (inset + thickness / 2);

    const wood = oak();
    const woods = [wood.face, wood.aged, wood.light, wood.dark, wood.aged];
    const edgeWood = wood.endGrain;

    const boards = circularPlankPanel(radius, {
        planks: woods.length,
        thickness,
        radialSegments: 48
    });

    for (let i = 0; i < boards.length; i++) {
        const board = new THREE.Mesh(boards[i]!, [woods[i]!, edgeWood]);
        board.name = `HeadBoard${i + 1}`;
        head.add(board);
    }

    return head;
}

function createHoop(
    profile: readonly THREE.Vector2[],
    y: number,
    width: number,
    staveCount: number,
    iron: THREE.Material
): THREE.Mesh {
    const geometry = bandAroundProfile(profile, {
        y,
        width,
        thickness: mm(3.6),
        overlap: mm(0.5),
        bevel: mm(0.55),
        radialSegments: staveCount,
        // Each polygon vertex rests over the middle of a stave;
        // the faces bridge the joints without exposing the wood.
        angleOffset: Math.PI / staveCount
    });

    const hoop = new THREE.Mesh(geometry, iron);
    hoop.name = "IronHoop";
    return hoop;
}
