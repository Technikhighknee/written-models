import * as THREE from "three";

import { mm, cm } from "../toolbox/units/length";
import { positionsFromEnds } from "../toolbox/spatial/layout/positionsFromEnds";
import { bandAroundProfile } from "../toolbox/geometry/construction/bandAroundProfile";
import { bulgedProfile } from "../toolbox/shapes/profiles/bulged";
import { radialStaves } from "../toolbox/geometry/construction/radialStaves";
import { groovedCircularPlankPanel } from "../toolbox/geometry/construction/circularPlankPanel";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { offsetMeshUvs } from "../toolbox/geometry/uv/offsetMeshUvs";
import { tintVertices } from "../toolbox/geometry/materials/tintVertices";
import { coherentVariation } from "../toolbox/spatial/layout/coherentVariation";
import { oakVariant } from "../materials/wood/oak";
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

    const profile = bulgedProfile({
        height: cm(50),
        bottomDiameter: cm(30),
        topDiameter: cm(30),
        peakDiameter: cm(36),
        points: 9,
        curve: "quadratic"
    });

    const staveCount = 24;
    barrel.add(createBody(profile, staveCount));
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
    staveCount: number
): THREE.Group {
    const body = new THREE.Group();
    body.name = "Body";

    const staves = radialStaves(profile, {
        count: staveCount,
        thickness: cm(2),
        // Sink the OUTER corners into the wood to create a narrow,
        // shadow-catching V-seam. Adjacent stave sidewalls still meet
        // at the same angle, so the barrel stays closed and watertight.
        edgeRoundover: mm(2.2)
    });

    const surfaceMaterials = {
        outer: 0,
        inner: 0,
        "edge-left": 0,
        "edge-right": 0,
        "cap-start": 1,
        "cap-end": 1
    };

    // Neighboring staves belong to broad tonal regions, not a random
    // checkerboard of unrelated oak finishes. Gentle vertex tints keep
    // the PBR maps and materials shared and survive GLB export.
    const variations = coherentVariation({
        count: staves.length,
        seed: 23,
        radius: 4,
        cyclic: true
    });

    for (let i = 0; i < staves.length; i++) {
        const wood = oakVariant((i * 5 + 3) % 8);
        // Unique slices through 2.6m-long material cuts. None of these
        // 50cm staves runs through a complete repeating texture interval.
        const section = offsetMeshUvs(
            staves[i]!,
            0.018 + (i * 0.027) % 0.31,
            0.12 + ((i * 17) % 24) * 0.075
        );
        const tone = 0.955 + 0.045 * variations[i]!;
        const geometry = tintVertices(
            toBufferGeometry(section, surfaceMaterials),
            new THREE.Color(tone, tone, tone)
        );
        const stave = new THREE.Mesh(geometry, [
            wood.tinted.face,
            wood.tinted.endGrain
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

    const boards = groovedCircularPlankPanel(radius, {
        planks: 5,
        thickness,
        radialSegments: 48,
        // A shallow V-joint on BOTH faces makes the five head boards
        // readable, while their touching sidewalls still seal the disk.
        shoulderWidth: mm(3.2),
        recessDepth: mm(1.5)
    });

    // Heads are linear rows of timber, not random swatch arrangements.
    const variations = coherentVariation({
        count: boards.length,
        seed: isTop ? 31 : 47,
        radius: 3
    });

    for (let i = 0; i < boards.length; i++) {
        const wood = oakVariant((i * 3 + (isTop ? 1 : 5)) % 8);
        const tone = 0.97 + 0.02 * variations[i]!;
        const geometry = tintVertices(
            boards[i]!,
            new THREE.Color(tone, tone, tone)
        );
        const board = new THREE.Mesh(geometry, [
            wood.tinted.face,
            wood.tinted.endGrain
        ]);
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
