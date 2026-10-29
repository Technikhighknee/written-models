import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { buildTankardGeometry, buildTankardServingCavity } =
    await sourceModule("models/beerMug.ts");
const { radialStaves } = await toolbox(
    "geometry/construction/radialStaves.ts"
);
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

function equivalentMeshes(actual, previous) {
    assert.deepEqual(
        actual.vertices.map(point => point.toArray()),
        previous.vertices.map(point => point.toArray())
    );
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
            assert.deepEqual(
                now.uvs.map(point => point.toArray()),
                old.uvs.map(point => point.toArray())
            );
        }
    }
}

test("the migrated tankard retains all twelve stave sections and both forged hoops", () => {
    const parts = buildTankardGeometry();
    const previous = radialStaves(profile, {
        count: 12,
        thickness: 0.008,
        edgeRoundover: 0.0008,
        innerWidthSamples: [0, 1],
        angleOffset: offset
    });

    assert.equal(parts.staves.length, 12);
    assert.equal(parts.bands.length, 2);

    for (let index = 0; index < 12; index++) {
        const stave = parts.staves[index];
        equivalentMeshes(stave.geometry, previous[index]);
        assert.equal(topologyOf(stave).openBoundaries().length, 0);
        assert.ok(stave.geometry.triangles.length > 0);
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
    assert.equal(cavity.rings[0].outline.length, 12 * 2);
    assert.ok(cavity.capacity > 0);
    assert.ok(cavity.top < profile.at(-1).y);
});
