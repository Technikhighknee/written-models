import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { samplePolarStripSections, polarPoint } = await toolbox(
    "geometry/build/samplePolarStripSections.ts"
);

const meridian = [
    new THREE.Vector2(0.72, 0),
    new THREE.Vector2(0.9, 0.5),
    new THREE.Vector2(0.72, 1)
];

const outerStations = [0, 0.055, 0.5, 0.945, 1];
const innerStations = [0, 1];

function options(overrides = {}) {
    return {
        meridian,
        count: 12,
        gap: 0.004,
        angleOffset: 0.13,
        outerStations,
        innerStations,
        outerRadiusAt: (radius, _height, t) =>
            radius - 0.012 * (1 - Math.min(1, Math.min(t, 1 - t) / 0.055)),
        innerRadiusAt: radius => radius - 0.14,
        ...overrides
    };
}

test("unequal polar row densities build exact closed section loops", () => {
    const settings = options();
    const strips = samplePolarStripSections(settings);

    assert.equal(strips.length, 12);
    assert.ok(strips.every(strip => strip.length === meridian.length));

    for (const strip of strips) {
        for (const section of strip) {
            assert.equal(section.outer.closed, true);
            assert.equal(section.outer.points.length, 7);
            assert.equal(section.inner, undefined);
        }
    }

    const points = strips[0][0].outer.points;
    const base = meridian[0].x;
    const halfGap = settings.gap / (2 * base);
    const span = 2 * Math.PI / settings.count - 2 * halfGap;
    const firstAngle = settings.angleOffset + halfGap;

    assert.ok(
        new THREE.Vector3(
            points[0].x, points[0].y, points[0].z
        ).distanceTo(
            polarPoint(
                settings.outerRadiusAt(base, 0, 0),
                0,
                firstAngle
            )
        ) < 1e-12
    );

    // The last inner station is followed by the first inner station
    // in reverse, without inserting fake support points.
    const last = points.at(-1);
    assert.ok(
        new THREE.Vector3(
            last.x, last.y, last.z
        ).distanceTo(
            polarPoint(base - 0.14, 0, firstAngle)
        ) < 1e-12
    );

    const otherEdge = points[4];
    const expectedEnd = polarPoint(
        settings.outerRadiusAt(base, 0, 1),
        0,
        firstAngle + span
    );

    assert.ok(
        new THREE.Vector3(otherEdge.x, otherEdge.y, otherEdge.z)
            .distanceTo(expectedEnd) < 1e-12
    );
});

test("zero-gap neighboring strips share the same seam coordinates", () => {
    const strips = samplePolarStripSections(options({ gap: 0 }));

    for (let row = 0; row < meridian.length; row++) {
        const first = strips[0][row].outer.points;
        const second = strips[1][row].outer.points;

        const lastOuter = new THREE.Vector3(
            first[4].x, first[4].y, first[4].z
        );
        const nextOuter = new THREE.Vector3(
            second[0].x, second[0].y, second[0].z
        );

        assert.ok(lastOuter.distanceTo(nextOuter) < 1e-12);
    }

    // Each stave still owns independent geometry; a shared position
    // is not permission to weld together separate pieces.
    assert.notEqual(
        strips[0][0].outer.points[4],
        strips[1][0].outer.points[0]
    );
});

test("invalid stations, gaps and collapsed wall thickness are rejected", () => {
    assert.throws(
        () => samplePolarStripSections(options({
            outerStations: [0, 0.5, 0.5, 1]
        })),
        error => error.operation === "samplePolarStripSections" &&
            error.reason === "invalid-input"
    );

    assert.throws(
        () => samplePolarStripSections(options({
            gap: 0.8
        })),
        error => error.reason === "degenerate-geometry"
    );

    assert.throws(
        () => samplePolarStripSections(options({
            innerRadiusAt: radius => radius - 0.001
        })),
        error => error.reason === "degenerate-geometry"
    );

    assert.throws(
        () => samplePolarStripSections(options({
            meridian: [
                new THREE.Vector2(0.7, 0),
                new THREE.Vector2(0.8, 0),
                new THREE.Vector2(0.7, 1)
            ]
        })),
        error => error.reason === "invalid-input"
    );
});
