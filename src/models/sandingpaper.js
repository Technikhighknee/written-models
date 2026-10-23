
import * as THREE from "three";
import { mm, cm } from "../toolbox/units/length.js";
import { roundedRectangle } from "../toolbox/shapes/primitives/roundedRectangle.js";
import { extrude } from "../toolbox/shapes/operations/extrude.js";
import { assignMaterialsByNormal } from "../toolbox/geometry/materials/assignMaterialsByNormal.js";

export default {
    create,
    slug: "sandingpaper",
    title: "Sanding Paper",
    description: "The backbone of modern society."
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
        roughness: 1,
    });

    const thickness = mm(0.8);

    const geometry = extrude(shape, { thickness });

    assignMaterialsByNormal(geometry, 
        normal => normal.y > 0.9 ? 0 : 1
    );

    const paper = new THREE.Mesh(
        geometry,
        [abrasive, backing]
    );

    paper.position.y = thickness / 2 + mm(1);

    paper.name = "SandingPaper";
    sandingpaper.add(paper);

    return sandingpaper;
}
