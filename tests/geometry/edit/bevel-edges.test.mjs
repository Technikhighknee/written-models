import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {bevelEdges} = await toolbox("geometry/edit/bevelEdges.ts");
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
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
    assert.throws(
        () => bevelEdges(source, [edges[0]], () => 0.1),
        error => error.reason === "invalid-input"
    );
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
