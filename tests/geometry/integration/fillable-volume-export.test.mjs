import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { ProfiledCavity } = await toolbox(
    "geometry/construction/profiledCavity.ts"
);
const { createFillableVolume } = await toolbox(
    "geometry/construction/fillableVolume.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

function contents() {
    const outline = scale => Array.from({ length: 6 }, (_, index) => {
        const angle = index * Math.PI / 3;
        return new THREE.Vector2(
            scale * Math.cos(angle),
            scale * Math.sin(angle)
        );
    });
    const cavity = new ProfiledCavity([
        { y: 0, outline: outline(0.28) },
        { y: 0.4, outline: outline(0.32) },
        { y: 0.8, outline: outline(0.3) }
    ]);
    const material = new THREE.MeshPhysicalMaterial();
    const fillable = createFillableVolume(cavity, material, 0.65);

    return {
        cavity,
        fillable,
        dispose() {
            fillable.mesh.geometry.dispose();
            material.dispose();
        }
    };
}

function near(actual, expected, tolerance = 1e-6) {
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("fillable volume has valid UVs, full neutral geometry and working fill controls", () => {
    const { cavity, fillable, dispose } = contents();
    try {
        const mesh = fillable.mesh;
        const positions = mesh.geometry.getAttribute("position");
        const uv = mesh.geometry.getAttribute("uv");
        const morphs = mesh.geometry.morphAttributes.position;

        assert.ok(morphs.length > 1);
        assert.equal(uv.count, positions.count);
        assert.ok(morphs.every(target => target.count === positions.count));
        assert.ok([...Array(positions.count).keys()].some(index =>
            positions.getY(index) > cavity.bottom + 0.1
        ));

        const indices = mesh.geometry.getIndex();
        for (let i = 0; i < indices.count; i += 3) {
            const a = indices.getX(i);
            const b = indices.getX(i + 1);
            const c = indices.getX(i + 2);
            const area =
                (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) -
                (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a));
            assert.ok(Math.abs(area) > 1e-10);
        }

        near(fillable.getFillLevel(), 0.65);
        near(mesh.morphTargetInfluences.reduce((sum, w) => sum + w, 0), 1);

        fillable.setFillLevel(0);
        assert.equal(mesh.morphTargetInfluences[0], 1);
        fillable.setFillLevel(1);
        assert.ok(mesh.morphTargetInfluences.every(weight => weight === 0));

        assert.throws(() => fillable.setFillLevel(-0.1), RangeError);
        assert.throws(() => fillable.setFillLevel(1.1), RangeError);
    } finally {
        dispose();
    }
});

test("binary glTF preserves fill targets, UV attributes and initial weights", async () => {
    const { fillable, dispose } = contents();
    const scene = new THREE.Group();
    fillable.mesh.name = "Contents";
    scene.add(fillable.mesh);

    const compiled = prepareRuntimeModel(scene);
    const previousReader = globalThis.FileReader;
    globalThis.FileReader = class {
        result = null;
        onloadend = null;

        async readAsArrayBuffer(blob) {
            this.result = await blob.arrayBuffer();
            this.onloadend?.();
        }
    };

    try {
        const buffer = await new GLTFExporter().parseAsync(
            compiled.root, { binary: true }
        );
        const view = new DataView(buffer);
        assert.equal(view.getUint32(0, true), 0x46546c67);

        const jsonLength = view.getUint32(12, true);
        const gltf = JSON.parse(new TextDecoder().decode(
            new Uint8Array(buffer, 20, jsonLength)
        ));
        const node = gltf.nodes.find(entry => entry.name === "Contents");
        assert.ok(Number.isInteger(node?.mesh));

        const mesh = gltf.meshes[node.mesh];
        const primitive = mesh.primitives[0];
        const expected = fillable.mesh.geometry.morphAttributes.position;

        assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));
        assert.equal(
            gltf.accessors[primitive.attributes.TEXCOORD_0].count,
            fillable.mesh.geometry.getAttribute("position").count
        );
        assert.equal(primitive.targets.length, expected.length);
        assert.deepEqual(
            mesh.extras.targetNames,
            Object.keys(fillable.mesh.morphTargetDictionary)
        );
        assert.deepEqual(
            mesh.weights.map(weight => Number(weight.toFixed(6))),
            fillable.mesh.morphTargetInfluences.map(
                weight => Number(weight.toFixed(6))
            )
        );
    } finally {
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
        compiled.dispose();
        dispose();
    }
});
