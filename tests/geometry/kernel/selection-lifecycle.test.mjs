import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { toolbox } from "../../support/toolbox.mjs";

const { geometryResult } = await toolbox("geometry/kernel/GeometryResult.ts");
const { transferBoundary, patchChartMatches, selectionEdgeKey } = await toolbox(
    "geometry/kernel/selectionLifecycle.ts"
);

function face() {
    const result = geometryResult({
        vertices: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(1, 1, 0),
            new THREE.Vector3(0, 1, 0)
        ],
        quads: [{
            corners: [0, 1, 2, 3],
            uvs: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(1, 0),
                new THREE.Vector2(1, 1),
                new THREE.Vector2(0, 1)
            ],
            surface: "top"
        }]
    });
    return {
        ...result,
        boundaries: {
            rim: [{
                owner: result.id,
                vertices: [0, 1, 2, 3],
                closed: true
            }]
        }
    };
}

test("partially consumed closed rings become valid open runs", () => {
    const source = face();
    const target = geometryResult(source.geometry);
    const runs = transferBoundary(
        source, target, source.boundaries.rim[0],
        id => id, new Set([selectionEdgeKey(1, 2)])
    );

    assert.equal(runs.length, 1);
    assert.equal(runs[0].owner, target.id);
    assert.equal(runs[0].closed, false);
    assert.deepEqual(runs[0].vertices, [2, 3, 0, 1]);
    assert.deepEqual(
        transferBoundary(source, target, source.boundaries.rim[0], id => id),
        [{ owner: target.id, vertices: [0, 1, 2, 3], closed: true }]
    );
    assert.deepEqual(
        transferBoundary(
            source, target, source.boundaries.rim[0], id => id,
            new Set(["0:1", "1:2", "2:3", "0:3"])
        ),
        []
    );
});

test("patch charts must reproduce the actual selected vertices", () => {
    const source = face();
    const patch = {
        owner: source.id,
        faces: [{ kind: "quad", index: 0 }],
        chart: {
            at: uv => new THREE.Vector3(uv.x, uv.y, 0),
            parameterOf: point => new THREE.Vector2(point.x, point.y),
            normalAt: () => new THREE.Vector3(0, 0, 1)
        }
    };

    assert.equal(patchChartMatches(source, patch), true);
    assert.equal(
        patchChartMatches(source, {
            ...patch,
            chart: {
                ...patch.chart,
                at: uv => new THREE.Vector3(uv.x, uv.y, 0.1)
            }
        }),
        false
    );
});

test("missing target edges split named chains without leaving stale IDs", () => {
    const source = face();
    const target = geometryResult({
        vertices: source.geometry.vertices,
        quads: [],
        triangles: [{
            corners: [0, 1, 2],
            uvs: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(1, 0),
                new THREE.Vector2(1, 1)
            ],
            surface: "half"
        }]
    });

    const runs = transferBoundary(
        source, target, source.boundaries.rim[0], id => id
    );
    assert.deepEqual(runs, [{
        owner: target.id,
        vertices: [0, 1, 2],
        closed: false
    }]);

    assert.throws(
        () => transferBoundary(
            source, target, source.boundaries.rim[0], () => 0
        ),
        error => error.reason === "invalid-topology"
    );
});

test("chart ownership and orientation are part of survival", () => {
    const source = face();
    const other = face();
    const patch = {
        owner: source.id,
        faces: [{ kind: "quad", index: 0 }],
        chart: {
            at: uv => new THREE.Vector3(uv.x, uv.y, 0),
            parameterOf: point => new THREE.Vector2(point.x, point.y),
            normalAt: () => new THREE.Vector3(0, 0, 1)
        }
    };

    assert.throws(
        () => patchChartMatches(other, patch),
        error => error.reason === "invalid-input"
    );
    assert.equal(
        patchChartMatches(source, {
            ...patch,
            chart: {
                ...patch.chart,
                normalAt: () => new THREE.Vector3(0, 0, -1)
            }
        }),
        false
    );
});

test("a chart does not turn disconnected faces into one surface patch", () => {
    const quad = (offset) => ({
        corners: [offset, offset + 1, offset + 2, offset + 3],
        uvs: [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(1, 0),
            new THREE.Vector2(1, 1),
            new THREE.Vector2(0, 1)
        ],
        surface: "top"
    });
    const result = geometryResult({
        vertices: [
            ...face().geometry.vertices,
            new THREE.Vector3(3, 0, 0),
            new THREE.Vector3(4, 0, 0),
            new THREE.Vector3(4, 1, 0),
            new THREE.Vector3(3, 1, 0)
        ],
        quads: [quad(0), quad(4)]
    });

    assert.equal(patchChartMatches(result, {
        owner: result.id,
        faces: [
            { kind: "quad", index: 0 },
            { kind: "quad", index: 1 }
        ],
        chart: {
            at: uv => new THREE.Vector3(uv.x, uv.y, 0),
            parameterOf: point => new THREE.Vector2(point.x, point.y),
            normalAt: () => new THREE.Vector3(0, 0, 1)
        }
    }), false);
});
