
import * as THREE from "three";
import { mm, cm } from "../toolbox/units/length.js";
import { roundedRectangle } from "../toolbox/shapes/primitives/roundedRectangle.js";
import { extrude } from "../toolbox/shapes/operations/extrude.js";

export default {
    create,
    slug: "sandingpaper",
    title: "Sanding Paper",
    description: "Rough around the edges."
}

function create() {
    const sandingpaper = new THREE.Group();
    sandingpaper.name = "SandingPaper";

    const shape = roundedRectangle(
        cm(23), cm(28), mm(3)
    );

    const backing = new THREE.MeshStandardMaterial({
        color: "#c8b291",
        roughness: 1
    });

    const abrasive = new THREE.MeshStandardMaterial({
        color: "#554d40",
        roughness: 1
    });

    const thickness = mm(0.8);

    const paper = new THREE.Mesh(
        extrude(shape, { thickness }),
        backing
    );

    paper.name = "PaperBacking";
    sandingpaper.add(paper);

    const surfaceGeometry = new THREE.ShapeGeometry(shape, 16);
    surfaceGeometry.rotateX(-Math.PI / 2);

    const surface = new THREE.Mesh(
        surfaceGeometry,
        abrasive
    );

    surface.name = "AbrasiveSurface";
    surface.position.y = thickness / 2 + mm(0.01);

    sandingpaper.add(surface);

    sandingpaper.position.y = mm(1);

    return sandingpaper;
}