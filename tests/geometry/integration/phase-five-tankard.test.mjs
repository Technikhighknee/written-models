import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { buildTankardGeometry, buildTankardServingCavity } =
    await sourceModule("models/beerMug.ts");
const { bandAroundProfile } = await toolbox(
    "geometry/construction/bandAroundProfile.ts"
);
const { getControlMesh } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

const profile = [
    new THREE.Vector2(0.047, 0),
    new THREE.Vector2(0.0515, 0.071),
    new THREE.Vector2(0.049, 0.152)
];

const offset = Math.PI / 2 - Math.PI / 12;

function nearly(actual, expected, tolerance = 1e-12) {
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `Expected ${actual} to match ${expected} within ${tolerance}`);
}

function equivalentMeshes(actual, previous) {
    assert.equal(actual.vertices.length, previous.vertices.length);
    for (let i = 0; i < actual.vertices.length; i++) {
        const current = actual.vertices[i];
        const before = previous.vertices[i];
        nearly(current.x, before.x);
        nearly(current.y, before.y);
        nearly(current.z, before.z);
    }
    for (const type of ["quads", "triangles"]) {
        const faces = actual[type] ?? [];
        const original = previous[type] ?? [];
        assert.equal(faces.length, original.length);

        for (let index = 0; index < faces.length; index++) {
            const now = faces[index];
            const old = original[index];
            assert.equal(now.surface, old.surface);
            assert.equal(now.smoothingGroup, old.smoothingGroup);
            assert.deepEqual(now.corners, old.corners);
            for (let corner = 0; corner < now.uvs.length; corner++) {
                nearly(now.uvs[corner].x, old.uvs[corner].x);
                nearly(now.uvs[corner].y, old.uvs[corner].y);
            }
        }
    }
}

test("the migrated tankard retains all twelve stave sections and both forged hoops", () => {
    const parts = buildTankardGeometry();

    assert.equal(parts.staves.length, 12);
    assert.equal(parts.bands.length, 2);

    for (let index = 0; index < 12; index++) {
        const stave = parts.staves[index];
        const mesh = stave.geometry;
        const theta = offset + index * Math.PI * 2 / 12;

        assert.equal(mesh.vertices.length, profile.length * 7);
        assert.equal(mesh.quads.length, (profile.length - 1) * 7);
        assert.equal(mesh.triangles.length, 10);
        assert.equal(topologyOf(stave).openBoundaries().length, 0);
        assert.equal(topologyOf(stave).connectedComponents().length, 1);

        const outer = mesh.vertices[0];
        const inner = mesh.vertices[6];
        nearly(outer.x, (profile[0].x - 0.0008) * Math.sin(theta));
        nearly(outer.z, (profile[0].x - 0.0008) * Math.cos(theta));
        nearly(inner.x, (profile[0].x - 0.008) * Math.sin(theta));
        nearly(inner.z, (profile[0].x - 0.008) * Math.cos(theta));
        nearly(outer.y, profile[0].y);
        nearly(inner.y, profile[0].y);
        assert.ok(mesh.quads.some(face => face.surface === "outer"));
        assert.ok(mesh.quads.some(face => face.surface === "inner"));
    }

    for (const [index, y] of [0.01, 0.1405].entries()) {
        const band = parts.bands[index];
        const oldGeometry = bandAroundProfile(profile, {
            y,
            width: 0.0105,
            thickness: 0.0021,
            clearance: 0.00025,
            radialSegments: 24,
            angleOffset: offset
        });

        try {
            const previousBand = getControlMesh(oldGeometry);
            assert.ok(previousBand);
            equivalentMeshes(band.geometry, previousBand);
            assert.equal(topologyOf(band).openBoundaries().length, 0);

            const iron = new THREE.MeshStandardMaterial({
                name: "Plain Wrought Iron"
            });
            const mesh = surfaceMesh({
                name: index ? "UpperIronBand" : "LowerIronBand",
                geometry: band,
                materials: iron
            });

            try {
                assert.equal(getControlOutline(mesh.geometry).quadCount,
                    band.geometry.quads.length);
                assert.ok(mesh.geometry.getAttribute("uv"));
            } finally {
                mesh.geometry.dispose();
                iron.dispose();
            }
        } finally {
            oldGeometry.dispose();
        }
    }

    for (const part of [parts.floor, parts.handle]) {
        assert.equal(topologyOf(part).openBoundaries().length, 0);
        assert.equal(topologyOf(part).connectedComponents().length, 1);
    }

    const cavity = buildTankardServingCavity(parts.staves);
    assert.equal(cavity.rings[0].outline.length, 12);
    assert.ok(cavity.capacity > 0);
    assert.ok(cavity.top < profile.at(-1).y);
});
