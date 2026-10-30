import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { buildTankardGeometry, buildTankardServingCavity } =
    await sourceModule("models/beerMug.ts");
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
        const geometry = band.geometry;

        assert.equal(topologyOf(band).openBoundaries().length, 0);
        assert.equal(topologyOf(band).connectedComponents().length, 1);
        assert.equal(geometry.vertices.length, 24 * 4);
        assert.equal(geometry.quads.length, 24 * 4);
        assert.equal(geometry.triangles?.length ?? 0, 0);

        assert.deepEqual(
            new Set(geometry.quads.map(face => face.surface)),
            new Set(["bottom", "outside", "top", "inside"])
        );
        nearly(Math.min(...geometry.vertices.map(p => p.y)),
            y - 0.0105 / 2);
        nearly(Math.max(...geometry.vertices.map(p => p.y)),
            y + 0.0105 / 2);

        for (let station = 0; station < 24; station++) {
            const inner = geometry.vertices[station * 4];
            const outer = geometry.vertices[station * 4 + 1];
            nearly(Math.hypot(outer.x, outer.z) -
                Math.hypot(inner.x, inner.z), 0.0021);
            assert.ok(Math.hypot(inner.x, inner.z) > 0.047);
        }

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
                geometry.quads.length);
            assert.ok(mesh.geometry.getAttribute("uv"));
            assert.ok(geometry.quads.every(face =>
                face.uvs.every(uv =>
                    Number.isFinite(uv.x) && Number.isFinite(uv.y)
                )
            ));
        } finally {
            mesh.geometry.dispose();
            iron.dispose();
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
