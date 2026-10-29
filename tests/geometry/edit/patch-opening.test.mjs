import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {openPatch, recessPatch} = await toolbox(
    "geometry/edit/patchOpening.ts"
);
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {geometryResult, assertSelectionOwner} = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const {fillSurfacePatch} = await toolbox(
    "geometry/build/fillSurfacePatch.ts"
);
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {toBufferGeometry, getControlMesh} = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

const p = (x, y) => new THREE.Vector2(x, y);
const outline = (size = 0.4) => ({
    closed: true,
    points: [
        p(-size, -size), p(-size, size),
        p(size, size), p(size, -size)
    ]
});

function boxTop(segments = 1) {
    const original = geometryResult(boxMesh({
        width: 2, height: 2, depth: 2,
        widthSegments: segments, depthSegments: segments
    }));
    const faces = original.geometry.quads.flatMap((face, index) =>
        face.surface === "py" ? [{kind: "quad", index}] : []
    );
    const chart = {
        at: uv => new THREE.Vector3(uv.x, 1, -uv.y),
        parameterOf: point => new THREE.Vector2(point.x, -point.z),
        normalAt: () => new THREE.Vector3(0, 1, 0)
    };
    const selected = {owner: original.id, faces, chart};
    const rim = topologyOf(original).regionBoundaries("py");
    const source = {
        ...original,
        boundaries: {topOutline: rim},
        patches: {top: [selected]}
    };
    return {source, selected};
}

test("openPatch removes a true interior opening without changing the box edges", () => {
    const {source, selected} = boxTop(2);
    const before = source.geometry.vertices.map(point => point.clone());
    const result = openPatch(source, selected, outline());

    assert.notEqual(result.id, source.id);
    assert.deepEqual(source.geometry.vertices, before);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(topologyOf(result).openBoundaries().length, 1);
    assert.equal(result.boundaries.opening.length, 1);
    assert.equal(result.boundaries.opening[0].closed, true);
    assert.equal(result.boundaries.topOutline.length, 1);
    assert.equal(result.patches.top.length, 1);
    assertSelectionOwner(result, result.patches.top[0]);
    assertSelectionOwner(result, result.boundaries.opening[0]);
    assert.throws(() => assertSelectionOwner(source, result.boundaries.opening[0]));

    // Every authored boundary edge of the old top remains present.
    for (const rim of source.boundaries.topOutline) {
        for (let i = 0; i < rim.vertices.length; i++) {
            const a = rim.vertices[i];
            const b = rim.vertices[(i + 1) % rim.vertices.length];
            assert.ok(topologyOf(result).edgeUses(a, b).length);
        }
    }

    const surfaces = Object.fromEntries(
        Object.keys(result.regions).map(name => [name, 0])
    );
    const geometry = toBufferGeometry(result, surfaces);
    try {
        assert.equal(getControlMesh(geometry), result.geometry);
        assert.ok(geometry.getAttribute("uv").count > 0);
    } finally {
        geometry.dispose();
    }
});

test("recessPatch creates a closed manifold pocket with explicit floor and walls", () => {
    const {source, selected} = boxTop(2);
    const result = recessPatch(source, selected, outline(), {
        depth: 0.4,
        wallRegion: "sawn-wall",
        floorRegion: "pocket-floor"
    });

    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions["sawn-wall"].length, 4);
    assert.equal(result.geometry.quads.filter(face =>
        face.surface === "sawn-wall"
    ).length, 4);
    assert.equal(result.regions["pocket-floor"].length, 2);
    assert.equal(result.boundaries.opening[0].vertices.length, 4);
    assert.equal(result.boundaries["floor-rim"][0].vertices.length, 4);
    assert.equal(result.patches.top.length, 1);
    assert.equal(result.patches["pocket-floor"].length, 1);

    for (const id of result.boundaries["floor-rim"][0].vertices) {
        assert.ok(Math.abs(result.geometry.vertices[id].y - 0.6) < 1e-12);
    }
    for (const face of result.geometry.quads.filter(face =>
        face.surface === "sawn-wall"
    )) {
        const [a, b, c] = face.corners.map(id =>
            result.geometry.vertices[id]
        );
        assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length() > 0);
    }
    for (const face of result.geometry.triangles.filter(face =>
        face.surface === "pocket-floor"
    )) {
        const [a, b, c] = face.corners.map(id =>
            result.geometry.vertices[id]
        );
        assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).y > 0);
    }
});

