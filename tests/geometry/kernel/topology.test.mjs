import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { toolbox } from "../../support/toolbox.mjs";

const { AuthoredMeshBuilder } = await toolbox(
    "geometry/mesh/AuthoredMeshBuilder.ts"
);
const { geometryResult } = await toolbox("geometry/kernel/GeometryResult.ts");
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

function adjacentFaces() {
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const vertices = [
        [0, 0], [1, 0], [1, 1], [0, 1], [2, 0], [2, 1]
    ].map(([x, y]) => builder.addVertex(new THREE.Vector3(x, y, 0)));
    const uv = () => [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(1, 0),
        new THREE.Vector2(1, 1),
        new THREE.Vector2(0, 1)
    ];
    builder.addIndexedFace(
        [vertices[0], vertices[1], vertices[2], vertices[3]], uv(), "left"
    );
    builder.addIndexedFace(
        [vertices[1], vertices[4], vertices[5], vertices[2]], uv(), "right"
    );
    return builder.build();
}

test("shared authored edges survive material changes and rendering", () => {
    const result = geometryResult(adjacentFaces());
    const index = topologyOf(result);

    assert.equal(topologyOf(result), index);
    assert.equal(index.owner, result.id);
    assert.equal(index.edgeUses(1, 2).length, 2);
    assert.deepEqual(index.faceNeighbors({ kind: "quad", index: 0 }),
        [{ kind: "quad", index: 1 }]);
    assert.equal(index.connectedComponents().length, 1);
    const outline = index.openBoundaries();
    assert.equal(outline.length, 1);
    assert.equal(outline[0].closed, true);
    assert.equal(outline[0].vertices.length, 6);
    assert.equal(index.regionBoundaries("left")[0].vertices.length, 4);
    assert.equal(index.regionBoundaries("right")[0].vertices.length, 4);

    const material = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "KernelProof",
        geometry: result,
        materials: material
    });
    try {
        assert.equal(getControlOutline(mesh.geometry).quadCount, 2);
        assert.equal(mesh.geometry.index.count, 12);
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }
});

test("same-direction shared edges are rejected as invalid topology", () => {
    const source = adjacentFaces();
    source.quads[1].corners = [1, 2, 5, 4];
    const index = topologyOf(geometryResult(source));
    assert.equal(index.edgeUses(1, 2).length, 2);
    assert.throws(
        () => index.openBoundaries(),
        error => error.reason === "invalid-topology"
    );
});
