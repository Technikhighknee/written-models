import * as THREE from "three";
import { cm } from "../toolbox/units/length.js";
import { bulgedProfile } from "../toolbox/shapes/profiles/bulged.js";
import { ring } from "../toolbox/shapes/primitives/ring.js";
import { extrude } from "../toolbox/shapes/operations/extrude.js";

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
    barrel.add(createHoop());

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

function createHoop() {
    const geometry = extrude(
        ring(cm(27.7), cm(29)),
        {
            thickness: cm(4)
        }
    );

    const material = new THREE.MeshStandardMaterial({
        color: "#383b3f",
        metalness: 0.8,
        roughness: 0.35
    });

    const hoop = new THREE.Mesh(geometry, material);

    hoop.name = "IronHoop";
    hoop.position.y = cm(15);

    return hoop;
}