test("a filled charted patch can gain a second separate opening beside its existing hole", () => {
    const chart = {
        at: uv => new THREE.Vector3(uv.x, uv.y, 0),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: () => new THREE.Vector3(0, 0, 1)
    };
    const profile = {
        outer: {
            parameters: [0, 0.25, 0.5, 0.75],
            points: [
                p(-2, -2), p(-2, 2), p(2, 2), p(2, -2)
            ]
        },
        holes: [{
            parameters: [0, 0.25, 0.5, 0.75],
            points: [
                p(-1.6, -0.4), p(-0.8, -0.4),
                p(-0.8, 0.4), p(-1.6, 0.4)
            ]
        }]
    };
    const source = fillSurfacePatch({
        profile, chart, region: "surface"
    });
    const result = openPatch(source, source.patches.surface[0], {
        closed: true,
        points: [
            p(0.6, -0.5), p(1.5, -0.5),
            p(1.5, 0.5), p(0.6, 0.5)
        ]
    });
    assert.equal(topologyOf(result).openBoundaries().length, 3);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.patches.surface.length, 1);
    assert.equal(result.boundaries.outer.length, 1);
    assert.equal(result.boundaries["hole-0"].length, 1);
    assert.equal(result.boundaries.opening.length, 1);
});

test("invalid outlines, stale ownership and nonlinear UVs fail explicitly", () => {
    const {source, selected} = boxTop();
    assert.throws(
        () => openPatch(source, {...selected, owner: Symbol()}, outline()),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => openPatch(source, selected, outline(1)),
        error => error.reason === "unsupported-topology"
    );
    assert.throws(
        () => openPatch(source, selected, {
            closed: true,
            points: [p(-0.4, -0.4), p(0.4, 0.4),
                p(-0.4, 0.4), p(0.4, -0.4)]
        }),
        error => error.reason === "unsupported-topology" ||
            error.reason === "degenerate-geometry"
    );
    assert.throws(
        () => recessPatch(source, selected, outline(), {
            depth: 2.2, wallRegion: "wall", floorRegion: "floor"
        }),
        error => error.reason === "unsupported-topology"
    );

    const faceId = selected.faces[0].index;
    const altered = geometryResult({
        vertices: source.geometry.vertices,
        quads: source.geometry.quads.map((face, i) => ({
            ...face,
            uvs: face.uvs.map((uv, j) => i === faceId && j === 2
                ? uv.clone().add(p(0.3, 0))
                : uv.clone())
        })),
        triangles: source.geometry.triangles
    });
    const modifiedSelection = {...selected, owner: altered.id};
    assert.throws(
        () => openPatch(altered, modifiedSelection, outline()),
        error => error.reason === "unsupported-topology"
    );
});

test("successive independent openings retain both named rims and the rebuilt patch", () => {
    const {source, selected} = boxTop(2);
    const left = {
        closed: true,
        points: [
            p(-0.8, -0.25), p(-0.8, 0.25),
            p(-0.3, 0.25), p(-0.3, -0.25)
        ]
    };
    const right = {
        closed: true,
        points: [
            p(0.3, -0.25), p(0.3, 0.25),
            p(0.8, 0.25), p(0.8, -0.25)
        ]
    };

    const first = openPatch(source, selected, left);
    const second = openPatch(first, first.patches.top[0], right);
    assert.equal(topologyOf(first).openBoundaries().length, 1);
    assert.equal(topologyOf(second).openBoundaries().length, 2);
    assert.equal(second.boundaries.opening.length, 2);
    assert.ok(second.boundaries.opening.every(rim =>
        rim.owner === second.id && rim.closed
    ));
    assert.equal(second.patches.top.length, 1);
    assert.equal(second.boundaries.topOutline.length, 1);
});

test("the opening cannot enclose an existing void", () => {
    const chart = {
        at: uv => new THREE.Vector3(uv.x, uv.y, 0),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: () => new THREE.Vector3(0, 0, 1)
    };
    const source = fillSurfacePatch({
        chart,
        region: "surface",
        profile: {
            outer: {
                points: [p(-2, -2), p(-2, 2), p(2, 2), p(2, -2)],
                parameters: [0, 0.25, 0.5, 0.75]
            },
            holes: [{
                points: [p(-0.2, -0.2), p(0.2, -0.2),
                    p(0.2, 0.2), p(-0.2, 0.2)],
                parameters: [0, 0.25, 0.5, 0.75]
            }]
        }
    });
    assert.throws(
        () => openPatch(source, source.patches.surface[0], outline(0.6)),
        error => error.reason === "unsupported-topology"
    );
});

