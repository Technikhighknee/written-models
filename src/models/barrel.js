import * as THREE from "three";
import { mm, cm } from "../toolbox/units/length.js";
import { bandAroundProfile } from "../toolbox/geometry/construction/bandAroundProfile.js";
import { bulgedProfile } from "../toolbox/shapes/profiles/bulged.js";

export default {
    create,
    slug: "barrel",
    title: "Wooden Barrel",
    description: "A barrel of possibilities.",
}

function create() {
    const barrel = new THREE.Group();
    barrel.name = "Barrel";

    const wood = new THREE.MeshStandardMaterial({
        color: "#855632",
        roughness: 0.9
    });


    const profile = bulgedProfile({
        height: cm(90),
        bottomDiameter: cm(50),
        topDiameter: cm(50),
        peakDiameter: cm(60),
        points: 7,
        curve: "quadratic"
    });

    barrel.add(createBody(profile, wood));

    barrel.add(createHead(profile, "top", cm(3), wood));
    barrel.add(createHead(profile, "bottom", cm(3), wood));

    for (const height of [10, 20, 70, 80]) {
        barrel.add(createHoop(profile, cm(height)));
    }

    return barrel;
}

function createBody(profile, material) {
    const geometry = new THREE.LatheGeometry(profile, 32);
    
    const body = new THREE.Mesh(geometry, material);
    body.name = "Body";

    return body;
}

function createHead(profile, side, inset, material) {
    const isTop = side == "top";

    const rim = profile.at(!isTop - 1); // hehe javascript

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

function createHoop(profile, y) {
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