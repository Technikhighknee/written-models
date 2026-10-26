import * as THREE from "three";

import { mm, cm } from "../toolbox/units/length";
import { positionsFromEnds } from "../toolbox/spatial/layout/positionsFromEnds";
import { bandAroundProfile } from "../toolbox/geometry/construction/bandAroundProfile";
import { bulgedProfile } from "../toolbox/shapes/profiles/bulged";
import { revolveShell } from "../toolbox/shapes/operations/revolveShell";

type BarrelHeadSide = "top" | "bottom";

export default {
    create,
    slug: "barrel",
    title: "Wooden Barrel",
    description: "A barrel of possibilities.",
}

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
        points: 7,
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
        barrel.add(createHoop(profile, y))
    }

    return barrel;
}

function createBody(
    profile: readonly THREE.Vector2[],
    material: THREE.Material
): THREE.Mesh {
    const geometry = revolveShell(profile, {
        thickness: cm(2),
        roundedRims: true,
        rimSegments: 8
    });
    
    const body = new THREE.Mesh(geometry, material);
    body.name = "Body";

    return body;
}

function createHead(
    profile: readonly THREE.Vector2[],
    side: BarrelHeadSide,
    inset: number,
    material: THREE.Material
): THREE.Mesh {
    const isTop = side == "top";

    const rim = isTop // RIP boolean arithmetic
        ? profile.at(-1)
        : profile.at(0);

    if (!rim) {
        throw new RangeError("Barrel profile is empty");
    }
    
    const innerY = rim.y + (isTop ? -inset : inset);

    const inner = new THREE.Vector2(rim.x, innerY);
    const center = new THREE.Vector2(0, innerY);

    const points = isTop
        ? [rim.clone(), inner, center]
        : [center, inner, rim.clone()];
    
    const geometry = new THREE.LatheGeometry(points, 32);

    const head = new THREE.Mesh(geometry, material);

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
