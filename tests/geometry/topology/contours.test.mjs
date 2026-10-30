import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const {
    cleanContour2,
    contourWinding,
    orientContour2,
    orientProfile2,
    mergeStations
} = await toolbox("geometry/topology/contours.ts");

const point = (x, y) => new THREE.Vector2(x, y);

test("contour cleanup removes duplicate points without moving landmarks", () => {
    const outline = [
        point(0, 0),
        point(2, 0),
        point(2, 0),
        point(2, 1),
        point(0, 1),
        point(0, 0)
    ];

    const cleaned = cleanContour2(outline);

    assert.equal(cleaned.length, 4);
    assert.deepEqual(cleaned.map(p => p.toArray()), [
        [0, 0], [2, 0], [2, 1], [0, 1]
    ]);
    assert.equal(outline.length, 6);
    assert.equal(contourWinding(cleaned), "counterclockwise");
});

test("reorientation preserves the authored seam and fixes hole winding", () => {
    const clockwise = [
        point(0, 0),
        point(0, 2),
        point(2, 2),
        point(2, 0)
    ];
    const original = clockwise.map(p => p.clone());

    const oriented = orientContour2(clockwise, "counterclockwise");

    assert.deepEqual(oriented[0], clockwise[0]);
    assert.equal(contourWinding(oriented), "counterclockwise");
    assert.deepEqual(clockwise, original);

    const profile = orientProfile2({
        outer: { points: clockwise, closed: true },
        holes: [{
            points: [
                point(0.5, 0.5),
                point(1.5, 0.5),
                point(1.5, 1.5),
                point(0.5, 1.5)
            ],
            closed: true
        }]
    });

    assert.equal(contourWinding(profile.outer.points), "counterclockwise");
    assert.equal(contourWinding(profile.holes[0].points), "clockwise");
    assert.deepEqual(profile.holes[0].points[0], point(0.5, 0.5));
});

test("shared stations keep all explicitly authored interior boundaries", () => {
    assert.deepEqual(mergeStations([
        [0, 0.2, 0.6, 1],
        [0, 0.4, 0.6, 0.8, 1]
    ]), [0, 0.2, 0.4, 0.6, 0.8, 1]);

    assert.throws(
        () => mergeStations([[0, 0.7, 0.4, 1]]),
        /Invalid sampling stations/
    );

    assert.throws(
        () => orientProfile2({
            outer: { points: [point(0, 0), point(1, 0), point(0, 1)], closed: false }
        }),
        /closed contours/
    );
});
