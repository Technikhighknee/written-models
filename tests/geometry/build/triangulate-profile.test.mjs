import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { triangulateProfile } = await toolbox(
    "geometry/build/triangulateProfile.ts"
);
const { extrudeContour } = await toolbox(
    "geometry/build/extrudeContour.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
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

test("collinear cap stations remain authored through closed extrusion", () => {
    const profile = [
        [0, 0], [1, 0], [2, 0],
        [2, 1], [0, 1]
    ].map(([x, y]) => new THREE.Vector2(x, y));

    const result = extrudeContour({
        outer: {points: profile, closed: true}
    }, {
        frame: new THREE.Matrix4(),
        depth: 0.4
    });

    assert.equal(result.geometry.vertices.length, 10);
    assert.equal(result.regions.outer.length, 5);
    assert.equal(result.geometry.quads.filter(face =>
        face.surface === "outer"
    ).length, 5);
    assert.ok(result.regions["cap-start"].length > 0);
    assert.ok(result.regions["cap-end"].length > 0);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);

    for (const z of [0, 0.4]) {
        const stations = result.geometry.vertices.filter(point =>
            Math.abs(point.z - z) < 1e-12
        );
        assert.ok(stations.some(point =>
            Math.abs(point.x - 1) < 1e-12 &&
            Math.abs(point.y) < 1e-12
        ));
    }
});
