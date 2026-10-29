import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { buildTankardGeometry, buildTankardServingCavity } =
    await sourceModule("models/beerMug.ts");
const { cavityFromMeshSurfaces } = await toolbox(
    "geometry/construction/profiledCavity.ts"
);
const { createFillableVolume } = await toolbox(
    "geometry/construction/fillableVolume.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

const near = (actual, expected, tolerance = 1e-9) =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `Expected ${actual} to equal ${expected} ± ${tolerance}`);

function makeTankardContents() {
    const parts = buildTankardGeometry();
    const cavity = buildTankardServingCavity(parts.staves);
    const contents = createFillableVolume(
        cavity,
        new THREE.MeshPhysicalMaterial({ name: "Amber Ale" }),
        0.65,
        0.00035
    );
    contents.mesh.name = "AmberAleContents";
    return { parts, cavity, contents };
}

test("the tankard's authored cavity retains the original serving calibration", () => {
    const { parts, cavity, contents } = makeTankardContents();
    try {
        const physical = cavityFromMeshSurfaces(parts.staves.map(part => part.geometry)).between(
            0.0192, 0.150
        );
        near(cavity.bottom, physical.bottom);
        near(cavity.top, physical.heightAtFill(0.9));
        near(cavity.capacity, physical.capacity * 0.9, 1e-10);

        assert.equal(contents.getFillLevel(), 0.65);
        const mesh = contents.mesh;
        assert.equal(mesh.geometry.morphAttributes.position.length, 8);
        assert.deepEqual(Object.keys(mesh.morphTargetDictionary), [
            "Fill_0_of_8", "Fill_1_of_8", "Fill_2_of_8",
            "Fill_3_of_8", "Fill_4_of_8", "Fill_5_of_8",
            "Fill_6_of_8", "Fill_7_of_8"
        ]);
        const count = mesh.geometry.getAttribute("position").count;
        assert.ok(count > 0);
        assert.ok(mesh.geometry.morphAttributes.position.every(
            target => target.count === count
        ));

        // The neutral UV layout also belongs to all eight blend shapes.
        // Nonzero UV triangles let Godot generate tangents on import.
        const uv = mesh.geometry.getAttribute("uv");
        assert.equal(uv.count, count);
        const indices = mesh.geometry.getIndex();
        for (let i = 0; i < indices.count; i += 3) {
            const a = indices.getX(i);
            const b = indices.getX(i + 1);
            const c = indices.getX(i + 2);
            const abU = uv.getX(b) - uv.getX(a);
            const abV = uv.getY(b) - uv.getY(a);
            const acU = uv.getX(c) - uv.getX(a);
            const acV = uv.getY(c) - uv.getY(a);
            assert.ok(Math.abs(abU * acV - abV * acU) > 1e-10);
        }

        const base = mesh.geometry.getAttribute("position");
        const bottom = cavity.bottom;

        // The neutral (no weights) shape is a real three-dimensional
        // full serving, not a degenerate empty base.
        assert.ok([...Array(count).keys()].some(i =>
            base.getY(i) > bottom + 0.01
        ));

        contents.setFillLevel(0);
        near(contents.getFillLevel(), 0);
        assert.equal(mesh.morphTargetInfluences[0], 1);
        assert.equal(mesh.morphTargetInfluences.slice(1).reduce(
            (sum, influence) => sum + influence, 0
        ), 0);
        contents.setFillLevel(1);
        assert.ok(mesh.morphTargetInfluences.every(weight => weight === 0));
        contents.setFillLevel(0.65);
        near(contents.getFillLevel(), 0.65);
        near(mesh.morphTargetInfluences[5], 0.8, 1e-12);
        near(mesh.morphTargetInfluences[6], 0.2, 1e-12);
        near(mesh.morphTargetInfluences.reduce(
            (sum, weight) => sum + weight, 0
        ), 1);

        assert.throws(() => contents.setFillLevel(-0.1), RangeError);
        assert.throws(() => contents.setFillLevel(1.1), RangeError);
    } finally {
        contents.mesh.geometry.dispose();
        contents.mesh.material.dispose();
    }
});

test("runtime compilation keeps every fill morph and its current weights", () => {
    const { parts, contents } = makeTankardContents();
    const scene = new THREE.Group();
    scene.add(contents.mesh);
    let compiled;
    try {
        compiled = prepareRuntimeModel(scene);
        assert.equal(compiled.sourceMeshes, 1);
        assert.equal(compiled.outputMeshes, 1);
        const output = compiled.root.getObjectByName("AmberAleContents");
        assert.ok(output?.isMesh);
        assert.notEqual(output, contents.mesh);
        assert.equal(output.geometry, contents.mesh.geometry);
        assert.deepEqual(output.morphTargetDictionary,
            contents.mesh.morphTargetDictionary);
        assert.deepEqual(output.morphTargetInfluences,
            contents.mesh.morphTargetInfluences);

        contents.setFillLevel(0.25);
        assert.notDeepEqual(output.morphTargetInfluences,
            contents.mesh.morphTargetInfluences);
        near(output.morphTargetInfluences[5], 0.8, 1e-12);
        near(output.morphTargetInfluences[6], 0.2, 1e-12);
    } finally {
        compiled?.dispose();
        contents.mesh.geometry.dispose();
        contents.mesh.material.dispose();
    }
});

test("binary glTF contains the named fill targets and initial weights", async () => {
    const { parts, contents } = makeTankardContents();
    const scene = new THREE.Group();
    scene.add(contents.mesh);
    const compiled = prepareRuntimeModel(scene);

    // Node 22 supplies Blob but not the browser FileReader used by
    // Three's GLTFExporter to assemble its binary buffer.
    const previousReader = globalThis.FileReader;
    globalThis.FileReader = class {
        result = null;
        onloadend = null;

        readAsArrayBuffer(blob) {
            blob.arrayBuffer().then(result => {
                this.result = result;
                this.onloadend?.();
            });
        }
    };

    try {
        const result = await new GLTFExporter().parseAsync(
            compiled.root, { binary: true }
        );
        assert.ok(result instanceof ArrayBuffer);
        const view = new DataView(result);
        assert.equal(view.getUint32(0, true), 0x46546c67);
        assert.equal(view.getUint32(16, true), 0x4e4f534a);
        const jsonLength = view.getUint32(12, true);
        const gltf = JSON.parse(new TextDecoder().decode(
            new Uint8Array(result, 20, jsonLength)
        ));
        const node = gltf.nodes.find(entry => entry.name === "AmberAleContents");
        assert.ok(node && Number.isInteger(node.mesh));
        const mesh = gltf.meshes[node.mesh];
        assert.ok(mesh);
        const primitive = mesh.primitives[0];
        assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));
        assert.equal(
            gltf.accessors[primitive.attributes.TEXCOORD_0].count,
            contents.mesh.geometry.getAttribute("position").count
        );
        assert.equal(primitive.targets.length, 8);
        assert.deepEqual(mesh.extras.targetNames,
            Object.keys(contents.mesh.morphTargetDictionary));
        near(mesh.weights[5], 0.8, 1e-6);
        near(mesh.weights[6], 0.2, 1e-6);
        assert.equal(mesh.weights.length, 8);
    } finally {
        if (previousReader === undefined) {
            delete globalThis.FileReader;
        } else {
            globalThis.FileReader = previousReader;
        }
        compiled.dispose();
        contents.mesh.geometry.dispose();
        contents.mesh.material.dispose();
    }
});
