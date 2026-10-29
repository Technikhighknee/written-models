import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { extrudeContour } = await toolbox(
    "geometry/build/extrudeContour.ts"
);
const { finiteFootprintContains } = await toolbox(
    "geometry/queries/finiteFootprint.ts"
);
const { fitBetweenSurfaces } = await toolbox(
    "geometry/queries/fitBetweenSurfaces.ts"
);

const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const u = (x, y) => new THREE.Vector2(x, y);

const rectangle = (minX, minY, maxX, maxY) => [
    u(minX, minY), u(maxX, minY),
    u(maxX, maxY), u(minX, maxY)
];

const section = (points, holes = []) => ({
    outer: { closed: true, points },
    ...(holes.length ? {
        holes: holes.map(points => ({ closed: true, points }))
    } : {})
});

const squareTriangles = [
    [u(-2, -2), u(2, -2), u(2, 2)],
    [u(-2, -2), u(2, 2), u(-2, 2)]
];

function support(outer, holes, bottomZ, depth = 0.2) {
    const result = extrudeContour(section(outer, holes), {
        frame: new THREE.Matrix4().makeTranslation(0, 0, bottomZ),
        depth
    });
    return {
        geometry: result.geometry,
        localToWorld: new THREE.Matrix4()
    };
}

function fit(start, end, profile, near = u(0, 0)) {
    return fitBetweenSurfaces({
        start: { target: start, near: v(near.x, near.y, 0) },
        end: { target: end, near: v(near.x, near.y, 2) },
        section: profile,
        referenceDirection: v(1, 0, 0)
    });
}

test("finite area coverage includes boundaries, not just corners", () => {
    assert.equal(finiteFootprintContains(
        squareTriangles, section(rectangle(-1, -1, 1, 1))
    ), true);
    assert.equal(finiteFootprintContains(
        squareTriangles, section(rectangle(-3, -1, 1, 1))
    ), false);
    assert.equal(finiteFootprintContains(
        squareTriangles, section(rectangle(-2, -2, 2, 2))
    ), true);
});

test("a member crosses a concave recess despite every corner being supported", () => {
    const lShape = section([
        u(0, 0), u(3, 0), u(3, 1),
        u(1, 1), u(1, 3), u(0, 3)
    ]);
    const a = support(lShape.outer.points, [], -0.2);
    const b = support(lShape.outer.points, [], 2);

    const crossNotch = section([
        u(0.3, 2.5), u(0.6, 2.5),
        u(2.5, 0.6), u(2.5, 0.3)
    ]);

    assert.throws(
        () => fit(a, b, crossNotch, u(0.5, 0.5)),
        error => error.reason === "outside-contact-patch" &&
            error.operation === "fitBetweenSurfaces"
    );

    const inside = fit(a, b, section(rectangle(0.2, 0.2, 0.7, 0.8)));
    assert.equal(inside.startContact.kind, "surface");
    assert.equal(inside.endContact.kind, "surface");
    assert.equal(inside.sections[0].outer.points.length, 4);
    assert.equal(inside.sections[1].outer.points.length, 4);

    for (const point of inside.sections[0].outer.points) {
        assert.ok(Math.abs(point.z) < 1e-12);
    }
    for (const point of inside.sections[1].outer.points) {
        assert.ok(Math.abs(point.z - 2) < 1e-12);
    }
});

test("an enclosed hole invalidates a fit even when all corners and edges fit", () => {
    const outer = rectangle(-2, -2, 2, 2);
    const holes = [rectangle(-0.4, -0.4, 0.4, 0.4)];
    const a = support(outer, holes, -0.2);
    const b = support(outer, holes, 2);

    assert.throws(
        () => fit(a, b, section(rectangle(-1, -1, 1, 1))),
        error => error.reason === "outside-contact-patch"
    );

    const good = fit(a, b, section(rectangle(0.6, 0.6, 1.5, 1.5)));
    assert.ok(good.startContact.patch.faces.length > 1);
    assert.ok(good.endContact.patch.faces.length > 1);
});

