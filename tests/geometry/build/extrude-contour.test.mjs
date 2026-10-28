import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { extrudeContour } = await toolbox(
    "geometry/build/extrudeContour.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

const point = (x, y) => new THREE.Vector2(x, y);

const outer = [
    point(-1, -1),
    point(1, -1),
    point(1, 1),
    point(-1, 1)
];

const inner = [
    point(-0.4, -0.4),
    point(-0.4, 0.4),
    point(0.4, 0.4),
    point(0.4, -0.4)
];

function options(overrides = {}) {
    return {
        frame: new THREE.Matrix4(),
        depth: 1.2,
        ...overrides
    };
}

test("a rectangular extrusion has four true side quads and two quad caps", () => {
    const result = extrudeContour({
        outer: { points: outer, closed: true }
    }, options());

    assert.equal(result.geometry.vertices.length, 8);
    assert.equal(result.geometry.quads.length, 6);
    assert.equal(result.geometry.triangles?.length ?? 0, 0);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(result.regions.outer.length, 4);
    assert.equal(result.regions["cap-start"].length, 1);
    assert.equal(result.regions["cap-end"].length, 1);

    const material = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "ExtrudedProfile",
        geometry: result,
        materials: material
    });

    try {
        assert.equal(getControlOutline(mesh.geometry).quadCount, 6);
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }
});

test("extruded hollow profile has real interior walls and annular caps", () => {
    const result = extrudeContour({
        outer: { points: outer, closed: true },
        holes: [{ points: inner, closed: true }]
    }, options());

    assert.equal(result.geometry.vertices.length, 16);
    assert.equal(result.geometry.quads.length, 8);
    assert.equal(result.geometry.triangles.length, 16);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions["inner-0"].length, 4);
});

test("multiple offset layers keep every authored station and face interval", () => {
    const original = outer.map(p => p.clone());

    const result = extrudeContour({
        outer: { points: original, closed: true }
    }, options({
        layers: [
            { position: 0, contourOffset: 0 },
            { position: 0.15, contourOffset: 0.06 },
            { position: 0.85, contourOffset: 0.06 },
            { position: 1, contourOffset: 0 }
        ]
    }));

    assert.equal(result.geometry.vertices.length, 16);
    assert.equal(result.geometry.quads.length, 14);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(original[0].x, -1);

    const first = result.geometry.vertices[0];
    const middle = result.geometry.vertices[4];
    assert.ok(middle.distanceTo(first) > 0);
});

test("sampled contours preserve station order and can remain open", () => {
    const points = [
        point(-1, -1),
        point(-1, 1),
        point(1, 1),
        point(1, -1)
    ];

    const result = extrudeContour({
        outer: {
            points,
            parameters: [0, 0.2, 0.5, 0.8]
        }
    }, options({ caps: false }));

    assert.equal(result.geometry.quads.length, 4);
    assert.equal(topologyOf(result).openBoundaries().length, 2);
    assert.equal(result.boundaries["start-outer"][0].owner, result.id);

    assert.throws(
        () => extrudeContour({
            outer: { points, parameters: [0, 0.5, 0.5, 0.8] }
        }, options()),
        error => error.reason === "invalid-input"
    );
});

test("nonrigid frames and collapsing layer offsets fail explicitly", () => {
    assert.throws(
        () => extrudeContour({
            outer: { points: outer, closed: true }
        }, options({
            frame: new THREE.Matrix4().makeScale(1.2, 1, 1)
        })),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => extrudeContour({
            outer: { points: outer, closed: true }
        }, options({
            layers: [
                { position: 0, contourOffset: 0 },
                { position: 0.5, contourOffset: -1 },
                { position: 1, contourOffset: 0 }
            ]
        })),
        error => error.reason !== undefined
    );
});
