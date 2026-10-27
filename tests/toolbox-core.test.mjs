import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { cleanClosedContour } from "../src/toolbox/shapes/operations/cleanClosedContour.ts";
import { clipConvexPolygon, partitionConvexPolygon } from "../src/toolbox/shapes/operations/clipConvexPolygon.ts";
import { weightedCuts } from "../src/toolbox/spatial/layout/weightedCuts.ts";
import { seededVariation } from "../src/toolbox/spatial/layout/seededVariation.ts";
import { edgeRecessDepth, edgeRecessStations } from "../src/toolbox/shapes/profiles/edgeRecess.ts";
import { monotoneProfile } from "../src/toolbox/shapes/profiles/monotoneProfile.ts";
import { contactFrame } from "../src/toolbox/spatial/frames/contactFrame.ts";
import { sectionsBetweenPlanes } from "../src/toolbox/geometry/construction/sectionsBetweenPlanes.ts";
import { latheMeridian } from "../src/toolbox/geometry/construction/latheMeridian.ts";
import { AuthoredMeshBuilder } from "../src/toolbox/geometry/mesh/AuthoredMeshBuilder.ts";
import { classifyExtrudedSurfaces } from "../src/toolbox/geometry/materials/classifyExtrudedSurfaces.ts";
import { periodicFlowField } from "../src/toolbox/texturing/periodicFlowField.ts";

const near = (actual, expected, tolerance = 1e-9) =>
    assert.ok(
        Math.abs(actual - expected) < tolerance,
        `expected ${actual} to equal ${expected}`
    );

const area = polygon => Math.abs(
    polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2
);

test("closed contours discard BOTH duplicate seam points without losing corners", () => {
    const loop = cleanClosedContour([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 1e-13, y: 0 },
        { x: 0, y: 0 }
    ]);

    assert.equal(loop.length, 4);

    near(THREE.ShapeUtils.area(loop), 1);

    assert.throws(() => cleanClosedContour([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
    ]), /Collapsed/);
});

test("convex polygon partition retains total area and shared cut lines", () => {
    const square = [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2]
    ];
    const cuts = [-2, -0.5, 1, 2];
    const pieces = partitionConvexPolygon(square, cuts);

    assert.equal(pieces.length, 3);
    near(pieces.reduce((sum, polygon) => sum + area(polygon), 0), 16);

    for (let i = 0; i < pieces.length; i++) {
        for (const point of pieces[i]) {
            assert.ok(point[0] >= cuts[i] - 1e-9);
            assert.ok(point[0] <= cuts[i + 1] + 1e-9);
        }
    }

    assert.equal(clipConvexPolygon(square,
        {normal: [1, 0], offset: 10}).length, 0);
    assert.throws(() => partitionConvexPolygon(square, [0, 0]), /increasing/);
});

test("weighted partition keeps endpoints exact and contacts shared", () => {
    const cuts = weightedCuts(-2, 8, 3, [1, 2, 1]);

    assert.deepEqual(cuts, [-2, 0.5, 5.5, 8]);
    assert.deepEqual(weightedCuts(0, 4, 4), [0, 1, 2, 3, 4]);

    assert.throws(() => weightedCuts(0, 4, 2, [0, 1]), /Invalid/);
});

test("seeded variation is deterministic across repeated independent calls", () => {
    const sample = seededVariation(1234, 21, 7);

    assert.equal(sample, seededVariation(1234, 21, 7));
    assert.notEqual(sample, seededVariation(1234, 21, 8));
    assert.ok(sample >= -1 && sample <= 1);
});

test("recess support loops match its continuous height field", () => {
    const profile = {
        start: 0,
        end: 10,
        shoulder: 2,
        depth: 1,
        floor: 0.5,
        atStart: true,
        atEnd: true
    };

    assert.deepEqual(edgeRecessStations(profile), [0.5, 2, 8, 9.5]);
    near(edgeRecessDepth(0.25, profile), 1);
    near(edgeRecessDepth(1.25, profile), 0.5);
    near(edgeRecessDepth(5, profile), 0);
    near(edgeRecessDepth(8.75, profile), 0.5);

    assert.throws(() => edgeRecessDepth(2, {...profile, shoulder: 6}), /Invalid/);
});

test("monotone interpolation preserves authored extrema", () => {
    const at = monotoneProfile([
        { x: 0, y: 1 }, { x: 2, y: 4 }, { x: 4, y: 2 }
    ]);

    near(at(-10), 1);
    near(at(2), 4);
    near(at(10), 2);

    for (let i = 0; i <= 100; i++) {
        const result = at(4 * i / 100);
        assert.ok(result >= 1 - 1e-9 && result <= 4 + 1e-9);
    }
});

