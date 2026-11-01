import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { createServer } from "vite";

globalThis.document = {
    createElement(name) {
        assert.equal(name, "canvas");
        return {
            width: 0,
            height: 0,
            getContext(name) {
                assert.equal(name, "2d");
                return {
                    createImageData(w, h) {
                        return {data: new Uint8ClampedArray(w * h * 4)};
                    },
                    putImageData() {}
                };
            }
        };
    }
};

test("market-stall cloth loft keeps the accepted geometry and panels", async () => {
    const vite = await createServer({
        appType: "custom",
        logLevel: "silent",
        server: {middlewareMode: true}
    });
    try {
        const {default: model} = await vite.ssrLoadModule(
            "/src/models/marketStall.ts"
        );
        const {getControlResult} = await vite.ssrLoadModule(
            "/src/toolbox/geometry/mesh/toBufferGeometry.ts"
        );
        const group = model.create();
        const roof = group.getObjectByName("SewnStripedCanvas");
        const stitches = group.getObjectByName("CanopySeamStitches");
        assert.ok(roof?.isMesh);
        assert.ok(stitches?.isMesh);

        const authored = getControlResult(roof.geometry);
        assert.ok(authored, "Quad View retains original authored topology");
        assert.equal(authored.geometry.vertices.length, 738);
        assert.equal(authored.geometry.quads.length, 680);
        assert.equal(authored.geometry.triangles?.length ?? 0, 0);
        assert.equal(authored.regions.red.length, 340);
        assert.equal(authored.regions.linen.length, 340);

        const extents = new THREE.Box3().setFromPoints(
            authored.geometry.vertices
        );
        assert.ok(Math.abs(extents.min.x + 1.22) < 1e-8);
        assert.ok(Math.abs(extents.max.x - 1.22) < 1e-8);
        assert.ok(Math.abs(extents.min.z + 0.91) < 1e-8);
        assert.ok(Math.abs(extents.max.z - 0.945) < 1e-8);

        const sameUvAsModel = authored.geometry.quads.every(face =>
            face.uvs.every(uv => Number.isFinite(uv.x) &&
                Number.isFinite(uv.y))
        );
        assert.ok(sameUvAsModel);
        assert.ok(stitches.geometry.getAttribute("position").count > 100);

        assert.equal(group.children.filter(child =>
            child.name.startsWith("Rafter-")).length, 10);
        assert.equal(group.children.filter(child =>
            child.name.startsWith("EaveOutrigger-")).length, 10);
        assert.ok(group.getObjectByName("LowerFrontBoards"));
        assert.ok(group.getObjectByName("LowerSideBoards--1"));
        assert.ok(group.getObjectByName("LowerSideBoards-1"));
    } finally {
        await vite.close();
    }
});
