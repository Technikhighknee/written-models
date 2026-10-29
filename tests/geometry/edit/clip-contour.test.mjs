import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {clipContour} = await toolbox("geometry/edit/clipContour.ts");
const {extrudeContour} = await toolbox("geometry/build/extrudeContour.ts");
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");

const p = (x, y) => new THREE.Vector2(x, y);
const rect = (x0, y0, x1, y1) => [
    p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)
];
const polygon = (points, holes = []) => ({
    outer: {points, closed: true},
    ...(holes.length ? {
        holes: holes.map(loop => ({points: loop, closed: true}))
    } : {})
});
const area = profile =>
    Math.abs(THREE.ShapeUtils.area(profile.outer.points)) -
    (profile.holes ?? []).reduce((sum, loop) =>
        sum + Math.abs(THREE.ShapeUtils.area(loop.points)), 0);

test("a concave arch clips into two independent, extrudable regions", () => {
    const arch = polygon([
        p(-3, -2), p(3, -2), p(3, 2), p(1, 2),
        p(1, -0.5), p(-1, -0.5), p(-1, 2), p(-3, 2)
    ]);
    const previous = arch.outer.points.map(point => point.clone());
    const result = clipContour(arch, {normal: [0, 1], offset: 0});
    assert.equal(result.length, 2);
    assert.ok(Math.abs(result.reduce((sum, part) => sum + area(part), 0) - 8) < 1e-8);
    assert.deepEqual(arch.outer.points, previous);

    for (const part of result) {
        const solid = extrudeContour(part, {
            frame: new THREE.Matrix4(), depth: 0.1
        });
        assert.equal(topologyOf(solid).openBoundaries().length, 0);
        assert.equal(topologyOf(solid).connectedComponents().length, 1);
        assert.ok(part.outer.points.every(point => point.y >= -1e-9));
    }
});

test("a kept hole stays a hole, and a cut-open hole becomes a notch", () => {
    const source = polygon(rect(-2, -2, 2, 2), [
        rect(-0.5, -0.5, 0.5, 0.5)
    ]);
    const untouched = source.holes[0].points.map(point => point.clone());
    const belowHole = clipContour(
        source, {normal: [0, 1], offset: -1.5}
    );
    assert.equal(belowHole.length, 1);
    assert.equal(belowHole[0].holes.length, 1);
    assert.ok(Math.abs(area(belowHole[0]) - 13) < 1e-8);

    const throughHole = clipContour(
        source, {normal: [0, 1], offset: 0}
    );
    assert.equal(throughHole.length, 1);
    assert.equal(throughHole[0].holes?.length ?? 0, 0);
    assert.ok(Math.abs(area(throughHole[0]) - 7.5) < 1e-8);
    assert.deepEqual(source.holes[0].points, untouched);

    for (const part of [belowHole[0], throughHole[0]]) {
        const solid = extrudeContour(part, {
            frame: new THREE.Matrix4(), depth: 0.2
        });
        assert.equal(topologyOf(solid).openBoundaries().length, 0);
    }
});

test("clipping a holed, concave source can keep different hole counts per island", () => {
    const source = polygon([
        p(-3, -2), p(3, -2), p(3, 3), p(1, 3),
        p(1, -0.5), p(-1, -0.5), p(-1, 3), p(-3, 3)
    ], [rect(-2.6, 0.5, -1.4, 1.5)]);
    const parts = clipContour(source, {normal: [0, 1], offset: 0});
    assert.equal(parts.length, 2);
    assert.deepEqual(parts.map(part => part.holes?.length ?? 0).sort(), [0, 1]);
    assert.ok(Math.abs(parts.reduce((sum, part) => sum + area(part), 0) - 10.8) < 1e-8);
});

test("tangent and empty cuts have explicit behavior", () => {
    const source = polygon(rect(-2, -2, 2, 2), [rect(-1, -1, 1, 1)]);
    const before = JSON.stringify(source);
    const full = clipContour(source, {normal: [1, 0], offset: -2});
    assert.equal(full.length, 1);
    assert.equal(full[0].holes.length, 1);
    assert.equal(clipContour(source, {normal: [1, 0], offset: 2}).length, 0);
    assert.equal(clipContour(source, {normal: [1, 0], offset: 3}).length, 0);
    assert.equal(JSON.stringify(source), before);
});

test("self-intersections and holes touching the perimeter fail explicitly", () => {
    assert.throws(
        () => clipContour(polygon([
            p(-1, -1), p(1, 1), p(-1, 1), p(1, -1)
        ]), {normal: [1, 0], offset: 0}),
        error => error.reason === "degenerate-geometry" ||
            error.reason === "self-intersection"
    );
    assert.throws(
        () => clipContour(polygon(rect(-2, -2, 2, 2), [
            rect(1, 0, 2, 1)
        ]), {normal: [1, 0], offset: 0}),
        error => error.reason === "unsupported-topology"
    );
    assert.throws(
        () => clipContour(polygon(rect(-2, -2, 2, 2)),
            {normal: [0, 0], offset: 0}),
        error => error.reason === "invalid-input"
    );
});
