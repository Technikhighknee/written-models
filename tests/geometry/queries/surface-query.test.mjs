import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { geometryResult } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { triangulateAuthoredFaces } = await toolbox(
    "geometry/kernel/triangulation.ts"
);
const { surfaceTriangles } = await toolbox(
    "geometry/queries/surfaceTriangles.ts"
);
const { raycastSurface } = await toolbox(
    "geometry/queries/raycastSurface.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { getRenderTriangleSources } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const uv = (x, y) => new THREE.Vector2(x, y);

function authored() {
    return geometryResult({
        vertices: [
            v(0, 0), v(2, 0), v(2, 1), v(0, 1),
            v(3, 0), v(3, 1)
        ],
        quads: [
            {
                corners: [0, 1, 2, 3],
                uvs: [uv(1, 2), uv(3, 2), uv(3, 4), uv(1, 4)],
                surface: "wood"
            },
            {
                corners: [1, 4, 5, 2],
                uvs: [uv(10, 11), uv(12, 11), uv(12, 13), uv(10, 13)],
                surface: "iron"
            }
        ]
    }).geometry;
}

test("affine shears and reflections keep world hit normals and corner barycentrics", () => {
    const mesh = authored();
    const before = mesh.vertices.map(point => point.toArray());
    const transform = new THREE.Matrix4().set(
        -1.5, 0.3, 0.15, 7,
        0.25, 2, 0.4, -3,
        0.1, -0.2, 0.8, 1,
        0, 0, 0, 1
    );
    const target = { geometry: mesh, localToWorld: transform };
    const triangles = surfaceTriangles(target);

    assert.equal(triangles.length, 4);
    assert.deepEqual(triangles[0].face, { kind: "quad", index: 0 });
    assert.deepEqual(triangles[0].faceCorners, [0, 1, 2]);
    assert.deepEqual(
        triangles.map(t => t.region),
        ["wood", "wood", "iron", "iron"]
    );

    const triangle = triangles[0];
    const weights = [0.2, 0.3, 0.5];
    const hitPoint = triangle.points.reduce(
        (sum, point, index) =>
            sum.addScaledVector(point, weights[index]),
        new THREE.Vector3()
    );

    const normal = triangle.normal;
    assert.ok(normal.z < -0.99);

    const front = raycastSurface(target, {
        origin: hitPoint.clone().addScaledVector(normal, 0.75),
        direction: normal.clone().multiplyScalar(-6),
        maxDistance: 1
    });
    assert.ok(front);
    assert.equal(front.frontFacing, true);
    assert.deepEqual(front.face, { kind: "quad", index: 0 });
    assert.deepEqual(front.faceCorners, [0, 1, 2]);
    assert.equal(front.region, "wood");
    assert.ok(front.point.distanceTo(hitPoint) < 1e-12);
    assert.ok(front.normal.distanceTo(normal) < 1e-12);
    assert.ok(Math.abs(front.distance - 0.75) < 1e-12);

    front.barycentric.forEach((weight, i) =>
        assert.ok(Math.abs(weight - weights[i]) < 1e-12)
    );

    const originalFace = mesh.quads[front.face.index];
    const mapped = front.faceCorners.reduce(
        (sum, corner, i) => sum.addScaledVector(
            originalFace.uvs[corner], front.barycentric[i]
        ),
        new THREE.Vector2()
    );
    assert.ok(mapped.distanceTo(uv(2.6, 3)) < 1e-12);

    const back = raycastSurface(target, {
        origin: hitPoint.clone().addScaledVector(normal, -0.75),
        direction: normal.clone().multiplyScalar(13),
        maxDistance: 1
    });
    assert.ok(back);
    assert.equal(back.frontFacing, false);
    assert.ok(back.normal.distanceTo(normal) < 1e-12);
    assert.ok(back.point.distanceTo(hitPoint) < 1e-12);
    assert.deepEqual(mesh.vertices.map(point => point.toArray()), before);

    assert.equal(raycastSurface(target, {
        origin: hitPoint.clone().addScaledVector(normal, 0.75),
        direction: normal.clone().negate(),
        maxDistance: 0.7
    }), null);
});

test("query triangles match the renderer's source faces despite material sorting", () => {
    const geometry = authored();
    const triangles = triangulateAuthoredFaces(geometry);
    const transformed = surfaceTriangles({
        geometry, localToWorld: new THREE.Matrix4()
    });
    const first = new THREE.MeshBasicMaterial();
    const second = new THREE.MeshBasicMaterial();
    const rendered = surfaceMesh({
        name: "Sources",
        geometry: geometryResult(geometry),
        materials: { wood: second, iron: first }
    });

    try {
        const sources = getRenderTriangleSources(rendered.geometry);
        const key = triangle => [
            triangle.face.kind,
            triangle.face.index,
            ...triangle.faceCorners
        ].join(":");

        assert.deepEqual(
            transformed.map(key).sort(),
            triangles.map(key).sort()
        );
        assert.deepEqual(
            sources.map(key).sort(),
            triangles.map(key).sort()
        );
        for (const triangle of transformed) {
            assert.ok(Math.abs(triangle.normal.length() - 1) < 1e-12);
        }
    } finally {
        rendered.geometry.dispose();
        first.dispose();
        second.dispose();
    }
});

test("ray validation is typed and distances are always world metres", () => {
    const geometry = authored();
    const target = {
        geometry,
        localToWorld: new THREE.Matrix4().makeScale(2, 3, -0.5)
    };

    assert.equal(raycastSurface(target, {
        origin: v(50, 50, 1),
        direction: v(0, 0, -1),
        maxDistance: 10
    }), null);

    assert.throws(
        () => raycastSurface(target, {
            origin: v(1, 1, 1),
            direction: v(0, 0),
            maxDistance: 3
        }),
        error => error.operation === "raycastSurface" &&
            error.reason === "invalid-input"
    );

    assert.throws(
        () => raycastSurface(target, {
            origin: v(1, 1, 1),
            direction: v(0, 0, -1),
            maxDistance: Infinity
        }),
        error => error.operation === "raycastSurface" &&
            error.reason === "invalid-input"
    );

    assert.throws(
        () => raycastSurface({
            geometry,
            localToWorld: new THREE.Matrix4().makeScale(0, 1, 1)
        }, {
            origin: v(1, 1, 1),
            direction: v(0, 0, -1),
            maxDistance: 2
        }),
        error => error.operation === "raycastSurface" &&
            error.reason === "invalid-input"
    );
});

test("a warped authored quad has two correct triangle normals but one face ID", () => {
    const geometry = geometryResult({
        vertices: [
            v(0, 0, 0), v(1, 0, 0),
            v(1, 1, 0.2), v(0, 1, 0)
        ],
        quads: [{
            corners: [0, 1, 2, 3],
            uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
            surface: "warped"
        }]
    }).geometry;
    const target = {
        geometry, localToWorld: new THREE.Matrix4()
    };
    const first = raycastSurface(target, {
        origin: v(0.75, 0.25, 2),
        direction: v(0, 0, -1),
        maxDistance: 3
    });
    const second = raycastSurface(target, {
        origin: v(0.25, 0.75, 2),
        direction: v(0, 0, -1),
        maxDistance: 3
    });

    assert.ok(first && second);
    assert.deepEqual(first.face, { kind: "quad", index: 0 });
    assert.deepEqual(second.face, { kind: "quad", index: 0 });
    assert.deepEqual(first.faceCorners, [0, 1, 2]);
    assert.deepEqual(second.faceCorners, [0, 2, 3]);
    assert.ok(first.normal.distanceTo(second.normal) > 0.1);
    assert.equal(first.frontFacing, true);
    assert.equal(second.frontFacing, true);
    assert.ok(Math.abs(first.point.z - 0.05) < 1e-12);
    assert.ok(Math.abs(second.point.z - 0.05) < 1e-12);
});

test("malformed raw topology is reported as a geometry failure", () => {
    const original = authored();
    const target = {
        geometry: {
            ...original,
            quads: [{
                ...original.quads[0],
                corners: [0, 1, 999, 3]
            }]
        },
        localToWorld: new THREE.Matrix4()
    };

    assert.throws(
        () => raycastSurface(target, {
            origin: v(1, 0.5, 1),
            direction: v(0, 0, -1),
            maxDistance: 2
        }),
        error => error.operation === "raycastSurface" &&
            error.reason === "invalid-input"
    );
});
