import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {cutThrough} = await toolbox("geometry/edit/cutThrough.ts");
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {geometryResult, assertSelectionOwner} = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {toBufferGeometry, getControlMesh} = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

const p = (x, y) => new THREE.Vector2(x, y);

function rect(size = 0.4, x = 0) {
    return {
        closed: true,
        points: [
            p(x - size, -size),
            p(x - size, size),
            p(x + size, size),
            p(x + size, -size)
        ]
    };
}

function box(size = 2, segments = 2) {
    const result = geometryResult(boxMesh({
        width: size, height: size, depth: size,
        widthSegments: segments,
        depthSegments: segments
    }));
    const patches = {
        top: [{
            owner: result.id,
            faces: result.geometry.quads.flatMap((face, index) =>
                face.surface === "py" ? [{kind: "quad", index}] : []
            ),
            chart: {
                at: uv => new THREE.Vector3(uv.x, size / 2, -uv.y),
                parameterOf: point => new THREE.Vector2(point.x, -point.z),
                normalAt: () => new THREE.Vector3(0, 1, 0)
            }
        }],
        bottom: [{
            owner: result.id,
            faces: result.geometry.quads.flatMap((face, index) =>
                face.surface === "ny" ? [{kind: "quad", index}] : []
            ),
            chart: {
                at: uv => new THREE.Vector3(uv.x, -size / 2, uv.y),
                parameterOf: point => new THREE.Vector2(point.x, point.z),
                normalAt: () => new THREE.Vector3(0, -1, 0)
            }
        }]
    };
    return {...result, patches};
}

function through(source, top = rect(), bottom = rect()) {
    return {
        wallRegion: "bore-wall",
        entry: {patch: source.patches.top[0], contour: top},
        exit: {patch: source.patches.bottom[0], contour: bottom}
    };
}

test("a box gets a real four-quad through-bore and remains a closed solid", () => {
    const source = box();
    const before = source.geometry.vertices.map(v => v.clone());
    const result = cutThrough(source, through(source));

    assert.notEqual(result.id, source.id);
    assert.deepEqual(source.geometry.vertices, before);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions["bore-wall"].length, 4);
    assert.equal(result.geometry.quads.filter(face =>
        face.surface === "bore-wall"
    ).length, 4);
    assert.equal(result.boundaries["through-entry"].length, 1);
    assert.equal(result.boundaries["through-exit"].length, 1);

    for (const name of ["through-entry", "through-exit"]) {
        const rim = result.boundaries[name][0];
        assertSelectionOwner(result, rim);
        assert.equal(rim.closed, true);
        assert.equal(rim.vertices.length, 4);
        for (let i = 0; i < rim.vertices.length; i++) {
            const a = rim.vertices[i];
            const b = rim.vertices[(i + 1) % rim.vertices.length];
            assert.equal(topologyOf(result).edgeUses(a, b).length, 2);
        }
    }

    assert.equal(result.patches.top.length, 1);
    assert.equal(result.patches.bottom.length, 1);
    assertSelectionOwner(result, result.patches.top[0]);
    assertSelectionOwner(result, result.patches.bottom[0]);

    const geometry = toBufferGeometry(
        result,
        Object.fromEntries(Object.keys(result.regions).map(name => [name, 0]))
    );
    try {
        assert.equal(getControlMesh(geometry), result.geometry);
        assert.ok(geometry.getAttribute("uv").count > 0);
    } finally {
        geometry.dispose();
    }
});

test("matching non-square section keeps six actual tunnel panels", () => {
    const source = box();
    const profile = {
        closed: true,
        points: [
            p(-0.5, -0.3), p(-0.5, 0),
            p(-0.5, 0.3), p(0.5, 0.3),
            p(0.5, 0), p(0.5, -0.3)
        ]
    };
    const result = cutThrough(source, through(source, profile, profile));
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.boundaries["through-entry"][0].vertices.length, 6);
    assert.equal(result.regions["bore-wall"].length, 6);
});

test("unmatched, displaced, stale and overlapping patches fail", () => {
    const source = box();

    assert.throws(
        () => cutThrough(source, through(source, rect(0.4), rect(0.3))),
        error => error.reason === "unsupported-topology"
    );
    assert.throws(
        () => cutThrough(source, through(source, rect(0.4), rect(0.4, 0.15))),
        error => error.reason === "unsupported-topology"
    );
    assert.throws(
        () => cutThrough(source, {
            ...through(source),
            exit: {
                patch: source.patches.top[0],
                contour: rect()
            }
        }),
        error => error.reason === "unsupported-topology" ||
            error.reason === "invalid-input"
    );
    assert.throws(
        () => cutThrough(source, {
            ...through(source),
            entry: {
                patch: {...source.patches.top[0], owner: Symbol()},
                contour: rect()
            }
        }),
        error => error.reason === "invalid-input"
    );
});

test("a second disjoint closed solid is not silently included in the tunnel", () => {
    const first = box();
    const other = box(0.4, 1);
    const shifted = {
        vertices: [
            ...first.geometry.vertices,
            ...other.geometry.vertices.map(v => v.clone().add(
                new THREE.Vector3(4, 0, 0)
            ))
        ],
        quads: [
            ...first.geometry.quads,
            ...other.geometry.quads.map(face => ({
                ...face,
                corners: face.corners.map(id =>
                    id + first.geometry.vertices.length
                )
            }))
        ],
        triangles: first.geometry.triangles
    };
    const combination = geometryResult(shifted);
    const source = {...combination, patches: {
        top: first.patches.top.map(patch => ({
            ...patch, owner: combination.id
        })),
        bottom: first.patches.bottom.map(patch => ({
            ...patch, owner: combination.id
        }))
    }};
    assert.throws(
        () => cutThrough(source, through(source)),
        error => error.reason === "unsupported-topology"
    );
});
