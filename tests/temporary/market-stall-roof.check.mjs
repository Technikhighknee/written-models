import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

globalThis.document = {
    createElement(name) {
        assert.equal(name, "canvas");
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

test("market stall roof frame fits its posts, ties and ridge", async () => {
    const vite = await createServer({
        appType: "custom",
        logLevel: "silent",
        server: { middlewareMode: true }
    });
    try {
        const { default: definition } = await vite.ssrLoadModule(
            "/src/models/marketStall.ts"
        );
        const stall = definition.create();
        const names = [];
        stall.traverse(object => {
            if (!object.isMesh) return;
            names.push(object.name);
            const positions = object.geometry.getAttribute("position");
            assert.ok(positions.count > 0, object.name);
            for (const value of positions.array) {
                assert.ok(Number.isFinite(value), object.name);
            }
        });
        assert.equal(names.filter(n => n === "RidgeBeam").length, 1);
        assert.equal(names.filter(n => n.startsWith("RidgeSupport-")).length, 2);
        assert.equal(names.filter(n => n.startsWith("Rafter-")).length, 6);
    } finally {
        await vite.close();
    }
});
