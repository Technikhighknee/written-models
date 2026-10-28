import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { correspondContours } = await toolbox(
    "geometry/build/correspondContours.ts"
);
const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");

const p = (x, y, z) => new THREE.Vector3(x, y, z);

function contours() {
    const first = {
        closed: true,
        points: [p(0, 0, 0), p(2, 0, 0), p(2, 2, 0), p(0, 2, 0)]
    };
    const second = {
        closed: true,
        points: [
            p(0, 0, 1), p(1, 0, 1), p(2, 0, 1),
            p(2, 2, 1), p(0, 2, 1), p(0, 1, 1)
        ]
    };

    return { first, second };
}

test("landmarks and every authored corner survive unequal contour densities", () => {
    const { first, second } = contours();
    const matched = correspondContours(first, second, [
        { id: "origin", first: 0, second: 0 },
        { id: "opposite", first: 2, second: 3 },
        { id: "left", first: 3, second: 4 }
    ]);

    assert.equal(matched.first.points.length, matched.second.points.length);
    assert.equal(matched.stations.length, matched.first.points.length);
    assert.equal(matched.stations[0], 0);
    assert.ok(matched.stations.every(t => t >= 0 && t < 1));

    for (const vertex of first.points) {
        assert.ok(matched.first.points.some(point => point.equals(vertex)));
    }
    for (const vertex of second.points) {
        assert.ok(matched.second.points.some(point => point.equals(vertex)));
    }

    for (const anchor of matched.landmarks) {
        assert.equal(anchor.first, anchor.second);
        assert.ok(matched.first.points[anchor.first]);
        assert.ok(matched.second.points[anchor.second]);
    }

    // Both sections describe the same XY outline; extra corners are
    // introduced only at pre-existing vertices, not by approximating them.
    for (let i = 0; i < matched.stations.length; i++) {
        const a = matched.first.points[i];
        const b = matched.second.points[i];

        assert.equal(a.x, b.x);
        assert.equal(a.y, b.y);
        assert.equal(b.z - a.z, 1);
    }

    const walls = loftSectionWalls([
        { outer: matched.first },
        { outer: matched.second }
    ]);

    assert.equal(walls.geometry.quads.length, matched.stations.length);
    assert.equal(topologyOf(walls).openBoundaries().length, 2);
});

test("a landmark can define a nonzero periodic seam without losing vertices", () => {
    const { first, second } = contours();
    const matched = correspondContours(first, second, [
        { id: "top-right", first: 2, second: 3 },
        { id: "top-left", first: 3, second: 4 },
        { id: "origin", first: 0, second: 0 }
    ]);

    assert.deepEqual(matched.first.points[0].toArray(), [2, 2, 0]);
    assert.deepEqual(matched.second.points[0].toArray(), [2, 2, 1]);
    assert.equal(matched.landmarks[0].id, "top-right");
    assert.equal(matched.stations[0], 0);
});

test("open contours preserve both endpoints and shared interior stations", () => {
    const matched = correspondContours(
        {
            closed: false,
            points: [p(0, 0, 0), p(1, 0, 0), p(2, 0, 0)]
        },
        {
            closed: false,
            points: [p(0, 0, 1), p(0.3, 0, 1), p(2, 0, 1)]
        },
        [
            { id: "start", first: 0, second: 0 },
            { id: "finish", first: 2, second: 2 }
        ]
    );

    assert.equal(matched.stations[0], 0);
    assert.equal(matched.stations.at(-1), 1);
    assert.equal(matched.first.closed, false);
    assert.equal(matched.second.closed, false);
    assert.equal(matched.first.points.length, 4);
    assert.deepEqual(matched.first.points.at(-1).toArray(), [2, 0, 0]);
    assert.deepEqual(matched.second.points.at(-1).toArray(), [2, 0, 1]);
});

test("reversed landmarks, duplicates and incompatible closure fail", () => {
    const { first, second } = contours();

    assert.throws(
        () => correspondContours(first, second, [
            { id: "start", first: 0, second: 0 },
            { id: "right", first: 1, second: 4 },
            { id: "top", first: 2, second: 3 }
        ]),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => correspondContours(first, second, [
            { id: "a", first: 0, second: 0 },
            { id: "b", first: 0, second: 3 }
        ]),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => correspondContours(first, {
            ...second,
            closed: false
        }, [{ id: "start", first: 0, second: 0 }]),
        error => error.reason === "invalid-input"
    );
});
