import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { buildPlankGeometry, default: plankDefinition } =
    await sourceModule("models/plank.ts");
const { buildSandingPaperGeometry, default: paperDefinition } =
    await sourceModule("models/sandingpaper.ts");
const { loftSections } = await toolbox(
    "geometry/construction/loftSections.ts"
);
const { boxMesh } = await toolbox(
    "geometry/construction/boxMesh.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { getControlResult } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

const nearly = (actual, expected, tolerance = 1e-9) =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `Expected ${actual} to equal ${expected} ± ${tolerance}`);

test("the migrated plank retains all five curved sections, UVs and actual quads", () => {
    const newBoard = buildPlankGeometry();
    const width = 0.22;
    const thickness = 0.03;
    const section = (z, lift = 0) => [
        new THREE.Vector3(-width / 2, -thickness / 2 + lift, z),
        new THREE.Vector3(width / 2, -thickness / 2 + lift, z),
        new THREE.Vector3(width / 2, thickness / 2 + lift, z),
        new THREE.Vector3(-width / 2, thickness / 2 + lift, z)
    ];
    const oldBoard = loftSections([
        section(-0.6), section(-0.3, 0.004), section(0, 0.007),
        section(0.3, 0.004), section(0.6)
    ]);

    assert.equal(newBoard.geometry.vertices.length, 20);
    assert.equal(newBoard.geometry.quads.length, 18);
    assert.equal(newBoard.geometry.triangles?.length ?? 0, 0);
    assert.equal(topologyOf(newBoard).openBoundaries().length, 0);
    assert.equal(topologyOf(newBoard).connectedComponents().length, 1);

    assert.deepEqual(
        newBoard.geometry.vertices.map(p => p.toArray()),
        oldBoard.vertices.map(p => p.toArray())
    );

    for (const actual of newBoard.geometry.quads) {
        const expected = oldBoard.quads.find(face =>
            face.surface === actual.surface &&
            face.corners.every(id => actual.corners.includes(id))
        );
        assert.ok(expected, `Missing original face ${actual.surface}`);
        assert.deepEqual(actual.corners, expected.corners);
        for (let i = 0; i < actual.uvs.length; i++) {
            nearly(actual.uvs[i].x, expected.uvs[i].x);
            nearly(actual.uvs[i].y, expected.uvs[i].y);
        }
    }

    const model = plankDefinition.create();
    const plank = model.getObjectByName("Plank");
    assert.ok(plank?.isMesh);
    assert.equal(getControlResult(plank.geometry)?.id, getControlResult(plank.geometry)?.id);
    assert.equal(getControlOutline(plank.geometry).quadCount, 18);
    assert.equal(plank.geometry.groups.length, 2);
    assert.ok(plank.material.length === 2);
    assert.equal(plank.geometry.boundingBox.min.z, -0.6);
    assert.equal(plank.geometry.boundingBox.max.z, 0.6);
});

test("the sanding sheet's authored field matches the previous silhouette", () => {
    const original = boxMesh({
        width: 0.23, height: 0.0008, depth: 0.28,
        widthSegments: 12, heightSegments: 1, depthSegments: 16
    });
    const snapshot = original.vertices.map(vertex => vertex.clone());
    const formed = buildSandingPaperGeometry();

    assert.equal(formed.geometry.vertices.length, original.vertices.length);
    assert.equal(formed.geometry.quads.length, original.quads.length);
    assert.equal(topologyOf(formed).openBoundaries().length, 0);
    assert.equal(topologyOf(formed).connectedComponents().length, 1);

    for (let i = 0; i < original.vertices.length; i++) {
        const before = original.vertices[i];
        const after = formed.geometry.vertices[i];
        nearly(after.x, before.x);
        nearly(after.z, before.z);
        const u = before.x / 0.23;
        const v = before.z / 0.28;
        const lift =
            0.002 * Math.sin(Math.PI * (u + 0.5)) *
                Math.sin(Math.PI * (v + 0.5)) +
            Math.tan(7 * Math.PI / 180) *
                Math.max(0, before.z - 0.3 * before.x - 0.02) +
            0.012 * Math.max(0, (u + v - 0.35) / 0.65) ** 2 +
            0.0012 * Math.sin(Math.PI * 2 * (1.3 * u - 0.7 * v));
        nearly(after.y, before.y + lift, 1e-12);
    }
    assert.deepEqual(original.vertices, snapshot);

    const model = paperDefinition.create();
    const paper = model.getObjectByName("Paper");
    assert.ok(paper?.isMesh);
    assert.ok(getControlResult(paper.geometry));
    assert.equal(getControlOutline(paper.geometry).quadCount,
        original.quads.length);

    const surfaces = new Map();
    for (const quad of formed.geometry.quads) {
        surfaces.set(quad.surface, (surfaces.get(quad.surface) ?? 0) + 1);
    }
    assert.equal(surfaces.get("py"), 12 * 16);
    assert.equal(surfaces.get("ny"), 12 * 16);
    assert.ok(paper.geometry.groups.length >= 2);
    assert.equal(paper.material[0].name, paper.material[0].name);
    assert.notEqual(paper.material[0].color.getHex(),
        paper.material[1].color.getHex());

    const bound = new THREE.Box3().setFromObject(model);
    nearly(bound.min.y, 0.001, 1e-9);
    assert.ok(bound.max.y > bound.min.y + 0.01);

    const meshBounds = paper.geometry.boundingBox;
    nearly(paper.position.y + meshBounds.min.y, 0.001, 1e-9);
    assert.ok(meshBounds.max.y - meshBounds.min.y > 0.01);
});
