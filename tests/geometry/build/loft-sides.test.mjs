import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { loftSections } = await toolbox(
    "geometry/construction/loftSections.ts"
);
const { loftRings } = await toolbox(
    "geometry/construction/loftRings.ts"
);
const { geometryResult } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
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

test("four-corner loft retains per-edge UVs and true quad caps", () => {
    const mesh = loftSections([
        square(0),
        square(1),
        square(2)
    ]);

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
    assert.deepEqual(
        mesh.quads.at(-2).corners,
        [3, 2, 1, 0]
    );
    assert.equal(mesh.quads.at(-1).surface, "cap-end");

    const authored = geometryResult(mesh);
    assert.equal(topologyOf(authored).openBoundaries().length, 0);
});

test("general loft keeps continuous perimeter UVs and surface callbacks", () => {
    const mesh = loftRings({
        rings: [square(0), square(2)],
        surface: (side, interval) => `panel-${side}-${interval}`,
        smoothingGroup: side => `wood-${side}`
    });

    assert.equal(mesh.quads.length, 4);
    assert.equal(mesh.triangles.length, 4);
    assert.equal(mesh.quads[1].surface, "panel-1-0");
    assert.equal(mesh.quads[1].smoothingGroup, "wood-1");
    assert.deepEqual(
        mesh.quads[1].uvs.map(uv => uv.toArray()),
        [[2, 0], [4, 0], [4, 2], [2, 2]]
    );

    const authored = geometryResult(mesh);
    assert.equal(topologyOf(authored).openBoundaries().length, 0);
});

test("open ends remain real, uncapped boundary loops", () => {
    const mesh = loftRings({
        rings: [square(0), square(2)],
        start: "open",
        end: "open"
    });

    assert.equal(mesh.triangles.length, 0);
    assert.equal(
        topologyOf(geometryResult(mesh)).openBoundaries().length,
        2
    );
});
