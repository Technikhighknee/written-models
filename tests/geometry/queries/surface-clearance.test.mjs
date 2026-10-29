import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { geometryResult } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { surfaceClearance } = await toolbox(
    "geometry/queries/surfaceClearance.ts"
);
const { verifyExteriorPlacement } = await toolbox(
    "geometry/queries/verifyExteriorPlacement.ts"
);

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const uv = (x, y) => new THREE.Vector2(x, y);
const identity = () => new THREE.Matrix4();
const triangleUvs = () => [uv(0, 0), uv(1, 0), uv(0, 1)];
const quadUvs = () => [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)];

function triangle(a, b, c, transform = identity()) {
    return {
        geometry: geometryResult({
            vertices: [a, b, c],
            quads: [],
            triangles: [{
                corners: [0, 1, 2],
                uvs: triangleUvs(),
                surface: "authored"
            }]
        }).geometry,
        localToWorld: transform
    };
}

function quad(points, transform = identity()) {
    return {
        geometry: geometryResult({
            vertices: points,
            quads: [{
                corners: [0, 1, 2, 3],
                uvs: quadUvs(),
                surface: "authored"
            }]
        }).geometry,
        localToWorld: transform
    };
}

function nearly(value, expected, tolerance = 1e-9) {
    assert.ok(Math.abs(value - expected) < tolerance,
        `Expected ${expected}, got ${value}`);
}

test("parallel finite faces respect measured world-metre separation", () => {
    const base = triangle(
        v(0, 0, 0), v(2, 0, 0), v(0, 2, 0)
    );
    const above = triangle(
        v(0.4, 0.4, 0.3), v(1.2, 0.4, 0.3),
        v(0.4, 1.2, 0.3)
    );
    const result = surfaceClearance(base, above, { minimum: 0.29 });

    nearly(result.closestDistance, 0.3);
    assert.equal(result.intersects, false);
    assert.equal(result.meetsMinimum, true);
    assert.equal(
        surfaceClearance(base, above, { minimum: 0.31 }).meetsMinimum,
        false
    );

    // A world transform changes distance, not authored positions.
    const scaled = {
        ...above,
        localToWorld: new THREE.Matrix4().makeScale(2, 2, 2)
    };
    const origin = scaled.geometry.vertices[0].clone();
    const world = surfaceClearance(base, scaled, { minimum: 0.59 });
    nearly(world.closestDistance, 0.6);
    assert.deepEqual(scaled.geometry.vertices[0], origin);
});

test("triangle interiors can cross when no authored vertex lies on either surface", () => {
    const horizontal = triangle(
        v(-2, -2, 0), v(2, -2, 0), v(0, 2, 0)
    );
    const vertical = triangle(
        v(-0.3, -0.25, -1),
        v(0.3, -0.25, 1),
        v(0, 0.4, 1)
    );

    const result = surfaceClearance(
        horizontal, vertical, { minimum: 0.05 }
    );
    assert.equal(result.closestDistance, 0);
    assert.equal(result.intersects, true);
    assert.equal(result.meetsMinimum, false);
});

test("coplanar crossing edges count as contact even with no contained corners", () => {
    const upward = triangle(
        v(0, 2, 0), v(-2, -1, 0), v(2, -1, 0)
    );
    const downward = triangle(
        v(0, -2, 0), v(2, 1, 0), v(-2, 1, 0)
    );

    const result = surfaceClearance(upward, downward, { minimum: 0.01 });
    assert.equal(result.intersects, true);
    assert.equal(result.closestDistance, 0);
});

test("the chord between two clear band stations can pierce a faceted body", () => {
    const barrel = {
        geometry: geometryResult({
            vertices: [
                v(0, -1, 0), v(1, -1, 1), v(2, -1, 0),
                v(0, 1, 0), v(1, 1, 1), v(2, 1, 0)
            ],
            quads: [{
                corners: [0, 1, 4, 3],
                uvs: quadUvs(),
                surface: "barrel"
            }, {
                corners: [1, 2, 5, 4],
                uvs: quadUvs(),
                surface: "barrel"
            }]
        }).geometry,
        localToWorld: identity()
    };
    const band = quad([
        v(0, -0.4, 0.5), v(2, -0.4, 0.5),
        v(2, 0.4, 0.5), v(0, 0.4, 0.5)
    ]);
    assert.ok(band.geometry.vertices.every(point =>
        point.distanceTo(v(1, 0, 1)) > 0.4
    ));

    const result = surfaceClearance(band, barrel, { minimum: 0.04 });
    assert.equal(result.intersects, true);
    assert.equal(result.closestDistance, 0);
    assert.equal(verifyExteriorPlacement(band, barrel, {
        minimum: 0.04
    }).exterior, false);
});

