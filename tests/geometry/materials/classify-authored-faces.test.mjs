import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { toolbox } from "../../support/toolbox.mjs";

const { geometryResult, assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { classifyAuthoredFaces } = await toolbox(
    "geometry/materials/classifyAuthoredFaces.ts"
);

const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const uvs = () => [
    new THREE.Vector2(0, 0), new THREE.Vector2(1, 0),
    new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)
];

test("classify authored quads without changing geometry, UVs or owned selections", () => {
    const initial = geometryResult({
        vertices: [
            v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0),
            v(2, 0, 0), v(2, 1, 0), v(2, 1, 1), v(2, 0, 1)
        ],
        quads: [
            { corners: [0, 1, 2, 3], uvs: uvs(), surface: "raw" },
            { corners: [4, 5, 6, 7], uvs: uvs(), surface: "raw" }
        ]
    });
    const source = {
        ...initial,
        boundaries: {
            top: [{ owner: initial.id, vertices: [0, 1, 2, 3], closed: true }]
        },
        patches: {
            top: [{
                owner: initial.id,
                faces: [{ kind: "quad", index: 0 }],
                chart: {
                    at: uv => v(uv.x, uv.y, 0),
                    parameterOf: point => new THREE.Vector2(point.x, point.y),
                    normalAt: () => v(0, 0, 1)
                }
            }]
        }
    };

    const result = classifyAuthoredFaces(source, face => ({
        surface: face.normal.z > 0.9 ? "top" : "side",
        smoothingGroup: face.normal.z > 0.9 ? "flat" : undefined
    }));

    assert.notEqual(result.id, source.id);
    assert.deepEqual(result.regions.top, [{ kind: "quad", index: 0 }]);
    assert.deepEqual(result.regions.side, [{ kind: "quad", index: 1 }]);
    assert.equal(result.geometry.quads[0].smoothingGroup, "flat");
    assert.equal(result.geometry.quads[1].smoothingGroup, undefined);
    assert.equal(source.geometry.quads[0].surface, "raw");
    assert.equal(source.geometry.quads[0].smoothingGroup, undefined);
    assert.deepEqual(result.geometry.quads[0].uvs, source.geometry.quads[0].uvs);
    assertSelectionOwner(result, result.boundaries.top[0]);
    assertSelectionOwner(result, result.patches.top[0]);
    assert.equal(result.patches.top[0].faces[0].index, 0);
});

test("nonplanar authored quads use their two triangle areas", () => {
    const mesh = {
        vertices: [v(0, 0, 0), v(2, 0, 0), v(2, 1, 0), v(0, 1, 1)],
        quads: [{
            corners: [0, 1, 2, 3],
            uvs: uvs(),
            surface: "raw"
        }]
    };
    let seen;
    classifyAuthoredFaces(geometryResult(mesh), face => {
        seen = face;
        return { surface: "new" };
    });

    const expectedNormal = v(1, -2, 4).normalize();
    assert.ok(seen.normal.distanceTo(expectedNormal) < 1e-12);
    assert.ok(seen.centroid.z > 0);
    assert.ok(seen.centroid.z < 1);
});

test("a classifier cannot create empty surface labels", () => {
    const source = geometryResult({
        vertices: [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)],
        quads: [],
        triangles: [{
            corners: [0, 1, 2],
            uvs: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(1, 0),
                new THREE.Vector2(0, 1)
            ],
            surface: "original"
        }]
    });

    assert.throws(
        () => classifyAuthoredFaces(source, () => ({ surface: " " })),
        error => error.operation === "classifyAuthoredFaces" &&
            error.reason === "invalid-input"
    );
});

test("per-piece tint changes render colors, not authored construction data", () => {
    const original = geometryResult({
        vertices: [v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)],
        quads: [],
        triangles: [{
            corners: [0, 1, 2],
            uvs: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(1, 0),
                new THREE.Vector2(0, 1)
            ],
            surface: "wood"
        }]
    });
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });
    const tint = new THREE.Color("#806040");
    const mesh = surfaceMesh({
        name: "TintedPiece",
        geometry: original,
        materials: material,
        tint
    });

    try {
        const colors = mesh.geometry.getAttribute("color");
        assert.ok(colors);
        assert.equal(colors.count, mesh.geometry.getAttribute("position").count);
        assert.ok(Math.abs(colors.getX(0) - tint.r) < 1e-6);
        assert.ok(Math.abs(colors.getY(0) - tint.g) < 1e-6);
        assert.ok(Math.abs(colors.getZ(0) - tint.b) < 1e-6);
        assert.equal(original.geometry.triangles[0].surface, "wood");
        assert.equal(original.geometry.vertices.length, 3);
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }
});
