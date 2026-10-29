import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {bevelEdges} = await toolbox("geometry/edit/bevelEdges.ts");
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {extrudeContour} = await toolbox("geometry/build/extrudeContour.ts");
const {geometryResult, assertSelectionOwner} = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {toBufferGeometry, getControlMesh} = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

function box() {
    const base = geometryResult(boxMesh({
        width: 2, height: 2, depth: 2
    }));
    return {
        ...base,
        boundaries: {
            topRim: topologyOf(base).regionBoundaries("py")
        },
        patches: {
            top: [{
                owner: base.id,
                faces: base.regions.py,
                chart: {
                    at: uv => new THREE.Vector3(uv.x, 1, -uv.y),
                    parameterOf: point => new THREE.Vector2(point.x, -point.z),
                    normalAt: () => new THREE.Vector3(0, 1, 0)
                }
            }]
        }
    };
}

function topEdges(source) {
    const rim = source.boundaries.topRim[0].vertices;
    return rim.map((from, i) => ({
        owner: source.id,
        from,
        to: rim[(i + 1) % rim.length]
    }));
}

test("a complete box rim becomes a closed chamfer with real upper/lower edges", () => {
    const source = box();
    const before = source.geometry.vertices.map(v => v.clone());
    const result = bevelEdges(source, topEdges(source), () => 0.2);
    assert.deepEqual(source.geometry.vertices, before);
    assert.notEqual(result.id, source.id);
    assert.equal(result.geometry.quads.length, 10);
    assert.equal(result.regions.bevel.length, 4);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);

    const upper = result.boundaries["bevel-upper"][0];
    const lower = result.boundaries["bevel-lower"][0];
    assertSelectionOwner(result, upper);
    assertSelectionOwner(result, lower);
    assert.equal(upper.vertices.length, 4);
    assert.equal(lower.vertices.length, 4);
    for (let i = 0; i < 4; i++) {
        const top = result.geometry.vertices[upper.vertices[i]];
        const bottom = result.geometry.vertices[lower.vertices[i]];
        assert.ok(Math.abs(top.y - 1) < 1e-9);
        assert.ok(Math.abs(bottom.y - 0.8) < 1e-9);
        assert.ok(Math.abs(top.x) < 1 && Math.abs(top.z) < 1);
        assert.ok(before.some(point =>
            Math.abs(point.x - bottom.x) < 1e-9 &&
            Math.abs(point.z - bottom.z) < 1e-9 &&
            Math.abs(point.y - 1) < 1e-9
        ));
        assert.equal(topologyOf(result).edgeUses(
            upper.vertices[i], upper.vertices[(i + 1) % 4]
        ).length, 2);
        assert.equal(topologyOf(result).edgeUses(
            lower.vertices[i], lower.vertices[(i + 1) % 4]
        ).length, 2);
    }
    assert.equal(result.boundaries.topRim, undefined);
    assert.equal(result.patches.top.length, 1);

    const geometry = toBufferGeometry(
        result,
        Object.fromEntries(Object.keys(result.regions).map(name => [name, 0]))
    );
    try {
        assert.equal(getControlMesh(geometry), result.geometry);
        assert.ok(geometry.getAttribute("uv").count > 0);
    } finally {
        geometry.dispose();
    }
});

test("width field can vary along the selected ring without splitting its neighbors", () => {
    const source = box();
    const widths = [];
    const result = bevelEdges(source, topEdges(source), t => {
        widths.push(t);
        return 0.12 + 0.06 * t;
    });
    assert.deepEqual(widths.map(t => Number(t.toFixed(5))),
        [0, 0.25, 0.5, 0.75]);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(result.regions.bevel.length, 4);
    assert.equal(result.geometry.quads.length, 10);
    const upper = result.boundaries["bevel-upper"][0].vertices;
    const lower = result.boundaries["bevel-lower"][0].vertices;
    const displacements = upper.map((id, i) =>
        result.geometry.vertices[id].distanceTo(
            result.geometry.vertices[lower[i]]
        )
    );
    assert.ok(Math.max(...displacements) > Math.min(...displacements));
});

test("invalid selection order and excessive widths fail without source changes", () => {
    const source = box();
    const original = JSON.stringify(source.geometry.vertices);
    const edges = topEdges(source);
    // A single open edge is an intentionally supported terminated bevel.
    const single = bevelEdges(source, [edges[0]], () => 0.1);
    assert.equal(topologyOf(single).openBoundaries().length, 0);
    assert.throws(
        () => bevelEdges(source,
            [edges[0], edges[2], edges[1], edges[3]], () => 0.1),
        error => error.reason === "invalid-topology"
    );
    assert.throws(
        () => bevelEdges(source, edges, () => 1.01),
        error => error.reason === "unsupported-topology"
    );
    assert.throws(
        () => bevelEdges(source, edges, () => NaN),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => bevelEdges(source, edges.map(e => ({
            ...e, owner: Symbol()
        })), () => 0.1),
        error => error.reason === "invalid-input"
    );
    assert.equal(JSON.stringify(source.geometry.vertices), original);
});

