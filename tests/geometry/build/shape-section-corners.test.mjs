import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { shapeSectionCorners } = await toolbox(
    "geometry/build/shapeSectionCorners.ts"
);
const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { capBoundary } = await toolbox(
    "geometry/build/finishBoundaries.ts"
);
const { extrudeContour } = await toolbox(
    "geometry/build/extrudeContour.ts"
);
const { fillSurfacePatch } = await toolbox(
    "geometry/build/fillSurfacePatch.ts"
);
const { joinGeometry } = await toolbox(
    "geometry/build/joinGeometry.ts"
);
const { measureContour } = await toolbox(
    "geometry/topology/contourSampling.ts"
);
const { resolvePrecision } = await toolbox(
    "geometry/kernel/precision.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { toBufferGeometry } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

const p = (x, y) => new THREE.Vector2(x, y);
const rectangle = () => ({
    points: [p(-1, -1), p(-1, 1), p(1, 1), p(1, -1)],
    closed: true
});
const chamfer = (corner, width) => ({
    corner, before: width, after: width, kind: "chamfer"
});
const round = (corner, radius, segments) => ({
    corner, before: radius, after: radius, kind: "round", segments
});

test("flat chamfer keeps the source edges and names the new corner face", () => {
    const source = rectangle();
    const original = source.points.map(point => point.clone());

    const result = shapeSectionCorners(source, [
        chamfer(0, 0.2),
        chamfer(2, 0.25)
    ]);

    assert.equal(result.contour.points.length, 6);
    assert.equal(result.edges.length, 6);
    assert.deepEqual(result.contour.points[0].toArray(), [-0.8, -1]);
    assert.deepEqual(result.contour.points[1].toArray(), [-1, -0.8]);
    assert.deepEqual(result.edges[0], {
        kind: "transition", corner: 0, segment: 0
    });
    assert.deepEqual(result.edges[1], { kind: "source", edge: 0 });
    assert.deepEqual(result.edges[2], { kind: "source", edge: 1 });
    assert.deepEqual(result.edges[3], {
        kind: "transition", corner: 2, segment: 0
    });
    assert.deepEqual(source.points, original);
});

test("rounded profile uses tangent circular geometry instead of smooth shading", () => {
    const result = shapeSectionCorners(rectangle(), [
        round(0, 0.2, 6)
    ]);
    const points = result.contour.points;
    const center = p(-0.8, -0.8);

    assert.equal(points.length, 10);

    for (const point of points.slice(0, 7)) {
        assert.ok(Math.abs(point.distanceTo(center) - 0.2) < 1e-12);
    }

    assert.equal(result.edges.filter(edge =>
        edge.kind === "transition"
    ).length, 6);
    assert.ok(points[1].distanceTo(points[0]) > 0);
    assert.equal(THREE.ShapeUtils.area(points) < 0, true);
});

test("shaped beam sections compose with loft, caps, regions and Quad View", () => {
    const dimensions = { halfWidth: 0.11, halfHeight: 0.035 };
    const base = {
        points: [
            p(-dimensions.halfWidth, -dimensions.halfHeight),
            p(-dimensions.halfWidth, dimensions.halfHeight),
            p(dimensions.halfWidth, dimensions.halfHeight),
            p(dimensions.halfWidth, -dimensions.halfHeight)
        ],
        closed: true
    };
    const positions = [-0.65, -0.28, 0, 0.28, 0.65];
    const shaped = positions.map((z, index) => {
        const bevel = 0.004 + 0.001 * Math.cos(index * Math.PI / 2);
        const section = shapeSectionCorners(base, [
            chamfer(0, bevel),
            round(1, bevel, 4),
            round(2, bevel, 4),
            chamfer(3, bevel)
        ]);

        return {
            z,
            ...section,
            placed: section.contour.points.map(point =>
                new THREE.Vector3(point.x, point.y, z)
            )
        };
    });
    const edges = shaped[0].edges;

    for (const section of shaped) {
        assert.deepEqual(section.edges, edges);
        assert.equal(section.placed.length, 14);
    }

    let mesh = loftSectionWalls(shaped.map(section => ({
        outer: { points: section.placed, closed: true }
    })), {
        surfaceAt: ({ edge }) => {
            const origin = edges[edge];

            return origin.kind === "source"
                ? `base-edge-${origin.edge}`
                : `corner-${origin.corner}`;
        },
        smoothingGroupAt: ({ edge }) =>
            edges[edge].kind === "transition" ? "rounded" : undefined
    });

    for (const z of [positions[0], positions.at(-1)]) {
        const end = z === positions[0] ? "start" : "end";

        mesh = capBoundary(mesh, mesh.boundaries[`${end}-outer`][0], {
            region: `end-grain-${end}`,
            uvFrame: new THREE.Matrix4().makeTranslation(0, 0, z),
            tessellation: "triangulate"
        });
    }

    assert.equal(topologyOf(mesh).openBoundaries().length, 0);
    assert.equal(topologyOf(mesh).connectedComponents().length, 1);
    assert.equal(mesh.geometry.quads.length, edges.length * 4);
    assert.equal(mesh.regions["corner-1"].length, 4 * 4);
    assert.equal(mesh.regions["corner-2"].length, 4 * 4);
    assert.ok(mesh.regions["end-grain-start"].length > 0);
    assert.ok(mesh.regions["end-grain-end"].length > 0);

    const materialBySurface = Object.fromEntries(
        Object.keys(mesh.regions).map(name => [name, 0])
    );
    const render = toBufferGeometry(mesh, materialBySurface);

    try {
        assert.equal(
            getControlOutline(render).quadCount,
            mesh.geometry.quads.length
        );
    } finally {
        render.dispose();
    }
});

test("the same rounded outline can be independently extruded with genuine caps", () => {
    const shaped = shapeSectionCorners(rectangle(), [
        round(0, 0.1, 5),
        round(1, 0.15, 5),
        round(2, 0.1, 5),
        round(3, 0.15, 5)
    ]);

    const result = extrudeContour({
        outer: shaped.contour
    }, {
        frame: new THREE.Matrix4(),
        depth: 0.4
    });

    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.geometry.vertices.length,
        shaped.contour.points.length * 2);
    assert.ok(result.regions["cap-start"].length > 0);
    assert.ok(result.regions["cap-end"].length > 0);
});

