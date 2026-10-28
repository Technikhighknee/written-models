import test, { after } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createServer } from "vite";

const vite = await createServer({
    appType: "custom",
    server: { middlewareMode: true },
    logLevel: "silent"
});
after(async () => { await vite.close(); });

const { AuthoredMeshBuilder } = await vite.ssrLoadModule(
    "/src/toolbox/geometry/mesh/AuthoredMeshBuilder.ts"
);
const { geometryResult, assertSelectionOwner } = await vite.ssrLoadModule(
    "/src/toolbox/geometry/kernel/GeometryResult.ts"
);
const { topologyOf } = await vite.ssrLoadModule(
    "/src/toolbox/geometry/kernel/topology.ts"
);
const { surfaceMesh } = await vite.ssrLoadModule(
    "/src/toolbox/geometry/mesh/surfaceMesh.ts"
);
const { getControlOutline } = await vite.ssrLoadModule(
    "/src/toolbox/geometry/mesh/controlOutline.ts"
);

const uv = () => [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(1, 0),
    new THREE.Vector2(1, 1),
    new THREE.Vector2(0, 1)
];

function adjoiningQuads() {
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const points = [
        [0, 0], [1, 0], [1, 1], [0, 1], [2, 0], [2, 1]
    ].map(([x, y]) => builder.addVertex(new THREE.Vector3(x, y, 0)));
    builder.addIndexedFace([points[0], points[1], points[2], points[3]], uv(), "left");
    builder.addIndexedFace([points[1], points[4], points[5], points[2]], uv(), "right");
    return builder.build();
}

test("owned geometry copies vertices, UVs and face arrays", () => {
    const source = adjoiningQuads();
    const first = geometryResult(source);
    const second = geometryResult(source);

    source.vertices[0].set(10, 10, 10);
    source.quads[0].uvs[0].set(20, 20);
    source.quads[0].corners[0] = 5;

    assert.equal(first.geometry.vertices[0].x, 0);
    assert.equal(first.geometry.quads[0].uvs[0].x, 0);
    assert.equal(first.geometry.quads[0].corners[0], 0);
    assert.notEqual(first.id, second.id);
    assert.deepEqual(first.regions.left, [{ kind: "quad", index: 0 }]);
    assert.deepEqual(first.regions.right, [{ kind: "quad", index: 1 }]);

    const boundary = topologyOf(first).openBoundaries()[0];
    assert.doesNotThrow(() => assertSelectionOwner(first, boundary));
    assert.throws(
        () => assertSelectionOwner(second, boundary),
        error => error.reason === "invalid-input"
    );
});

test("topology comes from authored edges, including shared material borders", () => {
    const result = geometryResult(adjoiningQuads());
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

test("coincident parts remain independent without explicit shared IDs", () => {
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const triangle = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0)
    ];
    builder.addFace(triangle, uv().slice(0, 3), "front");
    builder.addFace(triangle, uv().slice(0, 3), "back");

    const result = geometryResult(builder.build());
    assert.equal(result.geometry.vertices.length, 6);
    assert.equal(topologyOf(result).connectedComponents().length, 2);
});

test("same-direction shared edges cannot masquerade as manifold boundaries", () => {
    const source = adjoiningQuads();
    source.quads[1].corners = [1, 2, 5, 4];
    const index = topologyOf(geometryResult(source));
    assert.equal(index.edgeUses(1, 2).length, 2);
    assert.throws(
        () => index.openBoundaries(),
        error => error.reason === "invalid-topology"
    );
});