test("a curved chart with a planar perimeter can now be opened", () => {
    const chart = {
        at: uv => new THREE.Vector3(
            uv.x, uv.y, 0.12 * (1 - uv.x ** 2) * (1 - uv.y ** 2)
        ),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: uv => new THREE.Vector3(
            0.24 * uv.x * (1 - uv.y ** 2),
            0.24 * uv.y * (1 - uv.x ** 2),
            1
        ).normalize()
    };
    const source = fillSurfacePatch({
        region: "curved",
        chart,
        profile: {
            outer: {
                points: [p(-1, -1), p(-1, 1), p(1, 1), p(1, -1)],
                parameters: [0, 0.25, 0.5, 0.75]
            }
        }
    });
    const opened = openPatch(source, source.patches.curved[0], outline(0.2));
    assert.equal(topologyOf(opened).openBoundaries().length, 2);
    assert.equal(opened.boundaries.opening[0].vertices.length, 4);
    assert.ok(opened.patches.curved.length === 1);
});

function parabolicPatch() {
    const chart = {
        at: uv => new THREE.Vector3(
            uv.x, uv.y, 0.08 * (uv.x ** 2 + uv.y ** 2)
        ),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: uv => new THREE.Vector3(
            -0.16 * uv.x, -0.16 * uv.y, 1
        ).normalize()
    };
    const border = half => {
        const corners = [
            p(-half, -half), p(-half, half),
            p(half, half), p(half, -half)
        ];
        const steps = 12;
        return corners.flatMap((point, side) =>
            Array.from({length: steps}, (_, i) =>
                point.clone().lerp(
                    corners[(side + 1) % corners.length], i / steps
                )
            )
        );
    };
    const outside = border(1);
    const source = fillSurfacePatch({
        region: "curved-timber",
        chart,
        profile: {
            outer: {
                points: outside,
                parameters: outside.map((_, i) => i / outside.length)
            }
        },
        maxDeviation: 0.005
    });
    return {
        source, chart,
        inner: {closed: true, points: border(0.4)}
    };
}

test("curved opening preserves every authored outer station and returns its chart", () => {
    const {source, chart, inner} = parabolicPatch();
    const before = source.geometry.vertices.map(v => v.clone());
    const opened = openPatch(
        source, source.patches["curved-timber"][0], inner
    );
    assert.deepEqual(source.geometry.vertices, before);
    assert.equal(topologyOf(opened).openBoundaries().length, 2);
    assert.equal(topologyOf(opened).connectedComponents().length, 1);
    assert.equal(opened.boundaries.outer[0].vertices.length,
        source.boundaries.outer[0].vertices.length);
    assert.equal(opened.boundaries.opening[0].vertices.length,
        inner.points.length);
    assert.equal(opened.patches["curved-timber"].length, 1);

    const rim = opened.boundaries.opening[0].vertices.map(id =>
        opened.geometry.vertices[id]
    );
    assert.ok(rim.every(v =>
        v.distanceTo(chart.at(chart.parameterOf(v))) < 1e-9
    ));
    assert.ok(rim.some(v => Math.abs(v.z - rim[0].z) > 0.01));
    assert.ok(opened.geometry.triangles.length > source.geometry.triangles.length / 2);
    assertSelectionOwner(opened, opened.patches["curved-timber"][0]);
});

test("curved recess offsets along local normals and returns a usable floor chart", () => {
    const {source, chart, inner} = parabolicPatch();
    const result = recessPatch(
        source, source.patches["curved-timber"][0], inner, {
            depth: 0.12,
            wallRegion: "cut-side",
            floorRegion: "curved-floor"
        }
    );

    assert.equal(topologyOf(result).openBoundaries().length, 1);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions["cut-side"].length, inner.points.length);
    assert.ok(result.regions["curved-floor"].length > 2);
    assert.ok(result.patches["curved-floor"].length === 1);
    assertSelectionOwner(result, result.patches["curved-floor"][0]);

    const floor = result.patches["curved-floor"][0].chart;
    for (const point of [p(0, 0), p(0.15, 0.25), p(-0.3, 0.1)]) {
        const expected = chart.at(point);
        const normal = chart.normalAt(point);
        const actual = floor.at(point);
        assert.ok(actual.distanceTo(
            expected.clone().addScaledVector(normal, -0.12)
        ) < 1e-8);
        assert.ok(new THREE.Vector2().copy(floor.parameterOf(actual))
            .distanceTo(point) < 1e-7);
    }
    const roof = result.boundaries.opening[0].vertices;
    const bottom = result.boundaries["floor-rim"][0].vertices;
    for (let i = 0; i < roof.length; i++) {
        const topPosition = result.geometry.vertices[roof[i]];
        const floorPosition = result.geometry.vertices[bottom[i]];
        const uv = chart.parameterOf(topPosition);
        const expectedNormal = chart.normalAt(uv);
        assert.ok(Math.abs(topPosition.distanceTo(floorPosition) - 0.12) < 1e-8);
        assert.ok(topPosition.clone().sub(floorPosition)
            .normalize().dot(expectedNormal) > 0.999999);
    }
});
