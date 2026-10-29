import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {reconstructPatchQuads} = await toolbox(
    "geometry/edit/reconstructPatchQuads.ts"
);
const {geometryResult, assertSelectionOwner} = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {triangulateAuthoredFaces} = await toolbox(
    "geometry/kernel/triangulation.ts"
);
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {toBufferGeometry, getControlMesh} = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);
const {booleanSolids} = await toolbox("geometry/edit/booleanSolids.ts");

const uv = (x, y) => new THREE.Vector2(x, y);

function triangulatedBox() {
    const original = boxMesh({width: 2, height: 2, depth: 2});
    const triangles = triangulateAuthoredFaces(original).map(triangle => {
        const face = triangle.face.kind === "quad"
            ? original.quads[triangle.face.index]
            : original.triangles[triangle.face.index];
        return {
            surface: face.surface,
            ...(face.smoothingGroup === undefined ? {} :
                {smoothingGroup: face.smoothingGroup}),
            corners: [...triangle.vertices],
            uvs: triangle.faceCorners.map(i => face.uvs[i].clone())
        };
    });
    const source = geometryResult({
        vertices: original.vertices, quads: [], triangles
    });
    const chart = {
        at: point => new THREE.Vector3(point.x, 1, -point.y),
        parameterOf: point => uv(point.x, -point.z),
        normalAt: () => new THREE.Vector3(0, 1, 0)
    };
    const patch = {
        owner: source.id,
        faces: source.regions.py,
        chart
    };
    return {
        ...source,
        boundaries: {
            topOutline: topologyOf(source).regionBoundaries("py")
        },
        patches: {top: [patch]}
    };
}

function panel(width = 2, height = 2) {
    const vertices = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(width, 0, 0),
        new THREE.Vector3(width, height, 0),
        new THREE.Vector3(0, height, 0)
    ];
    const triangles = [
        {corners: [0, 1, 2], uvs: [uv(0, 0), uv(width, 0),
            uv(width, height)], surface: "panel"},
        {corners: [0, 2, 3], uvs: [uv(0, 0), uv(width, height),
            uv(0, height)], surface: "panel"}
    ];
    const source = geometryResult({vertices, quads: [], triangles});
    const patch = {
        owner: source.id,
        faces: source.regions.panel,
        chart: {
            at: p => new THREE.Vector3(p.x, p.y, 0),
            parameterOf: p => uv(p.x, p.y),
            normalAt: () => new THREE.Vector3(0, 0, 1)
        }
    };
    return {
        ...source,
        boundaries: {
            rim: topologyOf(source).openBoundaries(),
            oldDiagonal: [{
                owner: source.id, vertices: [0, 2], closed: false
            }]
        },
        patches: {panel: [patch]}
    };
}

const orientedTriangles = result => triangulateAuthoredFaces(
    result.geometry
).map(ref => {
    const face = ref.face.kind === "quad"
        ? result.geometry.quads[ref.face.index]
        : result.geometry.triangles[ref.face.index];
    return {
        corners: [...ref.vertices].sort((a, b) => a - b),
        surface: face.surface,
        uvs: ref.vertices.map(id => {
            const i = face.corners.indexOf(id);
            return [id, Number(face.uvs[i].x.toFixed(7)),
                Number(face.uvs[i].y.toFixed(7))];
        }).sort((a, b) => a[0] - b[0])
    };
}).sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
);

