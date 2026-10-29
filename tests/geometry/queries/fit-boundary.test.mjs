import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { geometryResult, assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { fitBoundary } = await toolbox(
    "geometry/queries/fitBoundary.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { raycastSurface } = await toolbox(
    "geometry/queries/raycastSurface.ts"
);

const p = (x, y, z) => new THREE.Vector3(x, y, z);
const uv = (x, y) => new THREE.Vector2(x, y);

function mesh() {
    const vertices = [
        ...[0, 1, 2].map(x => p(x, 0, 0.8)),
        ...[0, 1, 2].map(x => p(x, 0.5, 0.8)),
        ...[0, 1, 2].map(x => p(x, 1, 0.8))
    ];
    const quads = [];
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
            const a = row * 3 + col;
            quads.push({
                corners: [a, a + 1, a + 4, a + 3],
                uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
                surface: "board"
            });
        }
    }

    const result = geometryResult({ vertices, quads });
    return {
        ...result,
        boundaries: {
            fitted: [{
                owner: result.id,
                vertices: [6, 7, 8],
                closed: false
            }],
            untouched: [{
                owner: result.id,
                vertices: [0, 1, 2],
                closed: false
            }]
        },
        patches: {
            surface: [{
                owner: result.id,
                faces: [
                    { kind: "quad", index: 0 },
                    { kind: "quad", index: 1 },
                    { kind: "quad", index: 2 },
                    { kind: "quad", index: 3 }
                ],
                chart: {
                    at: at => p(at.x, at.y, 0.8),
                    parameterOf: point => uv(point.x, point.y),
                    normalAt: () => p(0, 0, 1)
                }
            }]
        }
    };
}

function target(reverse = false) {
    const vertices = [
        p(0, 0, 0), p(1, 0, 0.2), p(2, 0, 0),
        p(0, 1, 0), p(1, 1, 0.2), p(2, 1, 0)
    ];
    return {
        geometry: geometryResult({
            vertices,
            quads: [
                {
                    corners: reverse ? [3, 4, 1, 0] : [0, 1, 4, 3],
                    uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
                    surface: "curved"
                },
                {
                    corners: reverse ? [4, 5, 2, 1] : [1, 2, 5, 4],
                    uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
                    surface: "curved"
                }
            ]
        }).geometry,
        localToWorld: new THREE.Matrix4()
    };
}

function options(projection, overrides = {}) {
    return {
        projection,
        sourceLocalToWorld: new THREE.Matrix4(),
        clearance: 0.05,
        falloffRings: 1,
        ...overrides
    };
}

test("ray fitting follows the faceted target without moving the other rim", () => {
    const original = mesh();
    const sourceVertices = original.geometry.vertices.map(v => v.toArray());
    const fitted = fitBoundary(
        original,
        original.boundaries.fitted[0],
        target(),
        options({ kind: "ray", direction: p(0, 0, -1), maxDistance: 2 })
    );

    assert.notEqual(fitted.id, original.id);
    assert.equal(fitted.patches, undefined);
    assert.equal(fitted.geometry.quads.length, 4);
    assert.deepEqual(fitted.regions.board, original.regions.board);
    // Clearance follows each triangle's geometric normal, not world Z.
    const targetSurface = target();
    for (const id of [6, 7, 8]) {
        const from = original.geometry.vertices[id];
        const hit = raycastSurface(targetSurface, {
            origin: from,
            direction: p(0, 0, -1),
            maxDistance: 2
        });
        assert.ok(hit);
        const expected = hit.point.clone()
            .addScaledVector(hit.normal, 0.05);
        assert.ok(
            fitted.geometry.vertices[id].distanceTo(expected) < 1e-12
        );
    }
    assert.ok(fitted.geometry.vertices.slice(3, 6).some(v =>
        v.z !== 0.8
    ));
    assert.deepEqual(
        fitted.geometry.vertices.slice(0, 3).map(v => v.toArray()),
        sourceVertices.slice(0, 3)
    );
    assert.deepEqual(
        original.geometry.vertices.map(v => v.toArray()),
        sourceVertices
    );

    assertSelectionOwner(fitted, fitted.boundaries.fitted[0]);
    assertSelectionOwner(fitted, fitted.boundaries.untouched[0]);
    assert.deepEqual(
        fitted.boundaries.fitted[0].vertices, [6, 7, 8]
    );
    assert.deepEqual(
        fitted.boundaries.untouched[0].vertices, [0, 1, 2]
    );
    assert.equal(
        topologyOf(fitted).openBoundaries().length,
        topologyOf(original).openBoundaries().length
    );
});

