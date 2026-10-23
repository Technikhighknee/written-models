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

    const profile = bulgedProfile({
        height: cm(90),
        bottomDiameter: cm(50),
        topDiameter: cm(50),
        peakDiameter: cm(60),
        points: 7,
        curve: "quadratic"
    });

    barrel.add(createBody(profile));
    barrel.add(createHoop(profile, cm(10)));
    barrel.add(createHoop(profile, cm(20)));
    barrel.add(createHoop(profile, cm(70)));
    barrel.add(createHoop(profile, cm(80)));

    return barrel;
}

function createBody(profile) {
    const geometry = new THREE.LatheGeometry(profile, 32);

    const material = new THREE.MeshStandardMaterial({
        color: "#855632",
        roughness: 0.9
    });

    const body = new THREE.Mesh(geometry, material);
    body.name = "Body";

    return body;
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