import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { capBoundary } = await toolbox(
    "geometry/build/finishBoundaries.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);

const square = z => [
    new THREE.Vector3(-1, -1, z),
    new THREE.Vector3(1, -1, z),
    new THREE.Vector3(1, 1, z),
    new THREE.Vector3(-1, 1, z)
];

function walls(rings, options = {}) {
    return loftSectionWalls(rings.map(points => ({
        outer: { points, closed: true }
    })), options);
}

function capBoth(source, tessellation, heights) {
    let result = source;
    for (const [name, z] of [["start", heights[0]], ["end", heights[1]]]) {
        result = capBoundary(
            result,
            result.boundaries[`${name}-outer`][0],
            {
                region: `cap-${name}`,
                uvFrame: new THREE.Matrix4().makeTranslation(0, 0, z),
                tessellation
            }
        );
    }
    return result;
}

test("four-corner loft retains per-edge UVs and true quad caps", () => {
    const solid = capBoth(walls([square(0), square(1), square(2)], {
        uvMode: "edge",
        surfaceAt: ({ edge }) => `side-${edge}`,
        smoothingGroupAt: ({ edge }) => `side-${edge}`
    }), "quad-if-planar", [0, 2]);

    const mesh = solid.geometry;
    assert.equal(mesh.quads.length, 10);
    assert.equal(mesh.triangles?.length ?? 0, 0);
    assert.deepEqual(
        mesh.quads.slice(0, 4).map(face => face.surface),
        ["side-0", "side-1", "side-2", "side-3"]
    );
    assert.deepEqual(
        mesh.quads[0].uvs.map(uv => uv.toArray()),
        [[0, 0], [2, 0], [2, 1], [0, 1]]
    );
    assert.equal(solid.regions["cap-start"].length, 1);
    assert.equal(solid.regions["cap-end"].length, 1);
    assert.equal(topologyOf(solid).openBoundaries().length, 0);
});

test("general loft keeps continuous perimeter UVs and surface callbacks", () => {
    const solid = capBoth(walls([square(0), square(2)], {
        surfaceAt: ({ edge, interval }) => `panel-${edge}-${interval}`,
        smoothingGroupAt: ({ edge }) => `wood-${edge}`
    }), "triangulate", [0, 2]);

    const mesh = solid.geometry;
    assert.equal(mesh.quads.length, 4);
    assert.equal(mesh.triangles.length, 4);
    assert.equal(mesh.quads[1].surface, "panel-1-0");
    assert.equal(mesh.quads[1].smoothingGroup, "wood-1");
    assert.deepEqual(
        mesh.quads[1].uvs.map(uv => uv.toArray()),
        [[2, 0], [4, 0], [4, 2], [2, 2]]
    );
    assert.equal(topologyOf(solid).openBoundaries().length, 0);
});

test("open ends remain real, uncapped boundary loops", () => {
    const solid = walls([square(0), square(2)]);
    assert.equal(solid.geometry.triangles?.length ?? 0, 0);
    assert.equal(topologyOf(solid).openBoundaries().length, 2);
});
