import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { sampleAdaptiveStations, adaptiveStations } = await toolbox(
    "geometry/topology/adaptiveStations.ts"
);

const curvedSection = t => [
    new THREE.Vector3(t, t * (1 - t), 0),
    new THREE.Vector3(t, 0, t * (1 - t))
];

test("adaptive stations retain authored landmarks and report achieved accuracy", () => {
    const options = {
        maxDeviation: 0.001,
        maxDepth: 8,
        knots: [0.3, 0.7],
        requireAccuracy: true
    };

    const report = sampleAdaptiveStations(curvedSection, options);

    assert.equal(report.stations[0], 0);
    assert.equal(report.stations.at(-1), 1);
    assert.ok(report.stations.includes(0.3));
    assert.ok(report.stations.includes(0.7));
    assert.equal(report.saturated.length, 0);
    assert.ok(report.observedMaxDeviation <= options.maxDeviation);

    // Old model constructors still receive the same station sequence.
    assert.deepEqual(adaptiveStations(curvedSection, options), report.stations);
});

test("sampling saturation is visible or becomes a typed failure", () => {
    const options = {
        maxDeviation: 0.0001,
        maxDepth: 0
    };

    const report = sampleAdaptiveStations(curvedSection, options);

    assert.deepEqual(report.stations, [0, 1]);
    assert.deepEqual(report.saturated, [[0, 1]]);
    assert.ok(report.observedMaxDeviation > options.maxDeviation);

    assert.throws(
        () => sampleAdaptiveStations(curvedSection, {
            ...options,
            requireAccuracy: true
        }),
        error => error.reason === "sampling-limit"
    );
});
