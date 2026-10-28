import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

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

const outer = z => [
    new THREE.Vector3(-1, -1, z),
    new THREE.Vector3(1, -1, z),
    new THREE.Vector3(1, 1, z),
    new THREE.Vector3(-1, 1, z)
];

const inner = z => [
    new THREE.Vector3(-0.5, -0.5, z),
    new THREE.Vector3(-0.5, 0.5, z),
    new THREE.Vector3(0.5, 0.5, z),
    new THREE.Vector3(0.5, -0.5, z)
];

function section(z) {
    return {
        outer: { points: outer(z), closed: true },
        inner: [{ points: inner(z), closed: true }]
    };
}

test("hollow sections share the quad engine but not wall topology", () => {
    const original = [section(0), section(1), section(2)];
    const result = loftSectionWalls(original, {
        surfaceAt: ({ loop, edge }) =>
            loop === 0 ? `wood-${edge}` : "inner-wood",
        smoothingGroupAt: ({ loop }) =>
            loop === 0 ? "outside" : "inside"
    });

    assert.equal(result.geometry.vertices.length, 24);
    assert.equal(result.geometry.quads.length, 16);
    assert.equal(topologyOf(result).connectedComponents().length, 2);
    assert.equal(topologyOf(result).openBoundaries().length, 4);

    const rim = result.boundaries["start-inner-0"][0];
    assertSelectionOwner(result, rim);
    assert.deepEqual(rim.vertices, [12, 13, 14, 15]);
    assert.equal(result.geometry.quads[0].surface, "wood-0");
    assert.equal(result.geometry.quads[8].surface, "inner-wood");

    const wood = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "HollowSection",
        geometry: result,
        materials: wood
    });

    try {
        assert.equal(getControlOutline(mesh.geometry).quadCount, 16);
    } finally {
        mesh.geometry.dispose();
        wood.dispose();
    }

    assert.equal(original[0].outer.points[0].x, -1);
});

test("incorrectly oriented or changing inner loops are rejected", () => {
    const wrong = section(1);
    wrong.inner[0].points.reverse();

    assert.throws(
        () => loftSectionWalls([section(0), wrong]),
        /oppose outer winding/
    );

    const changed = section(1);
    changed.inner[0].points.pop();

    assert.throws(
        () => loftSectionWalls([section(0), changed]),
        /matching closed contours/
    );
});
