import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { layeredGridSolid } = await toolbox(
    "geometry/build/layeredGridSolid.ts"
);
const { geometryResult } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);

test("independent layer contours leave sloping cut walls in one closed solid", () => {
    const columns = [-1, 0, 1];
    const rows = [
        {upper: -1, lower: -1},
        {upper: -0.2, lower: -0.3},
        {upper: 1, lower: 1}
    ];
    const filled = [
        [false, true],
        [true, true]
    ];

    const data = layeredGridSolid({
        columns,
        rows,
        filled,
        upperY: x => 0.1 + 0.02 * (1 - x * x),
        lowerY: () => -0.1,
        bevel: 0.02,
        surfaceAt: side => side === "upper" ? "top" :
            side === "lower" ? "bottom" :
                side === "left" || side === "right" ? "end" : "edge",
        faceUv: point => new THREE.Vector2(point.x, point.z),
        wallUv: point => new THREE.Vector2(point.z, point.y)
    });
    const result = geometryResult(data);
    const topology = topologyOf(result);

    assert.equal(topology.openBoundaries().length, 0);
    assert.equal(topology.connectedComponents().length, 1);
    assert.equal(data.triangles?.length ?? 0, 0);
    assert.ok(data.quads.some(face => face.surface === "top"));
    assert.ok(data.quads.some(face => face.surface === "bottom"));
    assert.ok(data.quads.some(face => face.surface === "edge"));
    assert.ok(data.quads.some(face => face.surface === "end"));

    // The notch has different Z boundaries at the two layer heights,
    // rather than being projected into one vertical wall.
    assert.ok(data.vertices.some(point =>
        Math.abs(point.z + 0.2) < 1e-12 && point.y > 0
    ));
    assert.ok(data.vertices.some(point =>
        Math.abs(point.z + 0.3) < 1e-12 && point.y < 0
    ));
    assert.ok(data.vertices.some(point =>
        point.y > 0.11
    ));

    // The input sketch stays unchanged and can construct another solid.
    assert.deepEqual(columns, [-1, 0, 1]);
    assert.deepEqual(rows[1], {upper: -0.2, lower: -0.3});
    assert.deepEqual(filled, [[false, true], [true, true]]);
    assert.ok(data.quads.every(face =>
        face.uvs.length === 4 &&
        face.uvs.every(uv => Number.isFinite(uv.x) && Number.isFinite(uv.y))
    ));
});
