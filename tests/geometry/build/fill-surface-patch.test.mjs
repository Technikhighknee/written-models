import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { fillSurfacePatch } = await toolbox(
    "geometry/build/fillSurfacePatch.ts"
);
const { partitionContour } = await toolbox(
    "geometry/build/partitionContour.ts"
);
const { samplePartition } = await toolbox(
    "geometry/build/samplePartition.ts"
);
const { sampleProfile } = await toolbox(
    "geometry/build/sampleProfile.ts"
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
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { assertSelectionOwner } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);

const v = (x, y) => new THREE.Vector2(x, y);

function rectangle() {
    return {
        outer: {
            points: [v(-1, -1), v(-1, 1), v(1, 1), v(1, -1)],
            closed: true
        }
    };
}

function planarChart() {
    return {
        at: uv => new THREE.Vector3(uv.x, uv.y, 0),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: () => new THREE.Vector3(0, 0, 1)
    };
}

function crownChart() {
    const height = (x, y) =>
        0.1 * (1 - x * x) * (1 - y * y) * y * y;
    const dx = (x, y) =>
        -0.2 * x * (1 - y * y) * y * y;
    const dy = (x, y) =>
        0.1 * (1 - x * x) * (2 * y - 4 * y ** 3);

    return {
        at: uv => new THREE.Vector3(
            uv.x, uv.y, height(uv.x, uv.y)
        ),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: uv => new THREE.Vector3(
            -dx(uv.x, uv.y), -dy(uv.x, uv.y), 1
        ).normalize()
    };
}

function sampled(profile) {
    const precision = resolvePrecision();
    const outer = measureContour(
        profile.outer.points.map(p => new THREE.Vector2(p.x, p.y)),
        true, "test", precision
    );

    const holes = profile.holes?.map(hole =>
        measureContour(
            hole.points.map(p => new THREE.Vector2(p.x, p.y)),
            true, "test", precision
        ).stations
    );

    return sampleProfile(profile, {
        outer: outer.stations,
        ...(holes ? { holes } : {})
    });
}

function verifyBoundary(result, input, name) {
    const selection = result.boundaries[name][0];
    assertSelectionOwner(result, selection);
    assert.equal(selection.closed, true);
    assert.equal(selection.vertices.length, input.points.length);

    for (const point of input.points) {
        assert.ok(selection.vertices.some(id => {
            const vertex = result.geometry.vertices[id];

            return vertex.x === point.x && vertex.y === point.y;
        }));
    }

    for (const id of selection.vertices) {
        const vertex = result.geometry.vertices[id];
        assert.equal(vertex.z, result.patches.patch[0].chart.at(vertex).z);
    }
}

test("a planar patch with a hole keeps every sampled rim vertex", () => {
    const profile = sampled({
        outer: {
            points: [
                v(-1, -1), v(-1, 1), v(1, 1), v(1, -1)
            ],
            closed: true
        },
        holes: [{
            points: [
                v(-0.4, -0.4), v(0.4, -0.4),
                v(0.4, 0.4), v(-0.4, 0.4)
            ],
            closed: true
        }]
    });

    const result = fillSurfacePatch({
        profile, chart: planarChart(), region: "patch"
    });

    assert.equal(result.geometry.quads.length, 0);
    assert.equal(result.geometry.vertices.length, 8);
    assert.equal(topologyOf(result).openBoundaries().length, 2);
    assert.equal(topologyOf(result).connectedComponents().length, 1);

    verifyBoundary(result, profile.outer, "outer");
    verifyBoundary(result, profile.holes[0], "hole-0");

    const reference = result.patches.patch[0];
    assertSelectionOwner(result, reference);
    assert.equal(reference.faces.length, result.geometry.triangles.length);

    const material = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "FillWithHole",
        geometry: result,
        materials: material
    });

    try {
        assert.equal(getControlOutline(mesh.geometry).quadCount, 0);
        assert.equal(
            mesh.geometry.index.count,
            result.geometry.triangles.length * 3
        );
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }
});

test("curved adjacent patches gain interior detail but retain one exact seam", () => {
    const source = partitionContour(rectangle(), [{
        id: "shared",
        points: [v(1, 0), v(0.25, 0), v(-1, 0)]
    }]);
    const partition = samplePartition(source, {
        shared: [0, 0.1, 0.28, 0.6, 0.9, 1]
    });
    const inputCounts = partition.parts.map(part => part.outer.points.length);
    const results = partition.parts.map(profile =>
        fillSurfacePatch({
            profile,
            region: "patch",
            chart: crownChart(),
            maxDeviation: 0.002
        })
    );

    assert.equal(results.length, 2);

    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const initialCount = inputCounts[i];

        assert.ok(result.geometry.vertices.length > initialCount);
        assert.equal(topologyOf(result).openBoundaries().length, 1);
        assert.equal(topologyOf(result).connectedComponents().length, 1);
        verifyBoundary(result, partition.parts[i].outer, "outer");
        assert.ok(result.geometry.triangles.length > initialCount - 2);
    }

    const interfacePoints = partition.interfaces[0].points;

    for (const point of interfacePoints) {
        const first = results[0].geometry.vertices.find(vertex =>
            vertex.x === point.x && vertex.y === point.y
        );
        const second = results[1].geometry.vertices.find(vertex =>
            vertex.x === point.x && vertex.y === point.y
        );

        assert.ok(first);
        assert.ok(second);
        assert.deepEqual(first.toArray(), second.toArray());
    }

    assert.equal(
        partition.interfaces[0].stations.length,
        interfacePoints.length
    );
});

test("boundary curvature beyond its agreed sampling reports a typed limit", () => {
    const chart = {
        at: uv => new THREE.Vector3(
            uv.x, uv.y, 0.1 * (uv.x ** 2 + uv.y ** 2)
        ),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: uv => new THREE.Vector3(
            -0.2 * uv.x, -0.2 * uv.y, 1
        ).normalize()
    };

    assert.throws(
        () => fillSurfacePatch({
            profile: sampled(rectangle()),
            chart,
            region: "patch",
            maxDeviation: 0.001
        }),
        error => error.operation === "fillSurfacePatch" &&
            error.reason === "sampling-limit"
    );
});

test("bad chart inverse, wrong input winding and bad refinement fail", () => {
    const profile = sampled(rectangle());

    assert.throws(
        () => fillSurfacePatch({
            profile,
            region: "patch",
            chart: {
                ...planarChart(),
                parameterOf: () => v(0, 0)
            }
        }),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => fillSurfacePatch({
            profile: {
                ...profile,
                outer: {
                    ...profile.outer,
                    points: profile.outer.points.slice().reverse()
                }
            },
            region: "patch",
            chart: planarChart()
        }),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => fillSurfacePatch({
            profile,
            region: "patch",
            chart: planarChart(),
            maxDeviation: -1
        }),
        error => error.reason === "invalid-input"
    );
});
