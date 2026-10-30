import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";
import { assertBoardPanel } from "../../support/assert-board-panel.mjs";

const {
    BENCH_SEAT,
    buildBenchTrestleGeometry,
    buildBenchStretcherGeometry
} = await sourceModule("models/tavernBench.ts");
const { oakPanelGeometry } = await sourceModule(
    "models/components/oakSeating.ts"
);
const { cylinderMesh } = await toolbox(
    "geometry/construction/cylinderMesh.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { getControlResult } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

function near(actual, expected, tolerance = 1e-10) {
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `Expected ${actual} to match ${expected} within ${tolerance}`);
}

test("the bench keeps three closed planks with aligned, fitted seams", () => {
    const seat = oakPanelGeometry(BENCH_SEAT);
    assertBoardPanel(seat, {
        count: BENCH_SEAT.planks,
        gap: BENCH_SEAT.gap ?? 0.002
    }, topologyOf);
});

test("both braced supports, the finite stretcher and eight oak pins export", async () => {
    const leftParts = buildBenchTrestleGeometry();
    const rightParts = buildBenchTrestleGeometry();
    const names = [
        "Foot", "Post", "TopBearer", "BraceBack", "BraceFront"
    ];
    assert.deepEqual([...leftParts.keys()], names);
    assert.deepEqual([...rightParts.keys()], names);

    const tie = buildBenchStretcherGeometry(
        leftParts.get("Post"), rightParts.get("Post")
    );
    assert.equal(tie.fitted, true);
    assert.equal(tie.geometry.geometry.quads.length, 6);
    assert.equal(topologyOf(tie.geometry).openBoundaries().length, 0);
    const endX = tie.geometry.geometry.vertices.map(point => point.x);
    near(Math.min(...endX), -0.55 + 0.095 / 2);
    near(Math.max(...endX), 0.55 - 0.095 / 2);

    const oak = new THREE.MeshStandardMaterial({
        name: "Bench Oak", color: 0x856342
    });
    const grain = new THREE.MeshStandardMaterial({
        name: "Bench End Grain", color: 0x65432e
    });
    const scene = new THREE.Group();
    const materials = [oak, grain];
    const add = (parent, name, member) => {
        const mesh = surfaceMesh({
            name,
            geometry: member.geometry,
            materials: member.fitted
                ? {
                    "side-0": oak, "side-1": oak,
                    "side-2": oak, "side-3": oak,
                    "cap-start": grain, "cap-end": grain
                }
                : {
                    px: oak, nx: oak,
                    py: grain, ny: grain,
                    pz: oak, nz: oak
                }
        });
        mesh.applyMatrix4(member.localToParent);
        assert.ok(getControlResult(mesh.geometry));
        assert.equal(getControlOutline(mesh.geometry).quadCount,
            member.geometry.geometry.quads.length);
        parent.add(mesh);
    };

    for (const [i, parts] of [leftParts, rightParts].entries()) {
        const support = new THREE.Group();
        support.name = i === 0 ? "LeftBenchTrestle" : "RightBenchTrestle";
        support.position.x = i === 0 ? -0.55 : 0.55;
        for (const [name, part] of parts) {
            assert.equal(topologyOf(part.geometry).openBoundaries().length, 0);
            assert.equal(topologyOf(part.geometry).connectedComponents().length, 1);
            assert.equal(part.geometry.geometry.quads.length, 6);
            add(support, name, part);
        }
        scene.add(support);
    }
    add(scene, "LongLowStretcher", tie);

    const boardMaterials = { 
        outer: oak, inner: oak,
        "edge-left": oak, "edge-right": oak,
        "cap-start": grain, "cap-end": grain
    };
    for (const [i, plank] of oakPanelGeometry(BENCH_SEAT).entries()) {
        const mesh = surfaceMesh({
            name: `ThreePlankSeatPlank${i + 1}`,
            geometry: plank,
            materials: boardMaterials
        });
        mesh.position.y = 0.46 - 0.045 / 2;
        scene.add(mesh);
    }

    const peg = cylinderMesh({
        radiusTop: 0.006 * 0.91,
        radiusBottom: 0.006,
        height: 0.004,
        radialSegments: 10
    });
    for (const x of [-0.55, 0.55]) {
        for (const y of [0.19, 0.32]) {
            const mesh = surfaceMesh({
                name: "PostPin",
                geometry: peg,
                materials: {side: oak, top: grain, bottom: grain}
            });
            mesh.position.set(x, y, 0.049 + 0.0014);
            mesh.rotation.x = Math.PI / 2;
            scene.add(mesh);
        }
        for (const z of [-0.142, 0.142]) {
            const mesh = surfaceMesh({
                name: "FootPin",
                geometry: peg,
                materials: {side: oak, top: grain, bottom: grain}
            });
            mesh.position.set(x, 0.0714, z);
            scene.add(mesh);
        }
    }

    const previousReader = globalThis.FileReader;
    globalThis.FileReader = class {
        result = null;
        onloadend = null;

        async readAsArrayBuffer(blob) {
            this.result = await blob.arrayBuffer();
            this.onloadend?.();
        }
    };

    let compiled;
    try {
        compiled = prepareRuntimeModel(scene);
        assert.equal(compiled.sourceMeshes, 22);
        const bytes = await new GLTFExporter().parseAsync(
            compiled.root, {binary: true}
        );
        const header = new DataView(bytes);
        assert.equal(header.getUint32(0, true), 0x46546c67);
        const doc = JSON.parse(new TextDecoder().decode(
            new Uint8Array(bytes, 20, header.getUint32(12, true))
        ));
        assert.ok(doc.meshes.length > 0);
        assert.ok(doc.meshes.flatMap(mesh => mesh.primitives).every(primitive =>
            primitive.attributes.POSITION !== undefined &&
            primitive.attributes.NORMAL !== undefined &&
            primitive.attributes.TEXCOORD_0 !== undefined
        ));
        assert.equal(doc.materials.length, 2);
    } finally {
        compiled?.dispose();
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
        scene.traverse(object => {
            if (object.isMesh) object.geometry.dispose();
        });
        for (const material of materials) material.dispose();
    }
});