test("contact frame preserves the tangent and outward normal", () => {
    const frame = contactFrame(
        new THREE.Vector3(1, 2, 3),
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(1, 0, 0)
    );

    near(frame.determinant(), 1);
    const origin = new THREE.Vector3().setFromMatrixPosition(frame);
    near(origin.distanceTo(new THREE.Vector3(1, 2, 3)), 0);
    const x = new THREE.Vector3(1, 0, 0).transformDirection(frame);
    const y = new THREE.Vector3(0, 1, 0).transformDirection(frame);
    const z = new THREE.Vector3(0, 0, 1).transformDirection(frame);
    near(x.x, 1);
    near(y.y, -1);
    near(z.z, -1);

    assert.throws(() => contactFrame(
        origin, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)
    ), /parallel/);
});

test("any cross-section can fit two differently oriented support planes", () => {
    const start = {
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 1, 0)
    };
    const end = {
        point: new THREE.Vector3(0, 3, 0),
        normal: new THREE.Vector3(0.3, -1, 0)
    };

    const [first, last] = sectionsBetweenPlanes({
        start, end,
        section: [
            new THREE.Vector2(-0.5, -0.5),
            new THREE.Vector2(0.5, -0.5),
            new THREE.Vector2(0.5, 0.5),
            new THREE.Vector2(-0.5, 0.5)
        ]
    });

    assert.equal(first.length, 4);
    assert.equal(last.length, 4);

    for (let i = 0; i < first.length; i++) {
        near(first[i].y, 0);
        near(new THREE.Vector3().subVectors(last[i], end.point)
            .dot(end.normal), 0);
        assert.ok(last[i].y > first[i].y);
    }
});

test("one lathe supports both a cyclic shell and axis-pole solid", () => {
    const sample = (radius, y) => ({
        radius,
        y,
        surface: "shell",
        smoothingGroup: "shell"
    });

    const shell = latheMeridian([
        sample(1, 0), sample(1.2, 0),
        sample(1.2, 2), sample(1, 2)
    ], 8, {closed: true});

    assert.equal(shell.quads.length, 4 * 8);
    assert.equal(shell.triangles.length, 0);

    const solid = latheMeridian([
        sample(0, 0), sample(1, 0),
        sample(1, 2), sample(0, 2)
    ], 8);

    assert.equal(solid.quads.length, 8);
    assert.equal(solid.triangles.length, 16);
});

test("authored face assembly shares geometry while retaining distinct surfaces", () => {
    const mesh = new AuthoredMeshBuilder();
    const vertex = (x, y, z = 0) => new THREE.Vector3(x, y, z);
    const uv = corners => corners.map(p => new THREE.Vector2(p.x, p.y));
    const quad = [
        vertex(0, 0),
        vertex(1, 0),
        vertex(1, 1),
        vertex(0, 1)
    ];
    const triangle = [
        quad[0],
        quad[1],
        vertex(0.5, -0.5)
    ];

    mesh.addFace(quad, uv(quad), "wood");
    mesh.addFace(triangle, uv(triangle), "metal");

    const result = mesh.build();

    assert.equal(result.vertices.length, 5);
    assert.equal(result.quads.length, 1);
    assert.equal(result.triangles.length, 1);
    assert.equal(result.quads[0].corners[0], result.triangles[0].corners[0]);

    assert.throws(() => mesh.addFace(
        [quad[0], quad[0], quad[1]], uv(triangle), "invalid"
    ), /collapsed/);
});

test("periodic flow is continuous across both tiling boundaries", () => {
    const field = periodicFlowField({
        cycles: 8, bend: 0.4, firstPhase: 0.7, secondPhase: 0.2
    });

    for (const v of [0, 0.11, 0.27, 0.8]) {
        near(field(0, v), 0);
        near(field(1, v), 8);
    }

    for (const u of [0, 0.11, 0.4, 1]) {
        near(field(u, 0), field(u, 1));
    }
});

test("extrusion face classification retains cap and side index coverage", () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(2, 0);
    shape.lineTo(2, 1);
    shape.lineTo(0, 1);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.3, bevelEnabled: false
    });

    const before = geometry.groups.reduce((sum, group) => sum + group.count, 0);

    classifyExtrudedSurfaces(geometry, {
        axis: new THREE.Vector3(1, 0, 0)
    });

    const after = geometry.groups.reduce((sum, group) => sum + group.count, 0);

    assert.equal(before, after);
    assert.ok(geometry.groups.some(group => group.materialIndex === 0));
    assert.ok(geometry.groups.some(group => group.materialIndex === 1));

    geometry.dispose();
});
