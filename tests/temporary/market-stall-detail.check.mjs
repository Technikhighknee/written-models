import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

globalThis.document = {
    createElement() {
        return {
            width: 0,
            height: 0,
            getContext() {
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

test("market stall detail meshes construct without disturbing roof and frame", async () => {
    const vite = await createServer({
        appType: "custom",
        logLevel: "silent",
        server: { middlewareMode: true }
    });
    try {
        const { default: model } = await vite.ssrLoadModule(
            "/src/models/marketStall.ts"
        );
        const group = model.create();
        const roof = group.getObjectByName("SewnStripedCanvas");
        const stitch = group.getObjectByName("CanopySeamStitches");

        assert.ok(roof?.isMesh);
        assert.ok(stitch?.isMesh);
        assert.ok(stitch.geometry.getAttribute("position").count > 500);
        assert.equal(group.children.filter(o =>
            o.name.includes("Dowel-")).length, 14);
        assert.equal(group.children.filter(o =>
            o.name.startsWith("Rafter-")).length, 10);
        assert.equal(group.children.filter(o =>
            o.name.startsWith("EaveOutrigger-")).length, 10);

        group.traverse(object => {
            if (!object.isMesh) return;
            const positions = object.geometry.getAttribute("position");
            assert.ok(positions.count > 0, object.name);
            for (const v of positions.array) {
                assert.ok(Number.isFinite(v), object.name);
            }
        });
    } finally {
        await vite.close();
    }
});
