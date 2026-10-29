import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { fillSurfacePatch } = await toolbox(
    "geometry/build/fillSurfacePatch.ts"
);
const { shapeSurfaceRelief } = await toolbox(
    "geometry/edit/shapeSurfaceRelief.ts"
);
const { joinGeometry } = await toolbox(
    "geometry/build/joinGeometry.ts"
);
const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

const p = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const profile = () => ({
    outer: {
        points: [
            new THREE.Vector2(-1, -1),
            new THREE.Vector2(-1, 1),
            new THREE.Vector2(1, 1),
            new THREE.Vector2(1, -1)
        ],
        parameters: [0, 0.25, 0.5, 0.75]
    }
});
const chart = {
    at: uv => p(uv.x, uv.y, 1),
    parameterOf: point => new THREE.Vector2(point.x, point.y),
    normalAt: () => p(0, 0, 1)
};

function cap() {
    return fillSurfacePatch({
        profile: profile(),
        chart,
        region: "wood-top"
    });
}

function feature(a, middle, b, depth, width = 0.28) {
    return {
        path: {
            points: [a, middle, b],
            parameters: [0, 0.5, 1],
            closed: false
        },
        halfWidthAt: () => width,
        displacementAt: (u, t) => {
            const fade = Math.min(1, t * 5, (1 - t) * 5);
            return -depth * (1 - u * u) * Math.max(0, fade);
        },
        regionAt: u => Math.abs(u) < 0.55
            ? "groove-floor" : "groove-shoulder"
    };
}

const vertical = () => feature(
    p(0, -0.7, 1), p(0, 0, 1), p(0, 0.7, 1), 0.08
);
const horizontal = () => feature(
    p(-0.7, 0, 1), p(0, 0, 1), p(0.7, 0, 1), 0.05
);

function edgeSet(result) {
    return result.boundaries.outer[0].vertices.map(id =>
        result.geometry.vertices[id].toArray()
    );
}

function vertexAt(result, x, y) {
    return result.geometry.vertices.find(point =>
        Math.abs(point.x - x) < 1e-10 &&
        Math.abs(point.y - y) < 1e-10
    );
}

test("two crossing grooves reconstruct one surface with retained exact rims", () => {
    const original = cap();
    const before = edgeSet(original);
    const result = shapeSurfaceRelief(
        original, original.patches["wood-top"][0],
        [vertical(), horizontal()],
        { overlap: "minimum", maxDeviation: 0.005 }
    );

    assert.equal(topologyOf(result).openBoundaries().length, 1);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.deepEqual(edgeSet(result), before);
    assert.ok(result.geometry.vertices.length > original.geometry.vertices.length);
    assert.ok(result.geometry.triangles.length > original.geometry.triangles.length);
    assert.ok(result.regions["groove-floor"]?.length > 0);
    assert.ok(result.regions["groove-shoulder"]?.length > 0);
    assert.ok(result.regions["wood-top"]?.length > 0);

    const middle = vertexAt(result, 0, 0);
    assert.ok(middle);
    assert.ok(Math.abs(middle.z - 0.92) < 1e-10);
    assertSelectionOwner(result, result.patches["wood-top"][0]);
    assert.equal(result.patches["wood-top"][0].faces.length,
        result.geometry.triangles.length);

    const material = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "BatchedSurfaceRelief",
        geometry: result,
        materials: material
    });

    try {
        assert.equal(getControlOutline(mesh.geometry).quadCount, 0);
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }

    assert.equal(original.geometry.vertices.length, 4);
});

test("overlap sum adds both signed fields instead of choosing minimum", () => {
    const source = cap();
    const result = shapeSurfaceRelief(
        source, source.patches["wood-top"][0],
        [vertical(), horizontal()],
        { overlap: "sum", maxDeviation: 0.005 }
    );

    const center = vertexAt(result, 0, 0);
    assert.ok(center);
    assert.ok(Math.abs(center.z - 0.87) < 1e-10);
    assert.deepEqual(edgeSet(result), edgeSet(source));
});

test("relief on a joined top preserves the welded rim and untouched wall", () => {
    const wall = loftSectionWalls([
        { outer: {
            points: [p(-1, -1, 0), p(1, -1, 0),
                p(1, 1, 0), p(-1, 1, 0)],
            closed: true
        } },
        { outer: {
            points: [p(-1, -1, 1), p(1, -1, 1),
                p(1, 1, 1), p(-1, 1, 1)],
            closed: true
        } }
    ]);
    const top = cap();
    const joined = joinGeometry([wall, top], {
        weld: [{
            firstPart: 0, first: wall.boundaries["end-outer"][0],
            secondPart: 1, second: top.boundaries.outer[0]
        }]
    });
    const previous = joined.geometry.vertices.map(point => point.clone());
    const patch = joined.patches["1:wood-top"][0];
    const result = shapeSurfaceRelief(
        joined, patch, [vertical()],
        { overlap: "minimum", maxDeviation: 0.005 }
    );

    assert.equal(topologyOf(result).openBoundaries().length, 1);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.geometry.quads.length, 4);
    assert.deepEqual(result.geometry.vertices.slice(0, previous.length)
        .filter(v => v.x === 1 || v.x === -1 || v.y === 1 || v.y === -1),
    previous.filter(v => v.x === 1 || v.x === -1 || v.y === 1 || v.y === -1));
    assert.ok(result.regions.outer.length === 4);
    assert.ok(result.patches["1:wood-top"]?.length === 1);
});

test("relief reaching a shared boundary is refused, rather than moving it", () => {
    const source = cap();
    const nearEdge = feature(
        p(0.93, -0.7, 1), p(0.93, 0, 1), p(0.93, 0.7, 1),
        0.08, 0.25
    );

    assert.throws(
        () => shapeSurfaceRelief(
            source, source.patches["wood-top"][0],
            [nearEdge], { overlap: "minimum" }
        ),
        error => error.operation === "shapeSurfaceRelief" &&
            error.reason === "unsupported-topology"
    );

    assert.equal(source.geometry.vertices.length, 4);
});

test("stale selections and non-tapering or invalid feature paths fail", () => {
    const original = cap();
    const another = cap();

    assert.throws(
        () => shapeSurfaceRelief(
            another, original.patches["wood-top"][0],
            [vertical()], { overlap: "minimum" }
        ),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => shapeSurfaceRelief(
            original, original.patches["wood-top"][0],
            [{ ...vertical(), displacementAt: () => -0.1 }],
            { overlap: "minimum" }
        ),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => shapeSurfaceRelief(
            original, original.patches["wood-top"][0],
            [{ ...vertical(), halfWidthAt: () => -1 }],
            { overlap: "minimum" }
        ),
        error => error.reason === "invalid-input"
    );
});
