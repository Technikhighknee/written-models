
import * as THREE from "three";

import { mm, cm } from "../toolbox/units/length";
import { warpGeometry } from "../toolbox/geometry/deformation/warpGeometry";
import { assignMaterialsByNormal } from "../toolbox/geometry/materials/assignMaterialsByNormal";

export default {
    create,
    slug: "sandingpaper",
    title: "Sanding Paper",
    description: "The backbone of modern society."
};

function create(): THREE.Group {
    const sandingpaper = new THREE.Group();
    sandingpaper.name = "SandingPaper";

    const width = cm(23);
    const depth = cm(28);
    const thickness = mm(0.8);

    const backing = new THREE.MeshStandardMaterial({
        color: "#c8b291",
        roughness: 1
    });

    const abrasive = new THREE.MeshStandardMaterial({
        color: "#554d40",
        roughness: 1,
    });

    const geometry = new THREE.BoxGeometry(
        width,
        thickness,
        depth,
        12, 1, 16
    );

    assignMaterialsByNormal(
        geometry, 
        normal => normal.y > 0.9 ? 0 : 1
    );

    warpGeometry(geometry, point => {
        const u = point.x / width;
        const v = point.z / depth;

        // Gentle curvature across the sheet.
        const bow = 
            mm(2) *
            Math.sin(Math.PI * (u + 0.5)) *
            Math.sin(Math.PI * (v + 0.5));
        
        // Slight fold
        const foldLine =
            point.z - 0.3 * point.x - cm(2);
        
        const fold = 
            Math.tan(7 * Math.PI / 180) *
            Math.max(0, foldLine);
        
        // One slightly curled corner.
        const corner = Math.max(
            0, (u + v - 0.35) / 0.65
        );

        const curl = mm(12) * corner ** 2;

        // Subtle unevenness.
        const wave =
            mm(1.2) *
            Math.sin(Math.PI * 2 * (1.3 * u - 0.7 * v));
        
        point.y += fold + bow + curl + wave;
    });

    const paper = new THREE.Mesh(
        geometry,
        [abrasive, backing]
    );

    // Keep the lowest part slightly above the ground.
    paper.position.y = 
        mm(1) - geometry.boundingBox!.min.y;

    sandingpaper.add(paper);

    return sandingpaper;
}
