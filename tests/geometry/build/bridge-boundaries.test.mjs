import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { bridgeBoundaries } = await toolbox(
    "geometry/build/bridgeBoundaries.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);

const point = (x, y, z) => new THREE.Vector3(x, y, z);

function openRibbon() {
    return {
        from: {
            closed: false,
            points: [point(0, 0, 0), point(0.5, 0, 0), point(1, 0, 0)]
        },
        to: {
            closed: false,
            points: [
                point(0, 0, 1), point(0.2, 0, 1),
                point(0.6, 0, 1), point(1, 0, 1)
            ]
        },
        options: {
            fromStations: [0, 0.5, 1],
            toStations: [0, 0.2, 0.6, 1],
            region: "transition"
        }
    };
}

function ring(count, z) {
    const points = Array.from({ length: count }, (_, index) => {
        const angle = -Math.PI * 0.75 + index * Math.PI * 2 / count;
        return point(Math.cos(angle), Math.sin(angle), z);
    });

    return { closed: true, points };
}

test("an open bridge consumes every authored edge with genuine triangles", () => {
    const { from, to, options } = openRibbon();
    const result = bridgeBoundaries(from, to, options);
    const topology = topologyOf(result);

    assert.equal(result.geometry.vertices.length, 7);
    assert.equal(result.geometry.triangles.length, 5);
    assert.equal(result.geometry.quads.length, 0);
    assert.equal(topology.openBoundaries().length, 1);
    assert.equal(topology.connectedComponents().length, 1);
    assert.equal(result.regions.transition.length, 5);

    assert.deepEqual(result.boundaries.from[0].vertices, [2, 1, 0]);
    assert.deepEqual(result.boundaries.to[0].vertices, [3, 4, 5, 6]);
    assertSelectionOwner(result, result.boundaries.from[0]);

    for (const boundary of [
        result.boundaries.from[0],
        result.boundaries.to[0]
    ]) {
        const ids = boundary.vertices;
        for (let i = 0; i < ids.length - 1; i++) {
            assert.equal(topology.edgeUses(ids[i], ids[i + 1]).length, 1);
        }
    }

    const material = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "Bridge",
        geometry: result,
        materials: material
    });

    try {
        assert.equal(getControlOutline(mesh.geometry).quadCount, 0);
        assert.equal(mesh.geometry.index.count, 15);
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }

    assert.equal(from.points[0].z, 0);
});

test("closed bridges reuse seam vertices and unwrapped perimeter UVs", () => {
    const from = ring(4, 0);
    const to = ring(7, 1);
    const result = bridgeBoundaries(from, to, {
        fromStations: [0, 0.25, 0.5, 0.75],
        toStations: Array.from({ length: 7 }, (_, i) => i / 7)
    });
    const topology = topologyOf(result);

    assert.equal(result.geometry.vertices.length, 11);
    assert.equal(result.geometry.triangles.length, 11);
    assert.equal(topology.openBoundaries().length, 2);
    assert.equal(topology.connectedComponents().length, 1);
    assert.equal(result.boundaries.from[0].closed, true);
    assert.equal(result.boundaries.to[0].closed, true);
    assert.deepEqual(result.boundaries.from[0].vertices, [0, 3, 2, 1]);
    assert.deepEqual(result.boundaries.to[0].vertices, [4, 5, 6, 7, 8, 9, 10]);

    // Only eleven distinct authored vertices exist, but the final seam
    // faces use full-perimeter U coordinates on the reused first IDs.
    const seams = result.geometry.triangles.flatMap(face =>
        face.corners.flatMap((id, corner) =>
            (id === 0 || id === 4) ? [face.uvs[corner].x] : []
        )
    );
    assert.ok(seams.some(u => u === 0));
    assert.ok(seams.some(u => u > 4));
});

test("matching periodic stations become authored quads instead of fake pairs", () => {
    const from = ring(4, 0);
    const to = ring(4, 1);
    const stations = [0, 0.25, 0.5, 0.75];

    const result = bridgeBoundaries(from, to, {
        fromStations: stations,
        toStations: stations,
        region: "side"
    });

    assert.equal(result.geometry.quads.length, 4);
    assert.equal(result.geometry.triangles.length, 0);
    assert.equal(topologyOf(result).openBoundaries().length, 2);
    assert.equal(result.regions.side.length, 4);

    const last = result.geometry.quads.at(-1);
    assert.deepEqual(last.corners, [3, 7, 4, 0]);
    assert.ok(last.uvs[2].x > 4);
    assert.ok(last.uvs[3].x > 4);
});

test("only matching intervals form quads; unequal stations remain triangles", () => {
    const from = {
        closed: false,
        points: [0, 0.2, 0.5, 1].map(x => point(x, 0, 0))
    };
    const to = {
        closed: false,
        points: [0, 0.2, 0.6, 1].map(x => point(x, 0, 1))
    };

    const result = bridgeBoundaries(from, to, {
        fromStations: [0, 0.2, 0.5, 1],
        toStations: [0, 0.2, 0.6, 1]
    });

    assert.equal(result.geometry.quads.length, 1);
    assert.equal(result.geometry.triangles.length, 4);
    assert.equal(topologyOf(result).openBoundaries().length, 1);
});

test("reversed winding also reverses the selected open edge directions", () => {
    const { from, to, options } = openRibbon();
    const result = bridgeBoundaries(from, to, {
        ...options,
        reverseWinding: true
    });
    const topology = topologyOf(result);

    assert.deepEqual(result.boundaries.from[0].vertices, [0, 1, 2]);
    assert.deepEqual(result.boundaries.to[0].vertices, [6, 5, 4, 3]);
    assert.equal(topology.openBoundaries().length, 1);
});

test("invalid station correspondences and touching contours fail explicitly", () => {
    const { from, to, options } = openRibbon();

    assert.throws(
        () => bridgeBoundaries(from, to, {
            ...options,
            toStations: [0, 0.8, 0.6, 1]
        }),
        error => error.operation === "bridgeBoundaries" &&
            error.reason === "invalid-input"
    );

    assert.throws(
        () => bridgeBoundaries(from, {
            ...to, points: [from.points[0], ...to.points.slice(1)]
        }, options),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => bridgeBoundaries(from, {
            ...to, closed: true
        }, options),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => bridgeBoundaries(ring(4, 0), ring(7, 1), {
            fromStations: [0, 0.25, 0.5, 1],
            toStations: Array.from({ length: 7 }, (_, i) => i / 7)
        }),
        error => error.reason === "invalid-input"
    );
});
