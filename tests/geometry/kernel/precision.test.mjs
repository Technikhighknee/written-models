import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const {
    DEFAULT_GEOMETRY_PRECISION,
    resolvePrecision,
    lengthTolerance
} = await toolbox("geometry/kernel/precision.ts");

const { geometryResult } = await toolbox("geometry/kernel/GeometryResult.ts");
const { transformGeometry, deformVertices } = await toolbox(
    "geometry/edit/geometryEdits.ts"
);
const { raycastSurface } = await toolbox(
    "geometry/queries/raycastSurface.ts"
);
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");

function square(width = 1, origin = 0) {
    return {
        vertices: [
            new THREE.Vector3(origin, 0, 0),
            new THREE.Vector3(origin + width, 0, 0),
            new THREE.Vector3(origin + width, width, 0),
            new THREE.Vector3(origin, width, 0)
        ],
        quads: [{
            corners: [0, 1, 2, 3],
            surface: "surface",
            uvs: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(1, 0),
                new THREE.Vector2(1, 1),
                new THREE.Vector2(0, 1)
            ]
        }]
    };
}

test("one precision policy validates values and local physical extents", () => {
    const defaults = DEFAULT_GEOMETRY_PRECISION;

    assert.equal(lengthTolerance(defaults, 0.1), 1e-9);
    assert.equal(lengthTolerance(defaults, 4), 4e-9);
    assert.deepEqual(resolvePrecision(), defaults);

    assert.throws(
        () => resolvePrecision({ ...defaults, angle: 0 }),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => geometryResult(square(1e-10)),
        error => error.reason === "degenerate-geometry"
    );

    const precise = {
        absoluteLength: 1e-12,
        relativeLength: 0,
        angle: 1e-7
    };

    assert.equal(geometryResult(square(1e-10), precise).geometry.quads.length, 1);
});

test("tiny but invertible transforms survive editing and world-space queries", () => {
    const original = geometryResult(square());
    const scaled = transformGeometry(
        original,
        new THREE.Matrix4().makeScale(1e-6, 1e-6, 1e-6)
    );

    assert.equal(original.geometry.vertices[1].x, 1);
    assert.equal(scaled.geometry.vertices[1].x, 1e-6);

    const hit = raycastSurface({
        geometry: original.geometry,
        localToWorld: new THREE.Matrix4().makeScale(1e-6, 1e-6, 1e-6)
    }, {
        origin: new THREE.Vector3(0.25e-6, 0.75e-6, 1e-6),
        direction: new THREE.Vector3(0, 0, -1),
        maxDistance: 2e-6
    });

    assert.ok(hit);
    assert.equal(hit.frontFacing, true);
    assert.ok(Math.abs(hit.distance - 1e-6) < 1e-12);
});

test("deformation failure reports its operation without damaging the input", () => {
    const original = geometryResult(square());

    assert.throws(
        () => deformVertices(
            original,
            (_point, id) => id === 1
                ? new THREE.Vector3(-1, 0, 0)
                : new THREE.Vector3()
        ),
        error => error.reason === "degenerate-geometry" &&
            error.operation === "deformVertices"
    );

    assert.equal(original.geometry.vertices[1].x, 1);
});

test("render conversion refuses collapsed Float32 triangles", () => {
    const source = geometryResult(square(0.01, 100_000_000));
    const material = new THREE.MeshBasicMaterial();

    try {
        assert.throws(
            () => surfaceMesh({
                name: "NotRepresentable",
                geometry: source,
                materials: material
            }),
            error => error.reason === "precision-loss" &&
                error.operation === "toBufferGeometry"
        );
    } finally {
        material.dispose();
    }
});
