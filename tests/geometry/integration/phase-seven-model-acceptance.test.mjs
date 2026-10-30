import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { models } = await sourceModule("models/index.ts");
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { hasFillLevelController } = await toolbox(
    "geometry/construction/fillableVolume.ts"
);

// Headless canvases verify model wiring and GLB structure, not image
// appearance. Real texture pixels and final lighting require visual review.
const png = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGm4AAAAASUVORK5CYII=",
    "base64"
));

class TestCanvas {
    width = 1;
    height = 1;

    getContext(kind) {
        if (kind !== "2d") return null;
        return {
            createImageData(width, height) {
                return {
                    width, height,
                    data: new Uint8ClampedArray(width * height * 4)
                };
            },
            putImageData() {},
            drawImage() {},
            clearRect() {},
            fillRect() {},
            save() {},
            restore() {},
            translate() {},
            scale() {}
        };
    }

    toDataURL() {
        return "data:image/png;base64," + Buffer.from(png).toString("base64");
    }

    toBlob(callback) {
        callback(new Blob([png], { type: "image/png" }));
    }
}

class TestFileReader {
    result = null;
    onloadend = null;

    async readAsArrayBuffer(blob) {
        this.result = await blob.arrayBuffer();
        this.onloadend?.();
    }
}

function gltfJson(bytes) {
    const header = new DataView(bytes);
    assert.equal(header.getUint32(0, true), 0x46546c67);
    assert.equal(header.getUint32(16, true), 0x4e4f534a);
    return JSON.parse(new TextDecoder().decode(
        new Uint8Array(bytes, 20, header.getUint32(12, true))
    ));
}

test("all eight registered models retain Quad View and binary GLB paths", async t => {
    assert.deepEqual(models.map(model => model.slug), [
        "table", "barrel", "sandingpaper", "plank", "dagger",
        "beer-mug", "tavern-chair", "tavern-bench"
    ]);

    const oldDocument = globalThis.document;
    const oldCanvas = globalThis.HTMLCanvasElement;
    const oldFileReader = globalThis.FileReader;

    globalThis.HTMLCanvasElement = TestCanvas;
    globalThis.document = {
        createElement(kind) {
            assert.equal(kind, "canvas");
            return new TestCanvas();
        }
    };
    globalThis.FileReader = TestFileReader;

    try {
        for (const model of models) {
            await t.test(model.slug, async () => {
                const source = model.create();
                const sourceMeshes = [];
                let quadCount = 0;
                let runtime;

                try {
                    source.traverse(node => {
                        if (!(node instanceof THREE.Mesh)) return;
                        sourceMeshes.push(node);
                        const outline = getControlOutline(node.geometry);
                        if (outline) quadCount += outline.quadCount;
                        const positions = node.geometry.getAttribute("position");
                        assert.ok(positions?.count > 0,
                            model.slug + ": missing positions");
                        const uv = node.geometry.getAttribute("uv");
                        assert.ok(uv?.count > 0,
                            model.slug + ": missing UVs");
                    });

                    assert.ok(sourceMeshes.length > 0,
                        model.slug + ": empty viewer model");
                    assert.ok(quadCount > 0,
                        model.slug + ": no authored Quad View faces");

                    if (model.slug === "beer-mug") {
                        assert.ok(hasFillLevelController(source));
                        source.setFillLevel(0);
                        assert.equal(source.getFillLevel(), 0);
                        source.setFillLevel(1);
                        assert.equal(source.getFillLevel(), 1);
                        source.setFillLevel(0.65);
                    }

                    runtime = prepareRuntimeModel(source);
                    assert.equal(runtime.sourceMeshes, sourceMeshes.length);
                    assert.ok(runtime.outputMeshes > 0);
                    const exported = await new GLTFExporter().parseAsync(
                        runtime.root, { binary: true }
                    );
                    assert.ok(exported instanceof ArrayBuffer);
                    const json = gltfJson(exported);
                    const primitives = json.meshes.flatMap(mesh => mesh.primitives);
                    assert.ok(primitives.length > 0);
                    assert.ok(primitives.every(primitive =>
                        primitive.attributes.POSITION !== undefined &&
                        primitive.attributes.TEXCOORD_0 !== undefined
                    ), model.slug + ": missing GLB position or UV");

                    if (model.slug === "beer-mug") {
                        const node = json.nodes.find(entry =>
                            entry.name === "AmberAleContents"
                        );
                        assert.ok(node && Number.isInteger(node.mesh));
                        const contents = json.meshes[node.mesh];
                        assert.equal(contents.primitives[0].targets.length, 8);
                    }
                } finally {
                    runtime?.dispose();
                    for (const mesh of sourceMeshes) mesh.geometry.dispose();
                }
            });
        }
    } finally {
        if (oldDocument === undefined) delete globalThis.document;
        else globalThis.document = oldDocument;
        if (oldCanvas === undefined) delete globalThis.HTMLCanvasElement;
        else globalThis.HTMLCanvasElement = oldCanvas;
        if (oldFileReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = oldFileReader;
    }
});
