import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {subdivideEdges} = await toolbox("geometry/edit/subdivideEdges.ts");
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {geometryResult, assertSelectionOwner} = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");

const edge = (source, from, to, t) => ({
    edge: {owner: source.id, from, to}, t
});
const edgeKey = (a, b) => [Math.min(a, b), Math.max(a, b)].join(":");
const p = (x, y) => new THREE.Vector2(x, y);

function sourceBox() {
    const bare = geometryResult(boxMesh({width: 2, height: 2, depth: 2}));
    const original = topologyOf(bare).regionBoundaries("py")[0];
    const patch = {
        owner: bare.id,
        faces: bare.geometry.quads.flatMap((face, i) =>
            face.surface === "py" ? [{kind: "quad", index: i}] : []
        ),
        chart: {
            at: uv => new THREE.Vector3(uv.x, 1, -uv.y),
            parameterOf: v => new THREE.Vector2(v.x, -v.z),
            normalAt: () => new THREE.Vector3(0, 1, 0)
        }
    };
    return {
        ...bare,
        boundaries: {topOutline: [original]},
        patches: {top: [patch]}
    };
}

test("one shared box edge is split on both faces, without T-junctions", () => {
    const source = sourceBox();
    const rim = source.boundaries.topOutline[0];
    const a = rim.vertices[0];
    const b = rim.vertices[1];
    const before = source.geometry.vertices.map(v => v.clone());
    const out = subdivideEdges(source, [edge(source, a, b, 0.35)]);

    assert.deepEqual(source.geometry.vertices, before);
    assert.notEqual(out.id, source.id);
    assert.equal(topologyOf(out).openBoundaries().length, 0);
    assert.equal(topologyOf(out).connectedComponents().length, 1);
    assert.equal(out.geometry.vertices.length, before.length + 3);
    assert.equal(out.geometry.quads.length, source.geometry.quads.length - 2);
    assert.equal(out.boundaries.topOutline.length, 1);
    assert.equal(out.boundaries.topOutline[0].vertices.length,
        rim.vertices.length + 1);
    assert.equal(out.boundaries.subdivided[0].vertices.length, 3);
    assert.ok(out.patches.top?.length === 1);
    assertSelectionOwner(out, out.patches.top[0]);

    const subdivided = out.boundaries.subdivided[0].vertices;
    assert.ok(out.geometry.vertices[subdivided[1]]
        .distanceTo(before[a].clone().lerp(before[b], 0.35)) < 1e-9);
    for (const [x, y] of [
        [subdivided[0], subdivided[1]],
        [subdivided[1], subdivided[2]]
    ]) {
        assert.equal(topologyOf(out).edgeUses(x, y).length, 2);
    }
    assert.equal(topologyOf(out).edgeUses(a, b).length, 0);
    assert.equal(out.regions.py.length > 1, true);
    assert.equal(out.regions.pz.length > 0, true);
});

test("unordered requests with opposite edge orientations share ordered stations", () => {
    const source = sourceBox();
    const rim = source.boundaries.topOutline[0];
    const a = rim.vertices[0], b = rim.vertices[1];
    const out = subdivideEdges(source, [
        edge(source, a, b, 0.2), edge(source, b, a, 0.3),
        edge(source, a, b, 0.5)
    ]);
    const chain = out.boundaries.subdivided[0].vertices;
    assert.equal(chain.length, 5);
    assert.equal(out.boundaries.topOutline[0].vertices.length,
        rim.vertices.length + 3);
    assert.equal(topologyOf(out).openBoundaries().length, 0);
    for (let i = 0; i < chain.length - 1; i++) {
        assert.equal(topologyOf(out).edgeUses(chain[i], chain[i + 1]).length, 2);
    }
    const positions = chain.map(id => out.geometry.vertices[id]);
    const axis = source.geometry.vertices[chain.at(-1)].clone()
        .sub(source.geometry.vertices[chain[0]]);
    const sorted = positions.map(point => point.clone()
        .sub(positions[0]).dot(axis) / axis.lengthSq());
    assert.deepEqual(sorted.map(t => Number(t.toFixed(7))),
        [0, 0.2, 0.5, 0.7, 1]);
});

