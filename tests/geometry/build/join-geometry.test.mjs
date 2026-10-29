import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { joinGeometry } = await toolbox(
    "geometry/build/joinGeometry.ts"
);
const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { fillSurfacePatch } = await toolbox(
    "geometry/build/fillSurfacePatch.ts"
);
const { geometryResult, assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
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

const p = (x, y, z) => new THREE.Vector3(x, y, z);
const square = z => [
    p(-1, -1, z), p(1, -1, z), p(1, 1, z), p(-1, 1, z)
];
const section = (z, points = square(z)) => ({
    outer: { points, closed: true }
});
const tube = (start, end, region = "side") =>
    loftSectionWalls([section(start), section(end)], {
        outerRegion: region
    });

function pair(a, b, first = "end-outer", second = "start-outer") {
    return {
        firstPart: 0,
        first: a.boundaries[first][0],
        secondPart: 1,
        second: b.boundaries[second][0]
    };
}

test("two independently authored tubes weld into one connected surface", () => {
    const lower = tube(0, 1, "lower");
    const upper = tube(1, 2, "upper");
    const original = lower.geometry.vertices.map(vertex => vertex.clone());

    const result = joinGeometry([lower, upper], {
        weld: [pair(lower, upper)]
    });
    const topology = topologyOf(result);

    assert.equal(result.geometry.vertices.length, 12);
    assert.equal(result.geometry.quads.length, 8);
    assert.equal(result.geometry.triangles.length, 0);
    assert.equal(topology.openBoundaries().length, 2);
    assert.equal(topology.connectedComponents().length, 1);
    assert.equal(result.regions.lower.length, 4);
    assert.equal(result.regions.upper.length, 4);

    assert.equal(result.boundaries["0:end-outer"], undefined);
    assert.equal(result.boundaries["1:start-outer"], undefined);
    assertSelectionOwner(result, result.boundaries["0:start-outer"][0]);
    assertSelectionOwner(result, result.boundaries["1:end-outer"][0]);

    assert.deepEqual(lower.geometry.vertices, original);

    const material = new THREE.MeshStandardMaterial();
    const rendered = surfaceMesh({
        name: "JoinedTubes",
        geometry: result,
        materials: material
    });

    try {
        assert.equal(getControlOutline(rendered.geometry).quadCount, 8);
    } finally {
        rendered.geometry.dispose();
        material.dispose();
    }
});

test("cyclic boundaries can start at different seams, but not change winding", () => {
    const lower = tube(0, 1);
    const upper = loftSectionWalls([
        section(1, [...square(1).slice(2), ...square(1).slice(0, 2)]),
        section(2, [...square(2).slice(2), ...square(2).slice(0, 2)])
    ]);
    const result = joinGeometry([lower, upper], {
        weld: [pair(lower, upper)]
    });

    assert.equal(result.geometry.vertices.length, 12);
    assert.equal(topologyOf(result).openBoundaries().length, 2);

    const reversed = loftSectionWalls([
        section(1, square(1).reverse()),
        section(2, square(2).reverse())
    ]);

    assert.throws(
        () => joinGeometry([lower, reversed], {
            weld: [pair(lower, reversed)]
        }),
        error => error.operation === "joinGeometry" &&
            error.reason === "invalid-topology"
    );
});

test("multiple declarations compose three open tubes without welding twice", () => {
    const a = tube(0, 1);
    const b = tube(1, 2);
    const c = tube(2, 3);

    const joined = joinGeometry([a, b, c], {
        weld: [
            {
                firstPart: 0, first: a.boundaries["end-outer"][0],
                secondPart: 1, second: b.boundaries["start-outer"][0]
            },
            {
                firstPart: 1, first: b.boundaries["end-outer"][0],
                secondPart: 2, second: c.boundaries["start-outer"][0]
            }
        ]
    });

    assert.equal(joined.geometry.vertices.length, 16);
    assert.equal(joined.geometry.quads.length, 12);
    assert.equal(topologyOf(joined).connectedComponents().length, 1);
    assert.equal(topologyOf(joined).openBoundaries().length, 2);
    assert.equal(joined.boundaries["0:start-outer"][0].owner, joined.id);
    assert.equal(joined.boundaries["2:end-outer"][0].owner, joined.id);

    const competing = tube(1, 3);

    assert.throws(
        () => joinGeometry([a, b, competing], {
            weld: [
                {
                    firstPart: 0, first: a.boundaries["end-outer"][0],
                    secondPart: 1, second: b.boundaries["start-outer"][0]
                },
                {
                    firstPart: 0, first: a.boundaries["end-outer"][0],
                    secondPart: 2, second: competing.boundaries["start-outer"][0]
                }
            ]
        }),
        error => error.reason === "invalid-topology"
    );
});

test("flat patch closes a tube while retaining its exact chart and UVs", () => {
    const wall = tube(0, 1);
    const chart = {
        at: uv => p(uv.x, uv.y, 1),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: () => p(0, 0, 1)
    };
    const profile = {
        outer: {
            points: [
                new THREE.Vector2(-1, -1),
                new THREE.Vector2(-1, 1),
                new THREE.Vector2(1, 1),
                new THREE.Vector2(1, -1)
            ],
            parameters: [0, 0.25, 0.5, 0.75]
        }
    };
    const cap = fillSurfacePatch({ profile, chart, region: "lid" });
    const combined = joinGeometry([wall, cap], {
        weld: [{
            firstPart: 0,
            first: wall.boundaries["end-outer"][0],
            secondPart: 1,
            second: cap.boundaries.outer[0]
        }]
    });

    assert.equal(combined.geometry.vertices.length, 8);
    assert.equal(combined.geometry.quads.length, 4);
    assert.equal(combined.geometry.triangles.length, 2);
    assert.equal(topologyOf(combined).openBoundaries().length, 1);
    assert.equal(topologyOf(combined).connectedComponents().length, 1);
    assert.equal(combined.boundaries["end-outer"], undefined);
    assert.equal(combined.boundaries.outer, undefined);
    assert.equal(combined.patches["1:lid"][0].owner, combined.id);
    assert.equal(combined.patches["1:lid"][0].faces.length, 2);
    assert.equal(combined.regions.lid.length, 2);
    assert.equal(combined.geometry.triangles[0].uvs[0].z, undefined);
});

test("stale selections, mismatched geometry and duplicate welds fail explicitly", () => {
    const a = tube(0, 1);
    const b = tube(1, 2);
    const shifted = tube(1.1, 2.1);

    assert.throws(
        () => joinGeometry([a, b], {
            weld: [{
                ...pair(a, b),
                second: shifted.boundaries["start-outer"][0]
            }]
        }),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => joinGeometry([a, shifted], {
            weld: [pair(a, shifted)]
        }),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => joinGeometry([a, b], {
            weld: [pair(a, b), pair(a, b)]
        }),
        error => error.reason === "invalid-topology"
    );

    assert.throws(
        () => joinGeometry([a, a], { weld: [] }),
        error => error.reason === "invalid-input"
    );
});

test("duplicate coincident surfaces are rejected even without a weld", () => {
    const a = tube(0, 1);
    const b = tube(0, 1);

    assert.throws(
        () => joinGeometry([a, b], { weld: [] }),
        error => error.reason === "invalid-topology"
    );

    const first = geometryResult({
        vertices: [p(0, 0, 0), p(1, 0, 0), p(0, 1, 0)],
        quads: [],
        triangles: [{
            corners: [0, 1, 2],
            uvs: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(1, 0),
                new THREE.Vector2(0, 1)
            ],
            surface: "one"
        }]
    });
    const second = geometryResult({
        vertices: [p(0, 1, 0), p(1, 0, 0), p(0, 0, 0)],
        quads: [],
        triangles: [{
            corners: [0, 1, 2],
            uvs: [
                new THREE.Vector2(0, 1),
                new THREE.Vector2(1, 0),
                new THREE.Vector2(0, 0)
            ],
            surface: "two"
        }]
    });

    assert.throws(
        () => joinGeometry([first, second], { weld: [] }),
        error => error.reason === "invalid-topology"
    );
});

test("a welded edge cannot belong to three faces", () => {
    const a = tube(0, 1);
    const b = tube(1, 2);
    const c = tube(1, 2);

    assert.throws(
        () => joinGeometry([a, b, c], {
            weld: [
                {
                    firstPart: 0, first: a.boundaries["end-outer"][0],
                    secondPart: 1, second: b.boundaries["start-outer"][0]
                },
                {
                    firstPart: 0, first: a.boundaries["end-outer"][0],
                    secondPart: 2, second: c.boundaries["start-outer"][0]
                }
            ]
        }),
        error => error.reason === "invalid-topology"
    );
});
