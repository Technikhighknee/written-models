import test from "node:test";
import assert from "node:assert/strict";

import { toolbox } from "../../support/toolbox.mjs";

const { stitchPolylines } = await toolbox(
    "geometry/topology/stitchPolylines.ts"
);

test("authored sampling stations decide transition order", () => {
    const first = [0, 1, 2];
    const second = [3, 4, 5];

    const byIndex = stitchPolylines(first, second);
    const byStations = stitchPolylines(first, second, {
        firstStations: [0, 0.1, 1],
        secondStations: [0, 0.8, 1]
    });

    assert.deepEqual(byIndex[0], [0, 3, 4]);
    assert.deepEqual(byStations[0], [0, 3, 1]);

    assert.equal(byStations.length, first.length + second.length - 2);
    assert.deepEqual(
        stitchPolylines(first, second, true)[0],
        [0, 4, 3]
    );
});

test("invalid and ambiguous station sequences are rejected", () => {
    const first = [0, 1, 2];
    const second = [3, 4];

    assert.throws(
        () => stitchPolylines(first, second, {
            firstStations: [0, 0.5, 0.4],
            secondStations: [0, 1]
        }),
        /Invalid stitch stations/
    );

    assert.throws(
        () => stitchPolylines(first, [2, 3]),
        /disjoint/
    );
});