test("closest fitting uses transforms and measured normal clearance", () => {
    const original = mesh();
    const move = new THREE.Matrix4().makeTranslation(30, -20, 5);
    const fitted = fitBoundary(
        original,
        original.boundaries.fitted[0],
        {
            ...target(),
            localToWorld: move.clone()
        },
        options({ kind: "closest", maxDistance: 2 }, {
            sourceLocalToWorld: move,
            falloffRings: 2,
            clearance: 0.02
        })
    );

    assert.ok(fitted.geometry.vertices[6].z < 0.1);
    assert.ok(fitted.geometry.vertices[7].z > 0.1);
    assert.ok(fitted.geometry.vertices[8].z < 0.1);
    assert.ok(fitted.geometry.vertices.slice(0, 3).every(v =>
        Math.abs(v.z - 0.8) < 1e-12
    ));

    for (const vertex of fitted.boundaries.fitted[0].vertices) {
        const world = fitted.geometry.vertices[vertex]
            .clone().applyMatrix4(move);
        const hit = raycastSurface({
            ...target(), localToWorld: move
        }, {
            origin: world.clone().add(p(0, 0, 0.5)),
            direction: p(0, 0, -1),
            maxDistance: 1
        });

        assert.ok(hit);
        const delta = world.clone().sub(hit.point);
        assert.ok(Math.abs(delta.dot(hit.normal) - 0.02) < 1e-10);
    }
});

test("invalid selections, missed targets, and backwards hits fail explicitly", () => {
    const original = mesh();
    const selected = original.boundaries.fitted[0];

    assert.throws(() => fitBoundary(
        original, { ...selected, owner: Symbol("stale") }, target(),
        options({ kind: "ray", direction: p(0, 0, -1), maxDistance: 2 })
    ), error => error.reason === "invalid-input");

    assert.throws(() => fitBoundary(
        original, { ...selected, vertices: [6, 8] }, target(),
        options({ kind: "ray", direction: p(0, 0, -1), maxDistance: 2 })
    ), error => error.reason === "invalid-topology");

    assert.throws(() => fitBoundary(
        original, selected, target(),
        options({ kind: "ray", direction: p(0, 0, -1), maxDistance: 0.1 })
    ), error => error.reason === "no-intersection");

    assert.throws(() => fitBoundary(
        original, selected, target(true),
        options({ kind: "ray", direction: p(0, 0, -1), maxDistance: 2 })
    ), error => error.reason === "outside-contact-patch");

    assert.throws(() => fitBoundary(
        original, selected, target(),
        options({ kind: "ray", direction: p(0, 0, 0), maxDistance: 2 })
    ), error => error.reason === "invalid-input");

    assert.throws(() => fitBoundary(
        original, selected, target(),
        options({ kind: "closest", maxDistance: 2 }, {
            sourceLocalToWorld: new THREE.Matrix4().makeScale(0, 1, 1)
        })
    ), error => error.reason === "invalid-input");
});

test("a boundary from the back side cannot claim an exterior closest contact", () => {
    const original = mesh();
    const inverted = {
        ...original,
        geometry: {
            ...original.geometry,
            vertices: original.geometry.vertices.map(vertex =>
                p(vertex.x, vertex.y, -0.8)
            )
        }
    };

    assert.throws(() => fitBoundary(
        inverted, inverted.boundaries.fitted[0], target(),
        options({ kind: "closest", maxDistance: 2 })
    ), error =>
        error.reason === "outside-contact-patch"
    );
});

test("a closed perimeter remains closed without inventing stations", () => {
    const original = geometryResult({
        vertices: [
            p(0, 0, 0.8),
            p(2, 0, 0.8),
            p(2, 1, 0.8),
            p(0, 1, 0.8)
        ],
        quads: [{
            corners: [0, 1, 2, 3],
            uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
            surface: "panel"
        }]
    });
    const rim = {
        owner: original.id,
        vertices: [0, 1, 2, 3],
        closed: true
    };
    const source = {
        ...original,
        boundaries: { rim: [rim] }
    };
    const fitted = fitBoundary(
        source, rim, target(),
        options({ kind: "ray", direction: p(0, 0, -1), maxDistance: 2 }, {
            falloffRings: 0,
            clearance: 0
        })
    );

    assert.equal(fitted.geometry.vertices.length, 4);
    assert.equal(fitted.geometry.quads.length, 1);
    assert.deepEqual(fitted.boundaries.rim[0].vertices, rim.vertices);
    assert.equal(fitted.boundaries.rim[0].closed, true);
    assertSelectionOwner(fitted, fitted.boundaries.rim[0]);
    assert.deepEqual(
        fitted.geometry.vertices.map(v => v.z),
        [0, 0, 0, 0]
    );
    assert.deepEqual(source.geometry.vertices.map(v => v.z),
        [0.8, 0.8, 0.8, 0.8]);
});

test("zero falloff moves only the selected stations", () => {
    const original = mesh();
    const fitted = fitBoundary(
        original, original.boundaries.fitted[0], target(),
        options({ kind: "ray", direction: p(0, 0, -1), maxDistance: 2 }, {
            falloffRings: 0
        })
    );

    for (let id = 0; id < 6; id++) {
        assert.deepEqual(
            fitted.geometry.vertices[id].toArray(),
            original.geometry.vertices[id].toArray()
        );
    }
    assert.ok(fitted.geometry.vertices.slice(6).every(v => v.z < 0.3));
});