test("partial open chains are rejected instead of silently opening the solid", () => {
    const source = box();
    const edges = topEdges(source);
    assert.throws(
        () => bevelEdges(source, edges.slice(0, 3), () => 0.1),
        error => error.reason === "invalid-topology" ||
            error.reason === "unsupported-topology"
    );
});

test("a triangular prism cap gets a three-panel bevel without open edges", () => {
    const prism = extrudeContour({
        outer: {
            closed: true,
            points: [
                new THREE.Vector2(-1, -1),
                new THREE.Vector2(-1, 1),
                new THREE.Vector2(1, -1)
            ]
        }
    }, {frame: new THREE.Matrix4(), depth: 1});
    const rim = topologyOf(prism).regionBoundaries("cap-end")[0];
    assert.equal(rim.vertices.length, 3);
    const result = bevelEdges(prism, rim.vertices.map((from, i) => ({
        owner: prism.id,
        from,
        to: rim.vertices[(i + 1) % rim.vertices.length]
    })), () => 0.08);

    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 3);
    assert.equal(result.boundaries["bevel-upper"][0].vertices.length, 3);
    assert.equal(result.boundaries["bevel-lower"][0].vertices.length, 3);
    assert.equal(result.geometry.quads.length, prism.geometry.quads.length + 3);
});

test("one open manifold edge is beveled with closed physical terminal triangles", () => {
    const source = box();
    const edge = topEdges(source)[0];
    const original = source.geometry.vertices.map(point => point.clone());
    const result = bevelEdges(source, [edge], () => 0.12);
    assert.deepEqual(source.geometry.vertices, original);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 3);
    assert.equal(result.geometry.quads.filter(face =>
        face.surface === "bevel"
    ).length, 1);
    assert.equal(result.geometry.triangles.filter(face =>
        face.surface === "bevel"
    ).length, 2);
    assert.equal(result.boundaries["bevel-upper"].length, 1);
    assert.equal(result.boundaries["bevel-upper"][0].closed, false);
    assert.equal(result.boundaries["bevel-lower"][0].closed, false);
    assert.equal(result.boundaries.topRim.length, 1);
    assert.equal(result.boundaries.topRim[0].closed, false);
    assert.equal(result.boundaries.topRim[0].vertices.length, 4);
    assertSelectionOwner(result, result.boundaries.topRim[0]);
    for (const name of ["bevel-upper", "bevel-lower"]) {
        const selected = result.boundaries[name][0];
        assertSelectionOwner(result, selected);
        assert.equal(selected.vertices.length, 2);
        assert.equal(topologyOf(result).edgeUses(
            selected.vertices[0], selected.vertices[1]
        ).length, 2);
    }
    assert.ok(result.patches.top?.length);
    assertSelectionOwner(result, result.patches.top[0]);
});

test("open edge chamfer is invariant to the caller's edge direction", () => {
    const source = box();
    const e = topEdges(source)[0];
    const forward = bevelEdges(source, [e], () => 0.08);
    const reversed = bevelEdges(source, [{
        owner: source.id, from: e.to, to: e.from
    }], () => 0.08);
    assert.equal(topologyOf(reversed).openBoundaries().length, 0);
    assert.equal(reversed.regions.bevel.length, 3);
    assert.equal(forward.geometry.triangles.length,
        reversed.geometry.triangles.length);
});

test("a full top and bottom bevel retain both independent named rings", () => {
    const source = box();
    const bottom = topologyOf(source).regionBoundaries("ny")[0].vertices;
    const rings = [
        ...topEdges(source),
        ...bottom.map((from, i) => ({
            owner: source.id,
            from, to: bottom[(i + 1) % bottom.length]
        }))
    ];
    const distances = [];
    const result = bevelEdges(source, rings, t => {
        distances.push(t);
        return 0.14;
    });
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 8);
    assert.equal(result.boundaries["bevel-upper"].length, 2);
    assert.equal(result.boundaries["bevel-lower"].length, 2);
    assert.deepEqual(distances.map(x => Number(x.toFixed(2))),
        [0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75]);
    for (const rim of result.boundaries["bevel-upper"]) {
        assertSelectionOwner(result, rim);
    }
});

test("unclosed and shared-corner ring sets do not create partial geometry", () => {
    const source = box();
    const edges = topEdges(source);
    assert.throws(
        () => bevelEdges(source, [
            ...edges, ...edges
        ], () => 0.1),
        error => error.reason === "unsupported-topology"
    );
    assert.throws(
        () => bevelEdges(source, [
            ...edges, ...edges.slice(0, 1)
        ], () => 0.1),
        error => error.reason === "unsupported-topology"
    );
});

test("open chamfer rejects a broken or concave dihedral", () => {
    const source = box();
    const edge = topEdges(source)[0];
    assert.throws(
        () => bevelEdges(source, [edge], () => 2),
        error => error.reason === "unsupported-topology"
    );
});
