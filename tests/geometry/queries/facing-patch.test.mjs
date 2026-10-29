import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { extrudeContour } = await toolbox(
    "geometry/build/extrudeContour.ts"
);
const { findFacingPatch } = await toolbox(
    "geometry/queries/findFacingPatch.ts"
);

const p = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const q = (x, y) => new THREE.Vector2(x, y);

function surface(outer, holes = []) {
    const built = extrudeContour({
        outer: { closed: true, points: outer },
        ...(holes.length ? {
            holes: holes.map(points => ({ closed: true, points }))
        } : {})
    }, {
        frame: new THREE.Matrix4(),
        depth: 0.2
    });

    return {
        geometry: built.geometry,
        localToWorld: new THREE.Matrix4()
    };
}

test("concave support is one connected patch with finite nearest contact", () => {
    const target = surface([
        q(0, 0), q(3, 0), q(3, 1),
        q(1, 1), q(1, 3), q(0, 3)
    ]);

    const found = findFacingPatch(
        target, p(0.5, 2, 0.7), p(0, 0, 1)
    );
    assert.ok(found.faces.length >= 4);
    assert.ok(found.faces.every(ref => {
        const face = ref.kind === "quad"
            ? target.geometry.quads[ref.index]
            : target.geometry.triangles[ref.index];
        return face.surface === "cap-end";
    }));
    assert.equal(found.contact.frontFacing, true);
    assert.ok(found.contact.point.distanceTo(p(0.5, 2, 0.2)) < 1e-12);
    assert.ok(Math.abs(found.contact.distance - 0.5) < 1e-12);
    assert.ok(found.contact.normal.distanceTo(p(0, 0, 1)) < 1e-12);
    assert.ok(
        new THREE.Vector3(0, 0, 1).distanceTo(
            p(0, 0, 1).transformDirection(found.frame)
        ) < 1e-12
    );

    // The closest point to the empty corner lies on the real L outline,
    // rather than on the infinite plane at the original XY position.
    const outside = findFacingPatch(
        target, p(2, 2, 0.7), p(0, 0, 1)
    );
    assert.ok(outside.contact.distance > 1);
    assert.ok(Math.abs(outside.contact.point.z - 0.2) < 1e-12);
    assert.ok(
        outside.contact.point.x <= 1 + 1e-12 ||
        outside.contact.point.y <= 1 + 1e-12
    );
});

test("a hole remains empty and neighboring opposite faces are not selected", () => {
    const target = surface(
        [q(-2, -2), q(2, -2), q(2, 2), q(-2, 2)],
        [[q(-0.4, -0.4), q(-0.4, 0.4), q(0.4, 0.4), q(0.4, -0.4)]]
    );

    const patch = findFacingPatch(
        target, p(0, 0, 0.7), p(0, 0, 1)
    );

    assert.ok(patch.faces.length >= 4);
    assert.ok(patch.faces.every(ref => {
        const face = ref.kind === "quad"
            ? target.geometry.quads[ref.index]
            : target.geometry.triangles[ref.index];
        return face.surface === "cap-end";
    }));
    assert.ok(Math.abs(patch.contact.point.z - 0.2) < 1e-12);
    assert.ok(
        Math.abs(patch.contact.point.x) >= 0.4 - 1e-12 ||
        Math.abs(patch.contact.point.y) >= 0.4 - 1e-12
    );
    assert.ok(patch.contact.distance > 0.6);

    const bottom = findFacingPatch(
        target, p(0.8, 0.8, -0.3), p(0, 0, -1)
    );
    assert.ok(bottom.faces.every(ref => {
        const face = ref.kind === "quad"
            ? target.geometry.quads[ref.index]
            : target.geometry.triangles[ref.index];
        return face.surface === "cap-start";
    }));
    assert.ok(bottom.contact.normal.z < -0.99);
});

test("disconnected coplanar islands are not silently joined into one support", () => {
    const geometry = surface([
        q(0, 0), q(1, 0), q(1, 1), q(0, 1)
    ]).geometry;
    const shifted = surface([
        q(3, 0), q(4, 0), q(4, 1), q(3, 1)
    ]).geometry;
    const offset = geometry.vertices.length;
    geometry.vertices.push(...shifted.vertices);
    geometry.quads.push(...shifted.quads.map(face => ({
        ...face,
        corners: face.corners.map(id => id + offset)
    })));
    geometry.triangles ??= [];
    geometry.triangles.push(...(shifted.triangles ?? []).map(face => ({
        ...face,
        corners: face.corners.map(id => id + offset)
    })));

    const result = findFacingPatch({
        geometry, localToWorld: new THREE.Matrix4()
    }, p(0.5, 0.5, 1), p(0, 0, 1));

    const islands = new Set(result.faces.map(ref => {
        const face = ref.kind === "quad"
            ? geometry.quads[ref.index]
            : geometry.triangles[ref.index];
        return face.corners.some(id => id >= offset) ? "right" : "left";
    }));
    assert.deepEqual([...islands], ["left"]);
});

test("a warped quad is not silently fitted by its infinite tangent plane", () => {
    const geometry = {
        vertices: [
            p(0, 0), p(1, 0), p(1, 1, 0.3), p(0, 1)
        ],
        quads: [{
            corners: [0, 1, 2, 3],
            surface: "warped",
            uvs: [q(0, 0), q(1, 0), q(1, 1), q(0, 1)]
        }]
    };

    assert.throws(
        () => findFacingPatch({
            geometry, localToWorld: new THREE.Matrix4()
        }, p(0.5, 0.5, 1), p(0, 0, 1)),
        error => error.operation === "findFacingPatch" &&
            error.reason === "no-intersection"
    );
});
