import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
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

test("three low boarded walls close the stall without blocking the back", async () => {
    const vite = await createServer({
        appType: "custom",
        logLevel: "silent",
        server: { middlewareMode: true }
    });
    try {
        const { default: model } = await vite.ssrLoadModule(
            "/src/models/marketStall.ts"
        );
        const stall = model.create();
        stall.updateMatrixWorld(true);
        const get = name => {
            const obj = stall.getObjectByName(name);
            assert.ok(obj, name);
            return obj;
        };
        const box = obj => new THREE.Box3().setFromObject(obj);

        const front = get("LowerFrontBoards");
        const left = get("LowerSideBoards--1");
        const right = get("LowerSideBoards-1");
        const apron = get("CounterFrontApron");
        const frontRail = get("LowerFrontRail");
        const leftRail = get("LowerSideRail--1");
        const rightRail = get("LowerSideRail-1");

        assert.equal(front.children.length, 9);
        assert.equal(left.children.length, 5);
        assert.equal(right.children.length, 5);

        const f = box(front), l = box(left), r = box(right);
        assert.ok(f.min.y > 0.025 && f.max.y < 0.752,
            "Front boards stay above ground and beneath apron");
        assert.ok(l.min.y > 0.025 && l.max.y < 0.8025,
            "Left boards stay beneath counter side rail");
        assert.ok(r.min.y > 0.025 && r.max.y < 0.8025,
            "Right boards stay beneath counter side rail");
        assert.ok(f.min.x < -0.95 && f.max.x > 0.95);
        assert.ok(l.min.z < -0.52 && l.max.z > 0.52);
        assert.ok(r.min.z < -0.52 && r.max.z > 0.52);

        assert.ok(f.min.z > box(frontRail).max.z + 0.0001,
            "Front planks clear the front base rail");
        assert.ok(f.max.z < box(apron).min.z - 0.0001,
            "Front planks are behind the upper apron, not intersecting");
        assert.ok(l.max.x < box(leftRail).min.x - 0.0001,
            "Left boards clear the left base rail");
        assert.ok(r.min.x > box(rightRail).max.x + 0.0001,
            "Right boards clear the right base rail");

        assert.equal(stall.children.filter(x =>
            x.name.startsWith("LowerSideRail-")).length, 2);
        assert.equal(stall.children.filter(x =>
            x.name.startsWith("LowerSideBoards-")).length, 2);
        assert.equal(stall.children.filter(x =>
            x.name.startsWith("Rafter-")).length, 10);
        assert.ok(!stall.getObjectByName("LowerRearBoards"));
        assert.ok(stall.getObjectByName("SewnStripedCanvas"));

        stall.traverse(object => {
            if (!object.isMesh) return;
            const positions = object.geometry.getAttribute("position");
            assert.ok(positions.count, object.name);
            for (const n of positions.array) {
                assert.ok(Number.isFinite(n), object.name);
            }
        });
    } finally {
        await vite.close();
    }
});
