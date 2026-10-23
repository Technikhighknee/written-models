import * as THREE from "three";
import { cm } from "../toolbox/units/length.js";
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

    barrel.add(createBody());

    return barrel;
}

function createBody() {
    const profile = bulgedProfile({
        height: cm(90),
        bottomDiameter: cm(50),
        topDiameter: cm(50),
        peakDiameter: cm(60),
        points: 7,
        curve: "quadratic"
    });

    const geometry = new THREE.LatheGeometry(profile, 32);

    const material = new THREE.MeshStandardMaterial({
        color: "#855632",
        roughness: 0.9
    });

    const body = new THREE.Mesh(geometry, material);
    body.name = "Body";

    return body;
}
