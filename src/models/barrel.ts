import * as THREE from "three";

import { mm, cm } from "../toolbox/units/length";
import { positionsFromEnds } from "../toolbox/spatial/layout/positionsFromEnds";
import { bandAroundProfile } from "../toolbox/geometry/construction/bandAroundProfile";
import { bulgedProfile } from "../toolbox/shapes/profiles/bulged";
import { radialStaves } from "../toolbox/geometry/construction/radialStaves";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";

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

    const wood = new THREE.MeshStandardMaterial({
        color: "#855632",
        roughness: 0.9
    });

    const profile = bulgedProfile({
        height: cm(50),
        bottomDiameter: cm(30),
        topDiameter: cm(30),
        peakDiameter: cm(36),
        points: 13,
        curve: "quadratic"
    });

    barrel.add(createBody(profile, wood));
    barrel.add(createHead(profile, "top", mm(8), wood));
    barrel.add(createHead(profile, "bottom", mm(8), wood));

    const hoopPositions = positionsFromEnds({
        start: profile[0]!.y,
        end: profile.at(-1)!.y,
        fromStart: [cm(8)],
        fromEnd: [cm(8)]
    });

    for (const y of hoopPositions) {
        barrel.add(createHoop(profile, y));
    }

    return barrel;
}

function createBody(
    profile: readonly THREE.Vector2[],
    wood: THREE.Material
): THREE.Group {
    const body = new THREE.Group();
    body.name = "Body";

    const shades: THREE.Material[] = [
        wood,
        new THREE.MeshStandardMaterial({ color: "#815331", roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: "#8a5a35", roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: "#7d502f", roughness: 0.9 })
    ];

    const endGrain = new THREE.MeshStandardMaterial({
        color: "#694124",
        roughness: 0.94
    });

    const staves = radialStaves(profile, {
        count: 24,
        thickness: cm(2),
        seamGap: mm(0.45),
        edgeRoundover: mm(0.7)
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
            endGrain
        ]);

        stave.name = `Stave${String(i + 1).padStart(2, "0")}`;
        body.add(stave);
    }

    return body;
}

function createHead(
    profile: readonly THREE.Vector2[],
    side: BarrelHeadSide,
    inset: number,
    material: THREE.Material
): THREE.Mesh {
    const isTop = side === "top";
    const rim = isTop ? profile.at(-1) : profile[0];

    if (!rim) {
        throw new RangeError("Barrel profile is empty");
    }

    const innerY = rim.y + (isTop ? -inset : inset);
    const inner = new THREE.Vector2(rim.x, innerY);
    const center = new THREE.Vector2(0, innerY);
    const points = isTop
        ? [rim.clone(), inner, center]
        : [center, inner, rim.clone()];

    const head = new THREE.Mesh(new THREE.LatheGeometry(points, 32), material);
    head.name = isTop ? "TopHead" : "BottomHead";
    return head;
}

function createHoop(
    profile: readonly THREE.Vector2[],
    y: number
): THREE.Mesh {
    const geometry = bandAroundProfile(profile, {
        y,
        width: cm(4),
        thickness: mm(5),
        overlap: mm(1)
    });

    const material = new THREE.MeshStandardMaterial({
        color: "#383b3f",
        metalness: 0.8,
        roughness: 0.35
    });

    const hoop = new THREE.Mesh(geometry, material);
    hoop.name = "IronHoop";
    return hoop;
}
