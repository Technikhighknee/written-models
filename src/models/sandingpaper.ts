
import * as THREE from "three";

import { mm, cm } from "../toolbox/units/length";
import { boxMesh } from "../toolbox/geometry/construction/boxMesh";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";

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

    // The shape is authored first; render triangles and control faces
    // derive from the very same displaced vertices.
    const mesh = boxMesh({
        width,
        height: thickness,
        depth,
        widthSegments: 12,
        heightSegments: 1,
        depthSegments: 16
    });

    for (const point of mesh.vertices) {
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
    }

    const geometry = toBufferGeometry(mesh, {
        px: 1, nx: 1, py: 0, ny: 1, pz: 1, nz: 1
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
