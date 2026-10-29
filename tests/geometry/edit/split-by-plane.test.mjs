import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {splitByPlane} = await toolbox("geometry/edit/splitByPlane.ts");
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {extrudeContour} = await toolbox("geometry/build/extrudeContour.ts");
const {geometryResult} = await toolbox("geometry/kernel/GeometryResult.ts");
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {getControlOutline} = await toolbox("geometry/mesh/controlOutline.ts");
const {surfaceMesh} = await toolbox("geometry/mesh/surfaceMesh.ts");

const plane = (normal, point = [0, 0, 0]) => ({
    normal: new THREE.Vector3(...normal),
    point: new THREE.Vector3(...point)
});
const options = cap => ({cap, cutRegion: "fresh-cut"});
const p = (x, y) => new THREE.Vector2(x, y);

function closed(part) {
    assert.equal(topologyOf(part).openBoundaries().length, 0);
    assert.equal(topologyOf(part).connectedComponents().length, 1);
}

function areaOf(part) {
    return part.geometry.quads.length +
        (part.geometry.triangles?.length ?? 0);
}

test("a box split produces two closed halves with paired real cut loops", () => {
    const original = geometryResult(boxMesh({
        width: 2, height: 2, depth: 2
    }));
    const source = original.geometry.vertices.map(v => v.clone());
    const split = splitByPlane(original, plane([0, 1, 0]), options(true));

    assert.deepEqual(split.sideOfPart, ["negative", "positive"]);
    assert.equal(split.parts.length, 2);
    assert.equal(split.interfaces.length, 1);
    assert.deepEqual(original.geometry.vertices, source);

    for (const part of split.parts) {
        closed(part);
        assert.equal(part.regions["fresh-cut"].length, 1);
        assert.equal(part.geometry.quads.filter(f =>
            f.surface === "fresh-cut"
        ).length, 1);
        assert.ok(areaOf(part) >= 6);
        const material = new THREE.MeshStandardMaterial();
        const mesh = surfaceMesh({
            name: "SplitBox",
            geometry: part,
            materials: Object.fromEntries(
                Object.keys(part.regions).map(region => [region, material])
            )
        });
        assert.ok(getControlOutline(mesh.geometry).quadCount > 0);
        mesh.geometry.dispose();
        material.dispose();
    }

    const seam = split.interfaces[0];
    assert.equal(seam.firstPart, 0);
    assert.equal(seam.secondPart, 1);
    assert.equal(seam.first.owner, split.parts[0].id);
    assert.equal(seam.second.owner, split.parts[1].id);
    assert.equal(seam.first.closed, true);
    assert.equal(seam.second.closed, true);
    assert.equal(seam.source.points.length, 4);
    assert.equal(seam.source.parameters[0], 0);
    assert.ok(seam.source.parameters.every((v, i, all) =>
        i === 0 || v > all[i - 1]
    ));
    const a = seam.first.vertices.map(id =>
        split.parts[0].geometry.vertices[id]
    );
    const b = seam.second.vertices.map(id =>
        split.parts[1].geometry.vertices[id]
    );
    assert.equal(a.length, b.length);
    assert.ok(a.every(v => b.some(other => v.distanceTo(other) < 1e-12)));
    assert.ok(a.every(v => Math.abs(v.y) < 1e-12));
});

test("a holed extrusion retains an annular cap and cut interface loops", () => {
    const annulus = extrudeContour({
        outer: {
            closed: true,
            points: [p(-2, -2), p(-2, 2), p(2, 2), p(2, -2)]
        },
        holes: [{
            closed: true,
            points: [p(-0.75, -0.75), p(0.75, -0.75),
                p(0.75, 0.75), p(-0.75, 0.75)]
        }]
    }, {
        frame: new THREE.Matrix4(), depth: 2
    });
    closed(annulus);
    const split = splitByPlane(annulus,
        plane([0, 0, 1], [0, 0, 1]), options(true));

    assert.equal(split.parts.length, 2);
    assert.equal(split.interfaces.length, 2);
    assert.deepEqual(split.sideOfPart, ["negative", "positive"]);
    for (const part of split.parts) {
        closed(part);
        assert.ok(part.regions["fresh-cut"].length >= 4);
    }
});

test("separate solids produce separately labeled components and interfaces", () => {
    const cube = boxMesh({width: 1, height: 1, depth: 1});
    const combined = {
        vertices: [],
        quads: [],
        triangles: []
    };
    for (const y of [-3, 3]) {
        const shift = combined.vertices.length;
        combined.vertices.push(...cube.vertices.map(v =>
            v.clone().add(new THREE.Vector3(0, y, 0))
        ));
        combined.quads.push(...cube.quads.map(face => ({
            ...face,
            corners: face.corners.map(index => index + shift),
            uvs: face.uvs.map(uv => uv.clone())
        })));
    }
    const split = splitByPlane(geometryResult(combined),
        plane([1, 0, 0]), options(true));
    assert.equal(split.parts.length, 4);
    assert.equal(split.interfaces.length, 2);
    assert.deepEqual(split.sideOfPart, [
        "negative", "negative", "positive", "positive"
    ]);
    for (const part of split.parts) closed(part);
    for (const cut of split.interfaces) {
        assert.ok(cut.firstPart < 2);
        assert.ok(cut.secondPart >= 2);
    }
});

test("a tangent cut preserves one closed solid without a duplicate cap", () => {
    const source = geometryResult(boxMesh({
        width: 2, height: 2, depth: 2
    }));
    const result = splitByPlane(source,
        plane([1, 0, 0], [1, 0, 0]), options(true));

    assert.deepEqual(result.sideOfPart, ["negative"]);
    assert.equal(result.interfaces.length, 0);
    assert.equal(result.parts[0].geometry.quads.length, 6);
    assert.equal(result.parts[0].regions["fresh-cut"], undefined);
    closed(result.parts[0]);
});

test("uncapped cut has paired open rims; an open input cannot request caps", () => {
    const source = geometryResult(boxMesh({
        width: 2, height: 2, depth: 2
    }));
    const result = splitByPlane(source,
        plane([0, 0, 1]), options(false));
    assert.equal(result.parts.length, 2);
    assert.equal(result.interfaces.length, 1);
    for (const part of result.parts) {
        assert.equal(topologyOf(part).openBoundaries().length, 1);
    }

    const raw = boxMesh({width: 1, height: 1, depth: 1});
    raw.quads.pop();
    assert.throws(
        () => splitByPlane(raw, plane([0, 1, 0]), options(true)),
        error => error.reason === "unsupported-topology"
    );
});
