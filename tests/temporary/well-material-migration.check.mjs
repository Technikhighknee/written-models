import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

globalThis.document = {
    createElement(tag) {
        assert.equal(tag, "canvas");
        return {
            width: 0,
            height: 0,
            getContext(kind) {
                assert.equal(kind, "2d");
                return {
                    createImageData(width, height) {
                        return { data: new Uint8ClampedArray(width * height * 4) };
                    },
                    putImageData() {}
                };
            }
        };
    }
};

test("the well creates authored limestone, mortar and water without a paint atlas", async () => {
    const vite = await createServer({
        appType: "custom",
        logLevel: "silent",
        server: { middlewareMode: true }
    });
    try {
        const { default: definition } = await vite.ssrLoadModule("/src/models/well.ts");
        const { getControlResult } = await vite.ssrLoadModule(
            "/src/toolbox/geometry/mesh/toBufferGeometry.ts"
        );
        const model = definition.create();
        const authored = getControlResult(model.geometry);
        assert.ok(authored);
        assert.equal(model.name, "VillageWell");
        const faces = [...authored.geometry.quads, ...(authored.geometry.triangles ?? [])];
        assert.ok(faces.some(face => face.surface.startsWith("stone-")));
        assert.ok(faces.some(face => face.surface === "mortar"));
        assert.ok(faces.some(face => face.surface === "water"));
        assert.ok(faces.every(face => face.uvs.every(uv =>
            Number.isFinite(uv.x) && Number.isFinite(uv.y)
        )));
        const materials = Array.isArray(model.material)
            ? model.material : [model.material];
        assert.ok(materials.some(material => material.name.startsWith("Weathered Limestone")));
        assert.ok(materials.some(material => material.name === "WellMortar"));
        assert.ok(materials.some(material => material.name === "WellWater"));
    } finally {
        await vite.close();
    }
});