test("member section holes stay distinct and unsupported intersection directions fail", () => {
    const outer = rectangle(-2, -2, 2, 2);
    const a = support(outer, [], -0.2);
    const b = support(outer, [], 2);
    const profile = section(
        rectangle(-0.8, -0.8, 0.8, 0.8),
        [rectangle(-0.2, -0.2, 0.2, 0.2)]
    );

    const result = fit(a, b, profile);
    assert.equal(result.sections[0].inner.length, 1);
    assert.equal(result.sections[1].inner.length, 1);
    assert.equal(result.sections[0].inner[0].points.length, 4);

    assert.throws(
        () => fitBetweenSurfaces({
            start: { target: a, near: v(0, 0, 0) },
            end: { target: b, near: v(0, 0, 2) },
            section: profile,
            referenceDirection: v(0, 0, 1)
        }),
        error => error.reason === "invalid-input"
    );
});

test("explicit planar supports and geometry contacts share the same fitted result", () => {
    const profile = section(rectangle(-0.25, -0.15, 0.25, 0.15));
    const footprint = section(rectangle(-1, -1, 1, 1));
    const firstPlane = {
        frame: new THREE.Matrix4(),
        footprint
    };
    const lastPlane = {
        frame: new THREE.Matrix4().makeRotationX(Math.PI)
            .setPosition(v(0, 0, 2)),
        footprint
    };
    const geometry = support(footprint.outer.points, [], 2);

    const first = fitBetweenSurfaces({
        start: { authoredPlane: firstPlane, near: v(0, 0, 0) },
        end: { target: geometry, near: v(0, 0, 2) },
        section: profile,
        referenceDirection: v(1, 0, 0)
    });

    assert.equal(first.startContact.kind, "authored-plane");
    assert.equal(first.endContact.kind, "surface");
    assert.ok(first.startContact.point.distanceTo(v(0, 0, 0)) < 1e-12);
    assert.ok(first.startContact.normal.distanceTo(v(0, 0, 1)) < 1e-12);
    assert.ok(first.sections[0].outer.points.every(point =>
        Math.abs(point.z) < 1e-12
    ));

    const bothPlanes = fitBetweenSurfaces({
        start: { authoredPlane: firstPlane, near: v(0, 0, 0) },
        end: { authoredPlane: lastPlane, near: v(0, 0, 2) },
        section: profile,
        referenceDirection: v(1, 0, 0)
    });

    assert.equal(bothPlanes.startContact.kind, "authored-plane");
    assert.equal(bothPlanes.endContact.kind, "authored-plane");
    assert.ok(bothPlanes.sections[1].outer.points.every(point =>
        Math.abs(point.z - 2) < 1e-12
    ));
});

test("authored contact planes reject holes, outward reversal and scaling", () => {
    const frame = new THREE.Matrix4();
    const outer = rectangle(-2, -2, 2, 2);
    const plane = {
        frame,
        footprint: section(outer, [rectangle(-0.4, -0.4, 0.4, 0.4)])
    };
    const next = {
        frame: new THREE.Matrix4().makeRotationX(Math.PI)
            .setPosition(v(0, 0, 2)),
        footprint: section(outer)
    };
    const options = {
        start: { authoredPlane: plane, near: v(0, 0, 0) },
        end: { authoredPlane: next, near: v(0, 0, 2) },
        referenceDirection: v(1, 0, 0)
    };

    assert.throws(
        () => fitBetweenSurfaces({
            ...options,
            section: section(rectangle(-1, -1, 1, 1))
        }),
        error => error.operation === "fitBetweenSurfaces" &&
            error.reason === "outside-contact-patch"
    );
    assert.throws(
        () => fitBetweenSurfaces({
            ...options,
            start: {
                authoredPlane: {
                    ...plane,
                    frame: new THREE.Matrix4().makeScale(2, 1, 1)
                },
                near: v(0, 0, 0)
            },
            section: section(rectangle(0.6, 0.6, 1, 1))
        }),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => fitBetweenSurfaces({
            ...options,
            end: {
                authoredPlane: {
                    ...next,
                    frame: new THREE.Matrix4().setPosition(v(0, 0, 2))
                },
                near: v(0, 0, 2)
            },
            section: section(rectangle(0.6, 0.6, 1, 1))
        }),
        error => error.reason === "invalid-input"
    );

    const valid = fitBetweenSurfaces({
        ...options,
        section: section(rectangle(0.6, 0.6, 1, 1))
    });
    assert.equal(valid.startContact.kind, "authored-plane");
    assert.equal(valid.endContact.kind, "authored-plane");
});
