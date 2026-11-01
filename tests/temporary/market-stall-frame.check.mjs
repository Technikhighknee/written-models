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

test("upper market-stall joints can be constructed on their real supports", async () => {
    const vite = await createServer({
        appType: "custom",
        logLevel: "silent",
        server: { middlewareMode: true }
    });

    try {
        const { default: definition } = await vite.ssrLoadModule(
            "/src/models/marketStall.ts"
        );
        const model = definition.create();
        const names = [];
        model.traverse(object => {
            if (object.isMesh) {
                names.push(object.name);
                const positions = object.geometry.getAttribute("position");
                assert.ok(positions.count > 0, object.name);
                for (const value of positions.array) {
                    assert.ok(Number.isFinite(value), object.name);
                }
            }
        });

        assert.equal(names.filter(name => name.startsWith("UpperLongRail-")).length, 2);
        assert.equal(names.filter(name => name.startsWith("UpperEndRail-")).length, 2);
        assert.equal(names.filter(name => name.startsWith("LongKnee-")).length, 4);
        assert.equal(names.filter(name => name.startsWith("EndKnee-")).length, 4);
    } finally {
        await vite.close();
    }
});
