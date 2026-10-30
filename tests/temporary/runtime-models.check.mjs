import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { sourceModule } from "../support/toolbox.mjs";

const previousDocument = globalThis.document;
const previousCanvas = globalThis.HTMLCanvasElement;

class Canvas {
    width = 1;
    height = 1;
    getContext(type) {
        if (type !== "2d") return null;
        return {
            createImageData: (width, height) => ({
                width, height,
                data: new Uint8ClampedArray(width * height * 4)
            }),
            putImageData() {},
            drawImage() {}
        };
    }
}
globalThis.HTMLCanvasElement = Canvas;
globalThis.document = {
    createElement(tag) {
        if (tag !== "canvas") throw new Error("Unexpected DOM allocation: " + tag);
        return new Canvas();
    }
};
const {models} = await sourceModule("models/index.ts");
const {prepareRuntimeModel} = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

test("one-shot: create every model and compile actual export geometry", () => {
    try {
        for (const definition of models) {
            console.info("Constructing", definition.slug);
            const object = definition.create();
            assert.ok(object instanceof THREE.Object3D);

            const originalMeshes = [];
            object.traverse(child => {
                if (child instanceof THREE.Mesh) originalMeshes.push(child);
            });
            assert.ok(originalMeshes.length > 0, definition.slug + ": no meshes");

            if (definition.slug === "beer-mug") {
                assert.equal(typeof object.setFillLevel, "function");
                object.setFillLevel(0.9);
                assert.ok(Math.abs(object.getFillLevel() - 0.9) < 1e-8);
            }

            const runtime = prepareRuntimeModel(object);
            try {
                assert.equal(runtime.sourceMeshes, originalMeshes.length,
                    definition.slug + ": source meshes dropped");
                assert.ok(runtime.outputMeshes > 0);
                let meshCount = 0;
                runtime.root.traverse(child => {
                    if (child instanceof THREE.Mesh) meshCount++;
                });
                assert.equal(meshCount, runtime.outputMeshes);
                console.info(definition.slug, ":",
                    runtime.sourceMeshes, "->", runtime.outputMeshes,
                    "meshes,", runtime.atlasPages, "atlases");
            } finally {
                runtime.dispose();
            }
        }
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousCanvas === undefined) delete globalThis.HTMLCanvasElement;
        else globalThis.HTMLCanvasElement = previousCanvas;
    }
});

test("one-shot: never accept invisible vertex tints", async () => {
    const {surfaceMesh} = await sourceModule(
        "toolbox/geometry/mesh/surfaceMesh.ts"
    );
    const {boxMesh} = await sourceModule(
        "toolbox/geometry/construction/boxMesh.ts"
    );
    const {geometryResult} = await sourceModule(
        "toolbox/geometry/kernel/GeometryResult.ts"
    );
    const geometry = geometryResult(boxMesh({
        width: 0.1, height: 0.1, depth: 0.1
    }));
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff
    });
    assert.throws(() => surfaceMesh({
        name: "NoVisibleTint", geometry, materials: material,
        tint: 0xff0000
    }), /vertexColors/);
    material.vertexColors = true;
    const rendered = surfaceMesh({
        name: "VisibleTint", geometry, materials: material,
        tint: 0xff0000
    });
    assert.ok(rendered.geometry.hasAttribute("color"));
    rendered.geometry.dispose();
    material.dispose();
});
