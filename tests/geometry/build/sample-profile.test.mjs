import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { sampleProfile } = await toolbox("geometry/build/sampleProfile.ts");
const { triangulateProfile } = await toolbox(
    "geometry/build/triangulateProfile.ts"
);
const { extrudeContour } = await toolbox("geometry/build/extrudeContour.ts");
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");

const p = (x, y) => new THREE.Vector2(x, y);
const outer = [p(0, 0), p(0, 2), p(4, 2), p(4, 0)];
const hole = [p(1, 0.5), p(3, 0.5), p(3, 1.5), p(1, 1.5)];

const input = {
    outer: { points: outer, closed: true },
    holes: [{ points: hole, closed: true }]
};

const stations = {
    outer: [0, 1 / 12, 2 / 12, 3 / 12, 6 / 12, 7 / 12, 8 / 12, 10 / 12],
    holes: [[0, 2 / 6, 3 / 6, 4 / 6, 5 / 6]]
};

test("sampleProfile retains authored corners and independently sampled holes", () => {
    const sampled = sampleProfile(input, stations);

    assert.deepEqual(sampled.outer.parameters, stations.outer);
    assert.deepEqual(sampled.holes[0].parameters, stations.holes[0]);
    assert.deepEqual(
        sampled.outer.points.filter(point =>
            outer.some(corner => corner.equals(point))
        ).map(point => point.toArray()),
        outer.map(point => point.toArray())
    );

    for (const corner of hole) {
        assert.ok(sampled.holes[0].points.some(point =>
            corner.equals(point)
        ));
    }

    assert.notEqual(sampled.outer.points[0], outer[0]);
    assert.equal(input.outer.points.length, 4);
});

test("a sampled extrusion and independent planar fill share exact rim points", () => {
    const sampled = sampleProfile(input, stations);
    const loops = [sampled.outer.points, ...sampled.holes.map(h => h.points)];
    const triangles = triangulateProfile(loops);

    const filledIndices = new Set(triangles.flat());
    const flat = loops.flat();

    for (let i = 0; i < flat.length; i++) {
        assert.ok(filledIndices.has(i), `Missing cap vertex ${i}`);
    }

    const result = extrudeContour(sampled, {
        frame: new THREE.Matrix4(),
        depth: 0.3
    });

    assert.equal(topologyOf(result).openBoundaries().length, 0);

    // Face triangles come from independent cap triangulation; all sampled
    // boundary positions must still occur exactly on both end planes.
    for (const point of flat) {
        for (const z of [0, 0.3]) {
            assert.ok(result.geometry.vertices.some(vertex =>
                vertex.x === point.x &&
                vertex.y === point.y &&
                vertex.z === z
            ));
        }
    }

    assert.equal(
        result.geometry.vertices.length,
        flat.length * 2
    );
});

test("sampleProfile rejects omitted corners, mismatched loops and bad stations", () => {
    assert.throws(
        () => sampleProfile(input, {
            outer: [0, 0.5, 8 / 12],
            holes: stations.holes
        }),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => sampleProfile(input, {
            outer: stations.outer,
            holes: []
        }),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => sampleProfile(input, {
            outer: [0, 1 / 12, 1 / 12, ...stations.outer.slice(2)],
            holes: stations.holes
        }),
        error => error.reason === "invalid-input"
    );
});
