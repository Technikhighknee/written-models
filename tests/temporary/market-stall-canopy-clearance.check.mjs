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

test("striped canopy clears the actual roof framing", async () => {
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

        const cloth = stall.getObjectByName("SewnStripedCanvas");
        assert.ok(cloth?.isMesh, "The striped cloth must exist");
        const clothPositions = cloth.geometry.getAttribute("position");
        const index = cloth.geometry.getIndex();
        const triangles = [];

        const point = i => new THREE.Vector3().fromBufferAttribute(
            clothPositions, i
        ).applyMatrix4(cloth.matrixWorld);

        for (let i = 0; i < (index?.count ?? clothPositions.count); i += 3) {
            const a = point(index ? index.getX(i) : i);
            const b = point(index ? index.getX(i + 1) : i + 1);
            const c = point(index ? index.getX(i + 2) : i + 2);
            const up = b.clone().sub(a).cross(c.clone().sub(a)).y;
            if (up > 1e-8) triangles.push({ a, b, c });
        }

        assert.ok(triangles.length > 100, "The roof has authored panels");

        function roofHeight(x, z) {
            for (const {a, b, c} of triangles) {
                const d = (b.z - c.z) * (a.x - c.x) +
                    (c.x - b.x) * (a.z - c.z);
                if (Math.abs(d) < 1e-10) continue;
                const wa = ((b.z - c.z) * (x - c.x) +
                    (c.x - b.x) * (z - c.z)) / d;
                const wb = ((c.z - a.z) * (x - c.x) +
                    (a.x - c.x) * (z - c.z)) / d;
                const wc = 1 - wa - wb;
                if (Math.min(wa, wb, wc) >= -1e-6) {
                    return wa * a.y + wb * b.y + wc * c.y;
                }
            }
            return undefined;
        }

        let checked = 0;
        let nearest = Infinity;
        stall.traverse(object => {
            if (!object.isMesh || !/^(Post-|RidgeBeam|Rafter-|EaveRail-|EaveOutrigger-)/.test(object.name)) {
                return;
            }
            const positions = object.geometry.getAttribute("position");
            for (let i = 0; i < positions.count; i++) {
                const p = new THREE.Vector3().fromBufferAttribute(
                    positions, i
                ).applyMatrix4(object.matrixWorld);
                const height = roofHeight(p.x, p.z);
                assert.notEqual(height, undefined, object.name);
                const gap = height - p.y;
                nearest = Math.min(nearest, gap);
                assert.ok(gap >= 0.005,
                    `${object.name}: cloth clearance ${gap.toFixed(5)}m at ${p.toArray()}`);
                checked++;
            }
        });

        assert.ok(checked > 200, "Roof/frame clearance points inspected");
        assert.equal(stall.children.filter(o =>
            o.name.startsWith("EaveOutrigger-")).length, 10);
        assert.equal(stall.children.filter(o =>
            o.name.startsWith("EaveRail-")).length, 2);
        assert.equal(stall.children.filter(o =>
            o.name.startsWith("Rafter-")).length, 10);
        assert.ok(nearest > 0.005);
    } finally {
        await vite.close();
    }
});
