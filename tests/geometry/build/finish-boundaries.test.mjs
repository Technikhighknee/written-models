import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { capBoundary, capSectionEnd, tipBoundary } = await toolbox(
    "geometry/build/finishBoundaries.ts"
);
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");
const { assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

const frameAt = z => new THREE.Matrix4().makeTranslation(0, 0, z);
const v = (x, y, z) => new THREE.Vector3(x, y, z);

function square(z, r) {
    return [
        v(-r, -r, z),
        v(r, -r, z),
        v(r, r, z),
        v(-r, r, z)
    ];
}

function hollow(z) {
    return {
        outer: { points: square(z, 1), closed: true },
        inner: [{ points: square(z, 0.5).reverse(), closed: true }]
    };
}

function solid(z, outline = square(z, 1)) {
    return {
        outer: { points: outline, closed: true }
    };
}

test("two planar annular caps join previously independent walls", () => {
    const source = loftSectionWalls([hollow(0), hollow(2)]);
    const start = capSectionEnd(
        source,
        source.boundaries["start-outer"][0],
        [source.boundaries["start-inner-0"][0]],
        {
            region: "end-grain-start",
            uvFrame: frameAt(0),
            tessellation: "triangulate"
        }
    );

    assert.equal(start.geometry.quads.length, 8);
    assert.equal(start.geometry.triangles?.length, 8);
    assert.equal(topologyOf(start).openBoundaries().length, 2);
    assert.equal(start.boundaries["start-outer"], undefined);
    assert.equal(start.boundaries["start-inner-0"], undefined);
    assertSelectionOwner(start, start.boundaries["end-outer"][0]);

    const completed = capSectionEnd(
        start,
        start.boundaries["end-outer"][0],
        [start.boundaries["end-inner-0"][0]],
        {
            region: "end-grain-end",
            uvFrame: frameAt(2),
            tessellation: "triangulate"
        }
    );

    assert.equal(completed.geometry.vertices.length, 16);
    assert.equal(completed.geometry.triangles?.length, 16);
    assert.equal(completed.regions["end-grain-start"].length, 8);
    assert.equal(completed.regions["end-grain-end"].length, 8);
    assert.equal(topologyOf(completed).openBoundaries().length, 0);
    assert.equal(topologyOf(completed).connectedComponents().length, 1);

    const material = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "Hollow",
        geometry: completed,
        materials: material
    });

    try {
        const outline = getControlOutline(mesh.geometry);
        assert.equal(outline.quadCount, 8);
        assert.equal(mesh.geometry.index.count / 3, 32);
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }
});

test("planar four-corner caps remain quads, tips use true fan triangles", () => {
    const source = loftSectionWalls([solid(0), solid(2)]);
    const closedStart = capBoundary(
        source,
        source.boundaries["start-outer"][0],
        {
            region: "flat-base",
            uvFrame: frameAt(0),
            tessellation: "quad-if-planar"
        }
    );

    assert.equal(closedStart.geometry.quads.length, 5);
    assert.equal(closedStart.geometry.triangles?.length ?? 0, 0);
    assert.equal(topologyOf(closedStart).openBoundaries().length, 1);

    const tip = tipBoundary(
        closedStart,
        closedStart.boundaries["end-outer"][0],
        v(0, 0, 3),
        { region: "blade-tip", uvFrame: frameAt(2) }
    );

    assert.equal(tip.geometry.vertices.length, 9);
    assert.equal(tip.geometry.triangles?.length, 4);
    assert.equal(tip.regions["blade-tip"].length, 4);
    assert.equal(tip.boundaries["end-outer"], undefined);
    assert.equal(topologyOf(tip).openBoundaries().length, 0);
    assert.equal(source.geometry.vertices.length, 8);
});

test("concave planar end triangulation does not invent boundary stations", () => {
    const outline = z => [
        v(0, 0, z), v(3, 0, z), v(3, 1, z),
        v(1, 1, z), v(1, 3, z), v(0, 3, z)
    ];
    const source = loftSectionWalls([
        solid(0, outline(0)), solid(2, outline(2))
    ]);

    const capped = capBoundary(
        source,
        source.boundaries["start-outer"][0],
        {
            region: "irregular-cap",
            uvFrame: frameAt(0),
            tessellation: "triangulate"
        }
    );

    assert.equal(capped.geometry.vertices.length, source.geometry.vertices.length);
    assert.equal(capped.geometry.triangles?.length, 4);
    assert.equal(topologyOf(capped).openBoundaries().length, 1);
});

test("stale selections, nonplanar caps, and out-of-rim tips fail", () => {
    const source = loftSectionWalls([solid(0), solid(2)]);
    const start = source.boundaries["start-outer"][0];

    const closed = capBoundary(source, start, {
        region: "closed",
        uvFrame: frameAt(0),
        tessellation: "quad-if-planar"
    });

    assert.throws(
        () => capBoundary(closed, start, {
            region: "duplicate",
            uvFrame: frameAt(0),
            tessellation: "quad-if-planar"
        }),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => tipBoundary(
            source,
            source.boundaries["end-outer"][0],
            v(3, 0, 3),
            { region: "bad-tip", uvFrame: frameAt(2) }
        ),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => tipBoundary(
            source,
            source.boundaries["end-outer"][0],
            v(0, 0, 1),
            { region: "inverted-tip", uvFrame: frameAt(2) }
        ),
        error => error.reason === "unsupported-topology"
    );

    const warped = solid(0);
    warped.outer.points[2].z = 0.1;
    const nonplanar = loftSectionWalls([warped, solid(2)]);

    assert.throws(
        () => capBoundary(
            nonplanar,
            nonplanar.boundaries["start-outer"][0],
            {
                region: "bad-cap",
                uvFrame: frameAt(0),
                tessellation: "triangulate"
            }
        ),
        error => error.reason === "degenerate-geometry"
    );
});
