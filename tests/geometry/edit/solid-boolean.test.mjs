import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {solidBoolean} = await toolbox("geometry/edit/solidBoolean.ts");
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {geometryResult} = await toolbox("geometry/kernel/GeometryResult.ts");
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {toBufferGeometry, getControlMesh} = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

function box(x = 0, y = 0, z = 0, size = 2) {
    const mesh = boxMesh({width: size, height: size, depth: size});
    return geometryResult({
        ...mesh,
        vertices: mesh.vertices.map(point =>
            point.clone().add(new THREE.Vector3(x, y, z))
        )
    });
}

function physicalVolume(result) {
    let total = 0;
    for (const face of result.geometry.triangles ?? []) {
        const [a, b, c] = face.corners.map(id =>
            result.geometry.vertices[id]
        );
        total += a.dot(b.clone().cross(c)) / 6;
    }
    return total;
}

function closed(result) {
    assert.equal(result.geometry.quads.length, 0);
    assert.ok(result.geometry.triangles.length > 0);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
}

function exportable(result) {
    const geometry = toBufferGeometry(
        result,
        Object.fromEntries(Object.keys(result.regions).map((name, i) =>
            [name, i]
        ))
    );
    try {
        assert.equal(getControlMesh(geometry), result.geometry);
        assert.ok(geometry.getAttribute("uv").count > 0);
        assert.ok(geometry.index.count >= 3);
    } finally {
        geometry.dispose();
    }
}

test("intersecting authored boxes preserve actual union, intersection and difference solids", async () => {
    const first = box();
    const second = box(1);
    const snapshots = [
        first.geometry.vertices.map(point => point.clone()),
        second.geometry.vertices.map(point => point.clone())
    ];
    const expected = [
        ["union", 12],
        ["intersection", 4],
        ["difference", 4]
    ];
    for (const [operation, volume] of expected) {
        const result = await solidBoolean(first, second, operation);
        closed(result);
        assert.equal(topologyOf(result).connectedComponents().length, 1);
        assert.ok(Math.abs(physicalVolume(result) - volume) < 1e-4);
        assert.ok(result.geometry.triangles.every(face =>
            face.uvs.every(uv => Number.isFinite(uv.x) &&
                Number.isFinite(uv.y))
        ));
        assert.ok(Object.keys(result.regions).some(name =>
            name.startsWith("first:")
        ));
        if (operation === "difference") {
            assert.ok(Object.keys(result.regions).some(name =>
                name.startsWith("cut:")
            ));
        }
        exportable(result);
    }
    assert.deepEqual(first.geometry.vertices, snapshots[0]);
    assert.deepEqual(second.geometry.vertices, snapshots[1]);
});

test("a smaller cutter produces a fully closed interior with separate cut region", async () => {
    const first = box();
    const cutter = box(0, 0, 0, 0.8);
    const result = await solidBoolean(first, cutter, "difference");
    closed(result);
    assert.ok(Math.abs(physicalVolume(result) - (8 - 0.8 ** 3)) < 1e-4);
    assert.equal(topologyOf(result).connectedComponents().length, 2);
    assert.ok(Object.keys(result.regions).some(name =>
        name.startsWith("cut:")
    ));
    exportable(result);
});

test("disjoint intersection is an owned empty geometry result", async () => {
    const result = await solidBoolean(box(), box(10), "intersection");
    assert.equal(result.geometry.vertices.length, 0);
    assert.equal(result.geometry.triangles.length, 0);
    assert.deepEqual(Object.keys(result.regions), []);
    assert.equal(topologyOf(result).connectedComponents().length, 0);
});

test("non-overlapping union keeps both disconnected closed components", async () => {
    const result = await solidBoolean(box(), box(10), "union");
    closed(result);
    assert.equal(topologyOf(result).connectedComponents().length, 2);
    assert.ok(Math.abs(physicalVolume(result) - 16) < 1e-4);
});

test("a boolean result can be used as a new boolean operand", async () => {
    const first = await solidBoolean(box(), box(1), "union");
    const result = await solidBoolean(first, box(0, 0, 1), "difference");
    closed(result);
    assert.ok(physicalVolume(result) > 0);
    assert.ok(Object.keys(result.regions).some(name =>
        name.startsWith("first:first:")
    ));
});

test("invalid open surfaces and invalid operations fail explicitly", async () => {
    const source = box();
    const unclosed = geometryResult({
        vertices: source.geometry.vertices,
        quads: source.geometry.quads.slice(0, -1),
        triangles: []
    });
    await assert.rejects(
        solidBoolean(unclosed, source, "union"),
        error => error.reason === "invalid-topology"
    );
    await assert.rejects(
        solidBoolean(source, source, "bogus"),
        error => error.reason === "invalid-input"
    );
});

test("Float32-collapse in a far-away small solid is rejected", async () => {
    const source = box(1e8, 0, 0, 0.002);
    await assert.rejects(
        solidBoolean(source, box(), "union"),
        error => error.reason === "precision-loss"
    );
});
