import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { partitionContour } = await toolbox(
    "geometry/build/partitionContour.ts"
);
const { samplePartition } = await toolbox(
    "geometry/build/samplePartition.ts"
);
const { extrudeContour } = await toolbox(
    "geometry/build/extrudeContour.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { contourWinding } = await toolbox(
    "geometry/topology/contours.ts"
);

const p = (x, y) => new THREE.Vector2(x, y);
const square = () => ({
    outer: {
        closed: true,
        points: [
            p(-1, -1), p(1, -1),
            p(1, 1), p(-1, 1)
        ]
    }
});

function boundaryContains(
    outline,
    a,
    b
) {
    return outline.some((point, i) => {
        const next = outline[(i + 1) % outline.length];

        return point.equals(a) && next.equals(b) ||
            point.equals(b) && next.equals(a);
    });
}

test("one seam refinement is inserted identically into both sampled profiles", () => {
    const raw = partitionContour(square(), [{
        id: "joined-edge",
        points: [p(1, 0), p(0, 0.2), p(-1, 0)]
    }]);
    const original = raw.parts[0].outer.points.map(point => point.clone());
    const result = samplePartition(raw, {
        "joined-edge": [0, 0.125, 0.375, 0.625, 0.875, 1]
    });

    const seam = result.interfaces[0];
    const first = result.parts[seam.firstPart].outer;
    const second = result.parts[seam.secondPart].outer;

    assert.ok(seam.points.length > raw.interfaces[0].points.length);
    assert.equal(seam.stations[0], 0);
    assert.equal(seam.stations.at(-1), 1);

    for (const point of seam.points) {
        assert.ok(first.points.some(p => p.equals(point)));
        assert.ok(second.points.some(p => p.equals(point)));
    }

    for (let i = 0; i < seam.points.length - 1; i++) {
        const a = seam.points[i];
        const b = seam.points[i + 1];

        assert.ok(boundaryContains(first.points, a, b));
        assert.ok(boundaryContains(second.points, a, b));
    }

    assert.equal(contourWinding(first.points), "clockwise");
    assert.equal(contourWinding(second.points), "clockwise");
    assert.equal(first.parameters.length, first.points.length);
    assert.equal(second.parameters.length, second.points.length);
    assert.deepEqual(raw.parts[0].outer.points, original);
});

test("several independently refined seams still describe complete solids", () => {
    const source = partitionContour(square(), [
        { id: "center", points: [p(1, 0), p(-1, 0)] },
        { id: "upper", points: [p(1, 0.5), p(-1, 0.5)] },
        { id: "lower", points: [p(1, -0.5), p(-1, -0.5)] }
    ]);

    const sampled = samplePartition(source, {
        center: [0, 0.13, 0.46, 0.9, 1],
        upper: [0, 0.25, 0.5, 1],
        lower: [0, 0.19, 0.82, 1]
    });

    assert.equal(sampled.parts.length, 4);
    assert.equal(sampled.interfaces.length, 3);

    for (const seam of sampled.interfaces) {
        const first = sampled.parts[seam.firstPart].outer.points;
        const second = sampled.parts[seam.secondPart].outer.points;

        for (let i = 0; i < seam.points.length - 1; i++) {
            const a = seam.points[i];
            const b = seam.points[i + 1];

            assert.ok(boundaryContains(first, a, b));
            assert.ok(boundaryContains(second, a, b));
        }
    }

    for (const part of sampled.parts) {
        const solid = extrudeContour(part, {
            frame: new THREE.Matrix4(),
            depth: 0.14
        });

        assert.equal(topologyOf(solid).openBoundaries().length, 0);
        assert.equal(topologyOf(solid).connectedComponents().length, 1);
    }
});

test("bad refinement requests are rejected instead of moving seams", () => {
    const source = partitionContour(square(), [{
        id: "join",
        points: [p(1, 0), p(-1, 0)]
    }]);

    assert.throws(
        () => samplePartition(source, {
            join: [0, 0.5, 0.5, 1]
        }),
        error => error.operation === "samplePartition" &&
            error.reason === "invalid-input"
    );

    assert.throws(
        () => samplePartition(source, {
            missing: [0, 1]
        }),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => samplePartition(source, {
            join: [0, 1e-12, 1]
        }),
        error => error.reason === "invalid-input"
    );
});
