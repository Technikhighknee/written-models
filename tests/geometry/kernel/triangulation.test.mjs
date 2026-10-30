import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { toolbox } from "../../support/toolbox.mjs";

const { geometryResult } = await toolbox("geometry/kernel/GeometryResult.ts");
const { triangulateAuthoredFaces } = await toolbox(
    "geometry/kernel/triangulation.ts"
);
const { getRenderTriangleSources } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");

const vertex = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const uv = (x, y) => new THREE.Vector2(x, y);

const authored = {
    vertices: [
        vertex(0, 0), vertex(1, 0), vertex(1, 1), vertex(0, 1),
        vertex(2, 0), vertex(2, 1),
        vertex(3, 0), vertex(4, 0), vertex(3, 1)
    ],
    quads: [
        {
            corners: [0, 1, 2, 3],
            uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
            surface: "wood"
        },
        {
            corners: [1, 4, 5, 2],
            uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
            surface: "iron"
        }
    ],
    triangles: [{
        corners: [6, 7, 8],
        uvs: [uv(0, 0), uv(1, 0), uv(0, 1)],
        surface: "wood"
    }]
};

test("render material sorting preserves every authored triangle's provenance", () => {
    const source = geometryResult(authored);
    const triangles = triangulateAuthoredFaces(source.geometry);
    assert.deepEqual(
        triangles.map(t => [t.face.kind, t.face.index, [...t.faceCorners]]),
        [
            ["quad", 0, [0, 1, 2]],
            ["quad", 0, [0, 2, 3]],
            ["quad", 1, [0, 1, 2]],
            ["quad", 1, [0, 2, 3]],
            ["triangle", 0, [0, 1, 2]]
        ]
    );

    const wood = new THREE.MeshBasicMaterial();
    const iron = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "MaterialSorted",
        geometry: source,
        materials: { wood, iron }
    });
    try {
        const ordered = getRenderTriangleSources(mesh.geometry);
        assert.ok(ordered);
        assert.equal(ordered.length, mesh.geometry.index.count / 3);
        assert.deepEqual(
            ordered.map(t => [t.face.kind, t.face.index, [...t.faceCorners]]),
            [
                ["quad", 0, [0, 1, 2]],
                ["quad", 0, [0, 2, 3]],
                ["triangle", 0, [0, 1, 2]],
                ["quad", 1, [0, 1, 2]],
                ["quad", 1, [0, 2, 3]]
            ]
        );
        for (let i = 0; i < ordered.length; i++) {
            const tri = ordered[i];
            const original = tri.face.kind === "quad"
                ? source.geometry.quads[tri.face.index]
                : source.geometry.triangles[tri.face.index];
            for (let c = 0; c < 3; c++) {
                const gpuVertex = mesh.geometry.index.getX(i * 3 + c);
                const p = mesh.geometry.getAttribute("position");
                const u = mesh.geometry.getAttribute("uv");
                const position = source.geometry.vertices[tri.vertices[c]];
                const texel = original.uvs[tri.faceCorners[c]];
                assert.ok(Math.abs(p.getX(gpuVertex) - position.x) < 1e-6);
                assert.ok(Math.abs(p.getY(gpuVertex) - position.y) < 1e-6);
                assert.ok(Math.abs(u.getX(gpuVertex) - texel.x) < 1e-6);
                assert.ok(Math.abs(u.getY(gpuVertex) - texel.y) < 1e-6);
            }
        }
    } finally {
        mesh.geometry.dispose();
        wood.dispose();
        iron.dispose();
    }
});
