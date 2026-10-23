import * as THREE from "three";
import { cm } from "../toolbox/units/length.js";

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
    const profile = [
        vector2(cm(25), cm(0)),
        vector2(cm(27), cm(15)),
        vector2(cm(29), cm(30)),
        vector2(cm(30), cm(45)),
        vector2(cm(29), cm(60)),
        vector2(cm(27), cm(75)),
        vector2(cm(25), cm(90)),
    ];

    const geometry = new THREE.LatheGeometry(profile, 32);

    const material = new THREE.MeshStandardMaterial({
        color: "#855632",
        roughness: 0.9
    });

    const body = new THREE.Mesh(geometry, material);
    body.name = "Body";

    return body;
}


// Helper function
function vector2(x, y) {
    return new THREE.Vector2(x, y);
}