import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { toolbox } from "../../support/toolbox.mjs";

const { AuthoredMeshBuilder } = await toolbox(
    "geometry/mesh/AuthoredMeshBuilder.ts"
);
const { geometryResult, assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");

test("snapshot owns its geometry and selections", () => {
    const builder = new AuthoredMeshBuilder();
    builder.addFace(
        [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(1, 1, 0),
            new THREE.Vector3(0, 1, 0)
        ],
        [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(1, 0),
            new THREE.Vector2(1, 1),
            new THREE.Vector2(0, 1)
        ],
        "top"
    );

    const original = builder.build();
    const first = geometryResult(original);
    const second = geometryResult(original);

    original.vertices[0].set(10, 10, 10);
    original.quads[0].uvs[0].set(8, 8);
    original.quads[0].corners[0] = 3;

    assert.equal(first.geometry.vertices[0].x, 0);
    assert.equal(first.geometry.quads[0].uvs[0].x, 0);
    assert.equal(first.geometry.quads[0].corners[0], 0);
    assert.deepEqual(first.regions.top, [{ kind: "quad", index: 0 }]);
    assert.notEqual(first.id, second.id);

    const boundary = topologyOf(first).openBoundaries()[0];
    assert.doesNotThrow(() => assertSelectionOwner(first, boundary));
    assert.throws(
        () => assertSelectionOwner(second, boundary),
        error => error.reason === "invalid-input"
    );
});

test("coincident parts can remain topologically independent", () => {
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0)
    ];
    const uv = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(1, 0),
        new THREE.Vector2(0, 1)
    ];

    builder.addFace(points, uv, "front");
    builder.addFace(points, uv, "back");

    const result = geometryResult(builder.build());
    assert.equal(result.geometry.vertices.length, 6);
    assert.equal(topologyOf(result).connectedComponents().length, 2);
});