test("one shaped profile is shared by an independent wall and a charted cap", () => {
    const shaped = shapeSectionCorners(rectangle(), [
        round(0, 0.15, 5),
        chamfer(1, 0.12),
        round(2, 0.15, 5),
        chamfer(3, 0.12)
    ]);
    const contour = shaped.contour.points;
    const wall = loftSectionWalls([0, 0.6].map(z => ({
        outer: {
            points: contour.map(point =>
                new THREE.Vector3(point.x, point.y, z)
            ),
            closed: true
        }
    })));

    const measured = measureContour(
        contour, true, "shaped-cap", resolvePrecision()
    );
    const lid = fillSurfacePatch({
        profile: {
            outer: { points: contour, parameters: measured.stations }
        },
        chart: {
            at: uv => new THREE.Vector3(uv.x, uv.y, 0.6),
            parameterOf: point => new THREE.Vector2(point.x, point.y),
            normalAt: () => new THREE.Vector3(0, 0, -1)
        },
        region: "shaped-cap"
    });

    const joined = joinGeometry([wall, lid], {
        weld: [{
            firstPart: 0,
            first: wall.boundaries["end-outer"][0],
            secondPart: 1,
            second: lid.boundaries.outer[0]
        }]
    });

    assert.equal(joined.geometry.vertices.length, contour.length * 2);
    assert.equal(topologyOf(joined).connectedComponents().length, 1);
    assert.equal(topologyOf(joined).openBoundaries().length, 1);
    assert.equal(joined.regions["shaped-cap"].length,
        lid.geometry.triangles.length);
    assert.equal(joined.patches["1:shaped-cap"][0].owner, joined.id);
    assert.ok(!joined.boundaries["end-outer"]);
    assert.ok(!joined.boundaries.outer);
});

test("malformed, overlapping and concave transitions fail explicitly", () => {
    const base = rectangle();

    for (const transitions of [
        [chamfer(0, 0.2), chamfer(0, 0.1)],
        [chamfer(0, 2)],
        [round(0, 0.2, 1)],
        [{ ...round(0, 0.2, 4), after: 0.1 }],
        [chamfer(0, 0)],
        [{ ...chamfer(0, 0.2), corner: 9 }]
    ]) {
        assert.throws(
            () => shapeSectionCorners(base, transitions),
            error => error.operation === "shapeSectionCorners"
        );
    }

    assert.throws(
        () => shapeSectionCorners({
            points: [
                p(-1, -1), p(-1, 1), p(0, 0),
                p(1, 1), p(1, -1)
            ],
            closed: true
        }, [chamfer(2, 0.1)]),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => shapeSectionCorners({
            points: [
                p(-1, -1), p(1, 1), p(-1, 1), p(1, -1)
            ],
            closed: true
        }, [chamfer(0, 0.1)]),
        error => error.reason === "degenerate-geometry" ||
            error.reason === "self-intersection"
    );

    const unmodified = shapeSectionCorners(base, []);

    assert.deepEqual(unmodified.contour.points, base.points);
    assert.deepEqual(unmodified.edges, base.points.map((_, i) => ({
        kind: "source", edge: i
    })));
});