test("two coplanar triangles recover one real control quad with exactly the old triangles", () => {
    const source = panel();
    const originalTriangles = orientedTriangles(source);
    const snapshot = source.geometry.vertices.map(v => v.clone());
    const result = reconstructPatchQuads(
        source, source.patches.panel[0], {requireComplete: true}
    );

    assert.deepEqual(source.geometry.vertices, snapshot);
    assert.notEqual(result.id, source.id);
    assert.equal(result.geometry.quads.length, 1);
    assert.equal(result.geometry.triangles.length, 0);
    assert.deepEqual(orientedTriangles(result), originalTriangles);
    assert.equal(topologyOf(result).openBoundaries().length, 1);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.boundaries.rim.length, 1);
    assertSelectionOwner(result, result.boundaries.rim[0]);
    assert.equal(result.boundaries.oldDiagonal, undefined);
    assert.equal(result.patches.panel.length, 1);
    assertSelectionOwner(result, result.patches.panel[0]);
    assert.equal(result.patches["quad-reconstructed"].length, 1);
    assertSelectionOwner(result, result.patches["quad-reconstructed"][0]);

    const rendered = toBufferGeometry(result, {panel: 0});
    try {
        assert.equal(getControlMesh(rendered), result.geometry);
        assert.equal(rendered.index.count, 6);
    } finally {
        rendered.dispose();
    }
});

test("selected box region becomes a quad but neighboring source triangles remain untouched", () => {
    const source = triangulatedBox();
    const oldTriangles = source.geometry.triangles.length;
    const output = reconstructPatchQuads(source, "py", {
        requireComplete: true
    });
    assert.equal(output.geometry.quads.length, 1);
    assert.equal(output.geometry.triangles.length, oldTriangles - 2);
    assert.equal(topologyOf(output).openBoundaries().length, 0);
    assert.equal(topologyOf(output).connectedComponents().length, 1);
    assert.ok(output.geometry.triangles.every(face =>
        face.surface !== "py"
    ));
    assert.equal(output.boundaries.topOutline.length, 1);
    assertSelectionOwner(output, output.boundaries.topOutline[0]);
    assert.ok(output.patches.top?.length === 1);
    assertSelectionOwner(output, output.patches.top[0]);
});

test("all six box regions can recover their six authored quads", () => {
    let result = triangulatedBox();
    for (const region of Object.keys(result.regions)) {
        result = reconstructPatchQuads(result, region, {
            requireComplete: true
        });
    }
    assert.equal(result.geometry.quads.length, 6);
    assert.equal(result.geometry.triangles.length, 0);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
});

test("UV seams and region/smoothing seams are never combined", () => {
    const original = panel();
    const uvSplit = geometryResult({
        vertices: original.geometry.vertices,
        quads: [],
        triangles: original.geometry.triangles.map((face, i) => ({
            ...face,
            uvs: face.uvs.map(v => v.clone().add(
                i === 1 ? uv(10, 0) : uv(0, 0)
            ))
        }))
    });
    assert.throws(
        () => reconstructPatchQuads(uvSplit, "panel"),
        error => error.reason === "unsupported-topology"
    );
    const differentRegion = geometryResult({
        vertices: original.geometry.vertices,
        quads: [],
        triangles: original.geometry.triangles.map((face, i) => ({
            ...face, surface: i === 0 ? "left" : "right"
        }))
    });
    assert.throws(
        () => reconstructPatchQuads(differentRegion, "left"),
        error => error.reason === "unsupported-topology"
    );
    const differentSmoothing = geometryResult({
        vertices: original.geometry.vertices, quads: [],
        triangles: original.geometry.triangles.map((face, i) => ({
            ...face, smoothingGroup: i === 0 ? "hard" : "soft"
        }))
    });
    assert.throws(
        () => reconstructPatchQuads(differentSmoothing, "panel"),
        error => error.reason === "unsupported-topology"
    );
});

test("nonplanar folds cannot masquerade as a quad", () => {
    const original = panel();
    const vertices = original.geometry.vertices.map((point, i) =>
        point.clone().add(new THREE.Vector3(0, 0, i === 3 ? 0.2 : 0))
    );
    const source = geometryResult({
        vertices, quads: [], triangles: original.geometry.triangles
    });
    assert.throws(
        () => reconstructPatchQuads(source, "panel"),
        error => error.reason === "unsupported-topology"
    );
});