test("all incident faces interpolate their own UV seam independently", () => {
    const source = sourceBox();
    const rim = source.boundaries.topOutline[0];
    const a = rim.vertices[0], b = rim.vertices[1];
    const out = subdivideEdges(source, [edge(source, a, b, 0.25)]);
    const middle = out.boundaries.subdivided[0].vertices[1];
    const uses = topologyOf(source).edgeUses(a, b);
    assert.equal(uses.length, 2);

    for (const use of uses) {
        const face = use.face.kind === "quad"
            ? source.geometry.quads[use.face.index]
            : source.geometry.triangles[use.face.index];
        const i = face.corners.indexOf(use.from);
        const start = face.uvs[i], end = face.uvs[(i + 1) % face.uvs.length];
        const station = use.from === a ? 0.25 : 0.75;
        const expected = start.clone().lerp(end, station);

        const inserted = out.geometry.triangles.flatMap(triangle =>
            triangle.surface === face.surface
                ? triangle.corners.flatMap((id, corner) =>
                    id === middle ? [triangle.uvs[corner]] : [])
                : []
        );
        assert.ok(inserted.length > 0);
        assert.ok(inserted.every(uv => uv.distanceTo(expected) < 1e-9));
    }
});

test("multiple independent edge splits preserve closed manifold and named chains", () => {
    const source = sourceBox();
    const rim = source.boundaries.topOutline[0].vertices;
    const result = subdivideEdges(source, [
        edge(source, rim[0], rim[1], 0.4),
        edge(source, rim[2], rim[3], 0.6)
    ]);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(result.boundaries.subdivided.length, 2);
    assert.equal(result.boundaries.topOutline[0].vertices.length, rim.length + 2);
    assert.equal(result.geometry.quads.length, 2);
});

test("open triangles are refined without creating hanging edge vertices", () => {
    const source = geometryResult({
        vertices: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(2, 0, 0),
            new THREE.Vector3(0, 2, 0),
            new THREE.Vector3(2, 2, 0)
        ],
        quads: [],
        triangles: [
            {corners: [0, 1, 2], surface: "a",
                uvs: [p(0, 0), p(2, 0), p(0, 2)]},
            {corners: [2, 1, 3], surface: "b",
                uvs: [p(0, 2), p(2, 0), p(2, 2)]}
        ]
    });
    const out = subdivideEdges(source, [edge(source, 1, 2, 0.5)]);
    assert.equal(topologyOf(out).connectedComponents().length, 1);
    assert.equal(topologyOf(out).openBoundaries().length, 1);
    assert.equal(out.geometry.triangles.length, 6);
    assert.equal(topologyOf(out).edgeUses(1, 2).length, 0);
    assert.equal(out.boundaries.subdivided[0].vertices.length, 3);
});

test("missing, stale, duplicate and boundary-adjacent stations fail explicitly", () => {
    const source = sourceBox();
    const rim = source.boundaries.topOutline[0].vertices;
    const a = rim[0], b = rim[1];
    assert.throws(
        () => subdivideEdges(source, [
            {edge: {owner: Symbol(), from: a, to: b}, t: 0.5}
        ]), error => error.reason === "invalid-input"
    );
    assert.throws(
        () => subdivideEdges(source, [edge(source, a, b, 0)]),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => subdivideEdges(source, [edge(source, a, b, 0.5),
            edge(source, b, a, 0.5)]),
        error => error.reason === "degenerate-geometry"
    );
    assert.throws(
        () => subdivideEdges(source, [edge(source, a, b, 1e-12)]),
        error => error.reason === "degenerate-geometry"
    );
    assert.throws(
        () => subdivideEdges(source, [edge(source, 0, 9999, 0.5)]),
        error => error.reason === "invalid-input"
    );
});
