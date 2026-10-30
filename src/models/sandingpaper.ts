import * as THREE from "three";

import { mm, cm } from "../toolbox/units/length";
import { boxMesh } from "../toolbox/geometry/construction/boxMesh";
import { deformVertices } from "../toolbox/geometry/edit/geometryEdits";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";

export default {
    create,
    slug: "sandingpaper",
    title: "Sanding Paper",
    description: "The backbone of modern society."
};

const WIDTH = cm(23);
const DEPTH = cm(28);
const THICKNESS = mm(0.8);

/** One authored deformation field for the sheet and all its side faces. */
export function buildSandingPaperGeometry() {
    const sheet = boxMesh({
        width: WIDTH,
        height: THICKNESS,
        depth: DEPTH,
        widthSegments: 12,
        heightSegments: 1,
        depthSegments: 16
    });

    return deformVertices(geometryResult(sheet), point => {
        const u = point.x / WIDTH;
        const v = point.z / DEPTH;

        const bow = mm(2) *
            Math.sin(Math.PI * (u + 0.5)) *
            Math.sin(Math.PI * (v + 0.5));

        const foldLine = point.z - 0.3 * point.x - cm(2);
        const fold = Math.tan(7 * Math.PI / 180) * Math.max(0, foldLine);

        const corner = Math.max(0, (u + v - 0.35) / 0.65);
        const curl = mm(12) * corner ** 2;

        const wave = mm(1.2) *
            Math.sin(Math.PI * 2 * (1.3 * u - 0.7 * v));

        return new THREE.Vector3(0, fold + bow + curl + wave, 0);
    });
}

function create(): THREE.Group {
    const sandingpaper = new THREE.Group();
    sandingpaper.name = "SandingPaper";

    const backing = new THREE.MeshStandardMaterial({
        color: "#c8b291",
        roughness: 1
    });
    const abrasive = new THREE.MeshStandardMaterial({
        color: "#554d40",
        roughness: 1
    });

    const authored = buildSandingPaperGeometry();
    const minimumY = Math.min(
        ...authored.geometry.vertices.map(vertex => vertex.y)
    );

    const paper = surfaceMesh({
        name: "Paper",
        geometry: authored,
        materials: {
            px: backing,
            nx: backing,
            py: abrasive,
            ny: backing,
            pz: backing,
            nz: backing
        }
    });

    // Ground the authored deformation before rendering.
    paper.position.y = mm(1) - minimumY;
    sandingpaper.add(paper);

    return sandingpaper;
}
