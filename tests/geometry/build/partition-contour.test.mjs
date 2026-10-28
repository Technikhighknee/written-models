import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { partitionContour } = await toolbox(
    "geometry/build/partitionContour.ts"
);
const { extrudeContour } = await toolbox(
    "geometry/build/extrudeContour.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);

const p = (x, y) => new THREE.Vector2(x, y);
const square = () => ({
    outer: {
        closed: true,
        points: [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)]
    }
});

function area(points) {
    return Math.abs(THREE.ShapeUtils.area(points));
}

function boundaryEdges(profile) {
    const points = profile.outer.points;
    const edges = [];

    for (let i = 0; i < points.length; i++) {
        edges.push([points[i], points[(i + 1) % points.length]]);
    }

    return edges;
}

function ownsInterface(part, points) {
    const edges = boundaryEdges(part);

    return points.slice(0, -1).every((a, i) => {
        const b = points[i + 1];

        return edges.some(([from, to]) =>
            from.equals(a) && to.equals(b) ||
            from.equals(b) && to.equals(a)
        );
    });
}

test("a bent shared seam keeps every sampled point in both pieces", () => {
    const input = square();
    const original = input.outer.points.map(point => point.clone());
    const result = partitionContour(input, [{
        id: "curved-seam",
        points: [p(1, 0), p(0.35, 0.12), p(0, 0.24),
            p(-0.35, 0.12), p(-1, 0)]
    }]);

    assert.equal(result.parts.length, 2);
    assert.equal(result.interfaces.length, 1);

    const seam = result.interfaces[0];
    assert.equal(seam.cutId, "curved-seam");
    assert.equal(seam.stations[0], 0);
    assert.equal(seam.stations.at(-1), 1);
    assert.ok(seam.stations.every((s, i) =>
        i === 0 || s > seam.stations[i - 1]
    ));

    assert.ok(ownsInterface(result.parts[seam.firstPart], seam.points));
    assert.ok(ownsInterface(result.parts[seam.secondPart], seam.points));
    assert.ok(Math.abs(
        area(result.parts[0].outer.points) +
            area(result.parts[1].outer.points) - 4
    ) < 1e-12);
    assert.deepEqual(input.outer.points, original);

    const first = result.parts[seam.firstPart].outer.points;
    const second = result.parts[seam.secondPart].outer.points;

    for (const point of seam.points) {
        assert.ok(first.some(vertex => vertex.equals(point)));
        assert.ok(second.some(vertex => vertex.equals(point)));
    }

    // The source is convex, but its partition may have a concave edge.
    const turns = first.map((point, i) => {
        const a = first[(i + first.length - 1) % first.length];
        const b = first[(i + 1) % first.length];

        return (point.x - a.x) * (b.y - point.y) -
            (point.y - a.y) * (b.x - point.x);
    });

    assert.ok(turns.some(turn => turn > 0));
    assert.ok(turns.some(turn => turn < 0));
});

test("later parallel cuts transfer prior interface ownership correctly", () => {
    const result = partitionContour(square(), [
        { id: "middle", points: [p(1, 0), p(-1, 0)] },
        { id: "upper", points: [p(1, 0.5), p(-1, 0.5)] },
        { id: "lower", points: [p(1, -0.5), p(-1, -0.5)] }
    ]);

    assert.equal(result.parts.length, 4);
    assert.equal(result.interfaces.length, 3);
    assert.ok(Math.abs(result.parts.reduce(
        (sum, part) => sum + area(part.outer.points), 0
    ) - 4) < 1e-12);

    for (const seam of result.interfaces) {
        assert.notEqual(seam.firstPart, seam.secondPart);
        assert.ok(ownsInterface(result.parts[seam.firstPart], seam.points));
        assert.ok(ownsInterface(result.parts[seam.secondPart], seam.points));
    }

    assert.equal(result.interfaces[0].firstPart, 2);
    assert.equal(result.interfaces[0].secondPart, 1);
});

test("the partition of a sampled circular head remains independently extrudable", () => {
    const vertices = Array.from({ length: 32 }, (_, i) => {
        const angle = Math.PI * 2 * i / 32;

        return p(Math.cos(angle), Math.sin(angle));
    });
    const source = { outer: { points: vertices, closed: true } };

    function verticalCut(x, id) {
        const points = [];

        for (let i = 0; i < vertices.length; i++) {
            const a = vertices[i];
            const b = vertices[(i + 1) % vertices.length];

            if ((a.x < x && b.x > x) || (a.x > x && b.x < x)) {
                const t = (x - a.x) / (b.x - a.x);
                points.push(a.clone().lerp(b, t));
            }
        }

        points.sort((a, b) => a.y - b.y);
        assert.equal(points.length, 2);

        return { id, points };
    }

    const cutA = verticalCut(-0.42, "left-plank");
    const cutB = verticalCut(0.35, "right-plank");
    const result = partitionContour(source, [cutA, cutB]);

    assert.equal(result.parts.length, 3);
    assert.equal(result.interfaces.length, 2);

    const total = result.parts.reduce(
        (sum, part) => sum + area(part.outer.points), 0
    );
    assert.ok(Math.abs(total - area(vertices)) < 1e-12);

    for (const seam of result.interfaces) {
        assert.ok(ownsInterface(result.parts[seam.firstPart], seam.points));
        assert.ok(ownsInterface(result.parts[seam.secondPart], seam.points));
    }

    for (const piece of result.parts) {
        const solid = extrudeContour(piece, {
            frame: new THREE.Matrix4(),
            depth: 0.06
        });

        assert.equal(topologyOf(solid).openBoundaries().length, 0);
        assert.equal(topologyOf(solid).connectedComponents().length, 1);
    }
});

test("rejects unsupported crossings, holes, nonconvex inputs and bad cuts", () => {
    const full = { id: "horizontal", points: [p(1, 0), p(-1, 0)] };
    const cross = { id: "vertical", points: [p(0, -1), p(0, 1)] };

    assert.throws(
        () => partitionContour(square(), [full, cross]),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => partitionContour({
            ...square(),
            holes: [{
                closed: true,
                points: [p(-0.2, -0.2), p(0.2, -0.2),
                    p(0.2, 0.2), p(-0.2, 0.2)]
            }]
        }, [full]),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => partitionContour({
            outer: {
                closed: true,
                points: [
                    p(-1, -1), p(1, -1), p(0, 0),
                    p(1, 1), p(-1, 1)
                ]
            }
        }, [full]),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => partitionContour(square(), [full, full]),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => partitionContour(square(), [{
            id: "boundary-touch",
            points: [p(1, 0), p(0, 1), p(-1, 0)]
        }]),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => partitionContour(square(), [{
            id: "outside",
            points: [p(1, 0), p(0, 1.4), p(-1, 0)]
        }]),
        error => error.reason === "unsupported-topology"
    );
});
