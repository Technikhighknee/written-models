import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { toolbox } from "../../support/toolbox.mjs";

const { geometryResult, assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { planarUvProjector, projectAuthoredUvs } = await toolbox(
    "geometry/uv/projectAuthoredUvs.ts"
);

const point = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const uv = () => [
    new THREE.Vector2(0, 0), new THREE.Vector2(1, 0),
    new THREE.Vector2(1, 1), new THREE.Vector2(0, 1)
];

function source() {
    const result = geometryResult({
        vertices: [
            point(10, 20), point(12, 20),
            point(12, 21), point(10, 21),
            point(10, 20, 1), point(12, 20, 1)
        ],
        quads: [{
            corners: [0, 1, 2, 3],
            uvs: uv(),
            surface: "top"
        }],
        triangles: [{
            corners: [0, 4, 5],
            uvs: [
                new THREE.Vector2(5, 5),
                new THREE.Vector2(6, 5),
                new THREE.Vector2(6, 6)
            ],
            surface: "side"
        }]
    });
    return {
        ...result,
        boundaries: {
            edge: [{
                owner: result.id,
                vertices: [1, 2],
                closed: false
            }]
        },
        patches: {
            top: [{
                owner: result.id,
                faces: [{ kind: "quad", index: 0 }],
                chart: {
                    at: u => point(u.x, u.y),
                    parameterOf: p => new THREE.Vector2(p.x, p.y),
                    normalAt: () => point(0, 0, 1)
                }
            }]
        }
    };
}

test("project selected authored faces in physical metres, retaining selections", () => {
    const original = source();
    const frame = new THREE.Matrix4().makeTranslation(10, 20, 0);
    const projector = planarUvProjector(frame, { x: 0.25, y: 0.5 });

    frame.makeScale(100, 100, 100);
    const result = projectAuthoredUvs(
        original, projector, { surfaces: ["top"] }
    );

    assert.deepEqual(
        result.geometry.quads[0].uvs.map(u => u.toArray()),
        [[0.25, 0.5], [2.25, 0.5], [2.25, 1.5], [0.25, 1.5]]
    );
    assert.deepEqual(
        result.geometry.triangles[0].uvs.map(u => u.toArray()),
        [[5, 5], [6, 5], [6, 6]]
    );
    assert.deepEqual(original.geometry.quads[0].uvs[0].toArray(), [0, 0]);
    assertSelectionOwner(result, result.boundaries.edge[0]);
    assertSelectionOwner(result, result.patches.top[0]);
    assert.deepEqual(result.regions.top, [{ kind: "quad", index: 0 }]);
});

test("UV projection can select a true authored triangle, never a render pair", () => {
    const original = source();
    const result = projectAuthoredUvs(original, position => ({
        x: position.y,
        y: position.z
    }), { faces: [{ kind: "triangle", index: 0 }] });

    assert.deepEqual(
        result.geometry.triangles[0].uvs.map(u => u.toArray()),
        [[20, 0], [20, 1], [20, 1]]
    );
    assert.deepEqual(
        result.geometry.quads[0].uvs.map(u => u.toArray()),
        uv().map(u => u.toArray())
    );
});

test("invalid projections and nonrigid physical frames fail", () => {
    const original = source();

    assert.throws(
        () => planarUvProjector(new THREE.Matrix4().makeScale(2, 1, 1)),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => projectAuthoredUvs(original, () => ({ x: NaN, y: 0 })),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => projectAuthoredUvs(original, () => ({ x: 0, y: 0 }), {
            faces: [{ kind: "triangle", index: 12 }]
        }),
        error => error.reason === "invalid-input"
    );
});
