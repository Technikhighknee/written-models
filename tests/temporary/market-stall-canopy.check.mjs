import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

globalThis.document = {
    createElement(name) {
        assert.equal(name, "canvas");
        return {
            width: 0, height: 0,
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

test("the stall roof constructs a closed cloth above the rafters", async () => {
    const vite = await createServer({
        appType: "custom",
        logLevel: "silent",
        server: { middlewareMode: true }
    });

    try {
        const { default: definition } = await vite.ssrLoadModule(
            "/src/models/marketStall.ts"
        );
        const group = definition.create();
        const cloth = group.getObjectByName("LinenRoof");
        assert.ok(cloth?.isMesh, "Linen roof is a mesh");

        const p = cloth.geometry.getAttribute("position");
        assert.ok(p.count > 200, "Roof has authored surface subdivisions");
        const bounds = new Set();
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i);
            const y = p.getY(i);
            const z = p.getZ(i);
            assert.ok([x,y,z].every(Number.isFinite), "Finite roof vertices");
            if (Math.abs(Math.abs(x) - 1.05) < 0.06 &&
                Math.abs(Math.abs(z) - 0.62) < 0.06) {
                assert.ok(y > 2.21, "Roof clears the corner post caps");
            }
            bounds.add(Math.round(z * 100));
        }
        assert.ok(bounds.has(-62) && bounds.has(0) && bounds.has(62));

        const rafters = group.children.filter(child =>
            child.name.startsWith("Rafter-")
        );
        assert.equal(rafters.length, 10);
    } finally {
        await vite.close();
    }
});