test("unsigned clearance cannot distinguish an inner band from an outer band", () => {
    const support = triangle(
        v(-3, -3, 0), v(3, -3, 0), v(0, 3, 0)
    );
    const outside = triangle(
        v(-0.2, -0.2, 0.2), v(0.3, -0.2, 0.2),
        v(0, 0.3, 0.2)
    );
    const inside = triangle(
        v(-0.2, -0.2, -0.2), v(0.3, -0.2, -0.2),
        v(0, 0.3, -0.2)
    );

    nearly(surfaceClearance(outside, support, {
        minimum: 0.1
    }).closestDistance, 0.2);
    nearly(surfaceClearance(inside, support, {
        minimum: 0.1
    }).closestDistance, 0.2);

    const valid = verifyExteriorPlacement(outside, support, {
        minimum: 0.1
    });
    const invalid = verifyExteriorPlacement(inside, support, {
        minimum: 0.1
    });

    assert.equal(valid.exterior, true);
    assert.equal(valid.intersects, false);
    nearly(valid.minimumSignedDistance, 0.2);
    assert.equal(invalid.exterior, false);
    assert.ok(invalid.minimumSignedDistance < 0);
});

test("finite surfaces are not classified as colliding due to overlapping AABBs", () => {
    const first = triangle(
        v(0, 0, 0), v(1, 0, 0), v(0, 1, 0)
    );
    const second = triangle(
        v(0.9, 0.9, 0), v(1.9, 0.9, 0), v(0.9, 1.9, 0)
    );
    const result = surfaceClearance(first, second, {
        minimum: 0.1
    });

    nearly(result.closestDistance, Math.sqrt(0.32));
    assert.equal(result.intersects, false);
    assert.equal(result.meetsMinimum, true);
});

test("invalid thresholds and empty surfaces produce typed errors", () => {
    const nonempty = triangle(v(0, 0, 0), v(1, 0, 0), v(0, 1, 0));
    const empty = {
        geometry: { vertices: [], quads: [] },
        localToWorld: identity()
    };

    assert.throws(() => surfaceClearance(nonempty, nonempty, {
        minimum: -1
    }), error => error.operation === "surfaceClearance" &&
        error.reason === "invalid-input");
    assert.throws(() => surfaceClearance(empty, nonempty, {
        minimum: 0
    }), error => error.reason === "invalid-input");
    assert.throws(() => verifyExteriorPlacement(nonempty, nonempty, {
        minimum: NaN
    }), error => error.reason === "invalid-input");
});

function cylindricalSides(radius, segments, phase = 0) {
    const lower = Array.from({ length: segments }, (_, i) => {
        const angle = phase + i * 2 * Math.PI / segments;
        return v(radius * Math.cos(angle), 0, radius * Math.sin(angle));
    });
    const upper = lower.map(point => v(point.x, 1, point.z));
    const quads = Array.from({ length: segments }, (_, i) => {
        const next = (i + 1) % segments;
        return {
            corners: [i, i + segments, next + segments, next],
            uvs: quadUvs(),
            surface: "side"
        };
    });
    return {
        geometry: geometryResult({
            vertices: [...lower, ...upper],
            quads
        }).geometry,
        localToWorld: identity()
    };
}

test("faceted barrel bands need both clearance and outward-side verification", () => {
    const barrel = cylindricalSides(1, 12);
    const outside = cylindricalSides(1.12, 12, Math.PI / 12);
    const inside = cylindricalSides(0.84, 12, Math.PI / 12);
    const crossing = cylindricalSides(1.02, 12, Math.PI / 12);

    const clear = surfaceClearance(outside, barrel, {
        minimum: 0.01
    });
    assert.equal(clear.intersects, false);
    assert.ok(clear.closestDistance > 0.01);
    assert.equal(clear.meetsMinimum, true);

    const outward = verifyExteriorPlacement(outside, barrel, {
        minimum: 0.01
    });
    assert.equal(outward.exterior, true);
    assert.equal(outward.intersects, false);

    const inner = verifyExteriorPlacement(inside, barrel, {
        minimum: 0.01
    });
    assert.equal(inner.exterior, false);
    assert.equal(inner.intersects, false);
    assert.ok(inner.minimumSignedDistance < 0);

    assert.equal(surfaceClearance(crossing, barrel, {
        minimum: 0.01
    }).intersects, true);
    assert.equal(verifyExteriorPlacement(crossing, barrel, {
        minimum: 0.01
    }).exterior, false);
});

test("translated and mirrored target geometry retains its signed exterior side", () => {
    const base = triangle(
        v(-1, -1, 0), v(1, -1, 0), v(0, 1, 0),
        new THREE.Matrix4().makeTranslation(5, 7, -2)
    );
    const candidate = triangle(
        v(-0.2, -0.2, 0.5),
        v(0.2, -0.2, 0.5),
        v(0, 0.2, 0.5),
        new THREE.Matrix4().makeTranslation(5, 7, -2)
    );
    const above = verifyExteriorPlacement(candidate, base, {
        minimum: 0.3
    });
    assert.equal(above.exterior, true);
    nearly(above.minimumSignedDistance, 0.5);

    const mirror = new THREE.Matrix4()
        .makeScale(-1, 1, -1);
    const mirrored = verifyExteriorPlacement(
        { ...candidate, localToWorld: mirror },
        { ...base, localToWorld: mirror },
        { minimum: 0.3 }
    );
    // The same authored winding is mirrored through an orientation-preserving
    // 180-degree transform; its outward normal follows the transformed mesh.
    assert.equal(mirrored.exterior, true);
    nearly(mirrored.minimumSignedDistance, 0.5);
});
