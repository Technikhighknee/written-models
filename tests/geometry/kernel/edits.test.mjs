import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { toolbox } from "../../support/toolbox.mjs";

const { geometryResult, assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { transformGeometry, deformVertices, offsetMeshUvs } = await toolbox(
    "geometry/edit/geometryEdits.ts"
);
const { raycastSurface } = await toolbox(
    "geometry/queries/raycastSurface.ts"
);

function surface() {
    const result = geometryResult({
        vertices: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(1, 1, 0),
            new THREE.Vector3(0, 1, 0)
        ],
        quads: [{
            corners: [0, 1, 2, 3],
            uvs: [
                new THREE.Vector2(0, 0), new THREE.Vector2(1, 0),
                new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)
            ],
            surface: "top"
        }]
    });
    const chart = {
        at: uv => new THREE.Vector3(uv.x, uv.y, 0),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: () => new THREE.Vector3(0, 0, 1)
    };
    return {
        ...result,
        boundaries: { rim: [{
            owner: result.id,
            vertices: [0, 1, 2, 3],
            closed: true
        }] },
        patches: { surface: [{
            owner: result.id,
            faces: [{ kind: "quad", index: 0 }],
            chart
        }] }
    };
}

test("transforms re-own selections and compose surface charts", () => {
    const original = surface();
    const shifted = transformGeometry(
        original,
        new THREE.Matrix4().makeTranslation(2, 3, 4)
    );
    assert.equal(original.geometry.vertices[0].x, 0);
    assert.equal(shifted.geometry.vertices[0].x, 2);
    assert.notEqual(shifted.id, original.id);
    assertSelectionOwner(shifted, shifted.boundaries.rim[0]);
    assert.throws(() => assertSelectionOwner(
        shifted, original.boundaries.rim[0]
    ));
    assert.deepEqual(
        shifted.patches.surface[0].chart.at(new THREE.Vector2(0.25, 0.75))
            .toArray(),
        [2.25, 3.75, 4]
    );
    assert.deepEqual(
        shifted.patches.surface[0].chart.parameterOf(
            new THREE.Vector3(2.25, 3.75, 4)
        ).toArray(),
        [0.25, 0.75]
    );
});

test("reflected solids correct winding and preserve UVs", () => {
    const transformed = transformGeometry(
        surface(), new THREE.Matrix4().makeScale(-1, 1, 1)
    );
    const hit = raycastSurface({
        geometry: transformed.geometry,
        localToWorld: new THREE.Matrix4()
    }, {
        origin: new THREE.Vector3(-0.25, 0.75, 1),
        direction: new THREE.Vector3(0, 0, -1),
        maxDistance: 3
    });
    assert.ok(hit);
    assert.ok(hit.normal.z > 0.999);
    assert.equal(hit.frontFacing, true);
    assert.ok(
        transformed.patches.surface[0].chart.normalAt(
            new THREE.Vector2(0.5, 0.5)
        ).z > 0.999
    );
});

test("UV edits retain charts; deformation invalidates them", () => {
    const original = surface();
    const shiftedUv = offsetMeshUvs(original, 2, 3);
    assert.deepEqual(
        shiftedUv.geometry.quads[0].uvs[0].toArray(),
        [2, 3]
    );
    assert.deepEqual(original.geometry.quads[0].uvs[0].toArray(), [0, 0]);
    assert.ok(shiftedUv.patches.surface);
    assertSelectionOwner(shiftedUv, shiftedUv.boundaries.rim[0]);

    const worn = deformVertices(original, (_position, id) =>
        new THREE.Vector3(0, 0, id === 2 ? 0.1 : 0)
    );
    assert.equal(worn.geometry.vertices[2].z, 0.1);
    assert.equal(original.geometry.vertices[2].z, 0);
    assert.equal(worn.patches, undefined);
    assertSelectionOwner(worn, worn.boundaries.rim[0]);
});

test("a transformed chart does not retain the caller's mutable matrix", () => {
    const original = surface();
    const matrix = new THREE.Matrix4().makeTranslation(2, 3, 4);
    const result = transformGeometry(original, matrix);

    matrix.makeTranslation(80, 90, 100);

    const point = result.patches.surface[0].chart.at(
        new THREE.Vector2(0.25, 0.75)
    );
    assert.deepEqual(point.toArray(), [2.25, 3.75, 4]);
    assert.deepEqual(
        result.geometry.vertices[0].toArray(), [2, 3, 4]
    );
});

test("geometry edits reject stale named edge chains", () => {
    const original = surface();
    const other = surface();
    const mismatched = {
        ...original,
        boundaries: {
            rim: [other.boundaries.rim[0]]
        }
    };

    assert.throws(
        () => offsetMeshUvs(mismatched, 1, 1),
        error => error.reason === "invalid-input"
    );
});
