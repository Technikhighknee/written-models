import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { triangulateProfile } = await toolbox(
    "geometry/build/triangulateProfile.ts"
);
const { extrude } = await toolbox("shapes/operations/extrude.ts");
const { getControlMesh } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

test("planar caps retain collinear authored boundary stations", () => {
    const outline = [
        [0, 0], [1, 0], [2, 0],
        [2, 1], [1, 1], [0, 1]
    ].map(([x, y]) => new THREE.Vector2(x, y));

    const triangles = triangulateProfile([outline]);

    assert.ok(triangles.length >= 4);
    assert.deepEqual(
        [...new Set(triangles.flat())].sort((a, b) => a - b),
        [0, 1, 2, 3, 4, 5]
    );

    const edgeCounts = new Map();

    for (const [a, b, c] of triangles) {
        for (const [from, to] of [[a, b], [b, c], [c, a]]) {
            const key = [Math.min(from, to), Math.max(from, to)].join(":");
            edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        }
    }

    for (let i = 0; i < outline.length; i++) {
        const next = (i + 1) % outline.length;
        const key = [Math.min(i, next), Math.max(i, next)].join(":");

        assert.equal(edgeCounts.get(key), 1);
    }
});

test("existing shape extrusion retains control faces across cap seams", () => {
    const shape = new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(1, 0),
        new THREE.Vector2(2, 0),
        new THREE.Vector2(2, 1),
        new THREE.Vector2(0, 1)
    ]);

    const buffer = extrude(shape, {
        thickness: 0.4,
        curveSegments: 1
    });

    try {
        const authored = getControlMesh(buffer);

        assert.ok(authored);
        assert.equal(authored.quads.length, 5);
        assert.ok(authored.triangles.length >= 6);
    } finally {
        buffer.dispose();
    }
});