test("a three-triangle region can reconstruct one quad and retain the third real triangle", () => {
    const p = panel();
    const mesh = {
        vertices: [...p.geometry.vertices,
            new THREE.Vector3(4, 0, 0)],
        quads: [],
        triangles: [...p.geometry.triangles, {
            corners: [1, 4, 2],
            uvs: [uv(2, 0), uv(4, 0), uv(2, 2)],
            surface: "panel"
        }]
    };
    const source = geometryResult(mesh);
    const output = reconstructPatchQuads(source, "panel");
    assert.equal(output.geometry.quads.length, 1);
    assert.equal(output.geometry.triangles.length, 1);
    assert.equal(topologyOf(output).openBoundaries().length, 1);
    assert.throws(
        () => reconstructPatchQuads(source, "panel", {
            requireComplete: true
        }),
        error => error.reason === "unsupported-topology"
    );
});

test("stale selected chart and missing region fail explicitly", () => {
    const source = panel();
    assert.throws(
        () => reconstructPatchQuads(source, {
            ...source.patches.panel[0], owner: Symbol()
        }),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => reconstructPatchQuads(source, "missing"),
        error => error.reason === "invalid-input"
    );
});

test("actual Boolean triangles can be reconstructed only on an explicitly selected region", async () => {
    const base = boxMesh({width: 2, height: 2, depth: 2});
    const another = boxMesh({width: 1.2, height: 1.2, depth: 1.2});
    const shifted = {
        ...another, vertices: another.vertices.map(v =>
            v.clone().add(new THREE.Vector3(0.25, 0.1, 0.2))
        )
    };
    const boolean = await booleanSolids(base, shifted, "difference");
    const region = "first:py";
    assert.ok(boolean.regions[region]?.length >= 2);
    const output = reconstructPatchQuads(boolean, region);
    assert.ok(output.geometry.quads.length >= 1);
    assert.ok(output.geometry.triangles.length <
        boolean.geometry.triangles.length);
    assert.equal(topologyOf(output).openBoundaries().length, 0);
    assert.equal(topologyOf(output).connectedComponents().length,
        topologyOf(boolean).connectedComponents().length);
});

test("a four-cell triangulated grid recovers a consistent four-quad control layout", () => {
    const vertices = [];
    const triangles = [];
    for (let y = 0; y <= 2; y++) {
        for (let x = 0; x <= 2; x++) {
            vertices.push(new THREE.Vector3(x, y, 0));
        }
    }
    const coord = id => [
        id % 3, Math.floor(id / 3)
    ];
    const make = (ids, region) => ({
        corners: ids,
        uvs: ids.map(id => {
            const [x, y] = coord(id);
            return uv(x, y);
        }),
        surface: region,
        smoothingGroup: "front"
    });
    for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
            const a = y * 3 + x;
            const b = a + 1;
            const d = a + 3;
            const c = d + 1;
            triangles.push(make([a, b, c], "grid"),
                make([a, c, d], "grid"));
        }
    }
    const source = geometryResult({vertices, triangles, quads: []});
    const original = orientedTriangles(source);
    const outline = topologyOf(source).openBoundaries();
    assert.equal(outline.length, 1);
    const input = {
        ...source, boundaries: {outer: outline}
    };
    const result = reconstructPatchQuads(input, "grid", {
        requireComplete: true
    });

    assert.equal(result.geometry.quads.length, 4);
    assert.equal(result.geometry.triangles.length, 0);
    assert.deepEqual(orientedTriangles(result), original);
    assert.equal(result.boundaries.outer.length, 1);
    assert.deepEqual(result.boundaries.outer[0].vertices,
        outline[0].vertices);
    assert.equal(topologyOf(result).openBoundaries().length, 1);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.geometry.quads.every(face =>
        face.smoothingGroup === "front"
    ), true);
});

test("an ad-hoc chart selection returns a new usable selected patch", () => {
    const source = panel();
    const {patches, ...base} = source;
    const result = reconstructPatchQuads(base, patches.panel[0], {
        requireComplete: true
    });
    assert.equal(result.patches["quad-reconstructed"].length, 1);
    const patch = result.patches["quad-reconstructed"][0];
    assertSelectionOwner(result, patch);
    assert.deepEqual(patch.faces, [{kind: "quad", index: 0}]);
});
