import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { toolbox } from "../../support/toolbox.mjs";

const { boxMesh } = await toolbox("geometry/construction/boxMesh.ts");
const { loftSections } = await toolbox("geometry/construction/loftSections.ts");
const { geometryResult } = await toolbox("geometry/kernel/GeometryResult.ts");
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");
const { offsetMeshUvs, transformGeometry, deformVertices } = await toolbox(
    "geometry/edit/geometryEdits.ts"
);
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");
const { getControlOutline } = await toolbox("geometry/mesh/controlOutline.ts");
const { getControlMesh, getControlResult, getRenderTriangleSources } =
    await toolbox("geometry/mesh/toBufferGeometry.ts");

class BinaryFileReader {
    result = null;
    onloadend = null;

    async readAsArrayBuffer(blob) {
        this.result = await blob.arrayBuffer();
        this.onloadend?.();
    }
}

function fiveSectionPlank() {
    const at = (z, lift) => [
        new THREE.Vector3(-0.11, -0.015 + lift, z),
        new THREE.Vector3(0.11, -0.015 + lift, z),
        new THREE.Vector3(0.11, 0.015 + lift, z),
        new THREE.Vector3(-0.11, 0.015 + lift, z)
    ];

    return loftSections([
        at(-0.6, 0),
        at(-0.3, 0.004),
        at(0, 0.007),
        at(0.3, 0.004),
        at(0.6, 0)
    ]);
}

function render(name, authored, material) {
    const mesh = surfaceMesh({
        name,
        geometry: authored,
        materials: material
    });

    assert.equal(getControlResult(mesh.geometry), authored);
    assert.equal(getControlMesh(mesh.geometry), authored.geometry);

    const outline = getControlOutline(mesh.geometry);
    const triangles = getRenderTriangleSources(mesh.geometry);

    assert.ok(outline);
    assert.ok(triangles);
    assert.equal(outline.quadCount, authored.geometry.quads.length);
    assert.equal(triangles.length, mesh.geometry.index.count / 3);

    return mesh;
}

test("a box and five-section plank survive edits, topology, Quad View and GLB", async () => {
    const box = geometryResult(boxMesh({
        width: 0.4,
        height: 0.2,
        depth: 0.3,
        widthSegments: 2
    }));

    const plank = geometryResult(fiveSectionPlank());

    assert.equal(topologyOf(box).connectedComponents().length, 1);
    assert.equal(topologyOf(plank).connectedComponents().length, 1);
    assert.equal(topologyOf(box).openBoundaries().length, 0);
    assert.equal(topologyOf(plank).openBoundaries().length, 0);

    const finishedBox = offsetMeshUvs(
        transformGeometry(box, new THREE.Matrix4().makeTranslation(1, 0, 0)),
        0.125,
        0.25
    );

    const finishedPlank = deformVertices(plank, (point, id) =>
        new THREE.Vector3(
            0,
            0.0004 * Math.sin(point.z * 4 + id * 0.2),
            0
        )
    );

    assert.notEqual(
        box.geometry.vertices[0].x,
        finishedBox.geometry.vertices[0].x
    );
    assert.notEqual(
        plank.geometry.vertices[0].y,
        finishedPlank.geometry.vertices[0].y
    );
    assert.equal(topologyOf(finishedBox).openBoundaries().length, 0);
    assert.equal(topologyOf(finishedPlank).openBoundaries().length, 0);

    const material = new THREE.MeshStandardMaterial({ color: "#846444" });
    const scene = new THREE.Group();

    scene.add(
        render("Box", finishedBox, material),
        render("Plank", finishedPlank, material)
    );

    // GLTFExporter uses browser FileReader to assemble binary chunks.
    const previousReader = globalThis.FileReader;
    globalThis.FileReader = BinaryFileReader;

    try {
        const glb = await new GLTFExporter().parseAsync(scene, { binary: true });

        assert.ok(glb instanceof ArrayBuffer);
        const header = new DataView(glb);

        assert.equal(header.getUint32(0, true), 0x46546c67);
        assert.equal(header.getUint32(8, true), glb.byteLength);

        const jsonBytes = new Uint8Array(glb, 20, header.getUint32(12, true));
        const document = JSON.parse(new TextDecoder().decode(jsonBytes).trim());

        assert.equal(document.asset.version, "2.0");
        assert.equal(document.meshes.length, 2);
        assert.ok(document.accessors.some(accessor => accessor.count > 0));
    } finally {
        if (previousReader === undefined) {
            delete globalThis.FileReader;
        } else {
            globalThis.FileReader = previousReader;
        }

        scene.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.geometry.dispose();
            }
        });
        material.dispose();
    }
});
