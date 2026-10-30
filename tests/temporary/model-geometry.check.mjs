import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { sourceModule, toolbox } from "../support/toolbox.mjs";

const { topologyOf } = await toolbox("geometry/kernel/topology.ts");
const { bulgedProfile } = await toolbox("shapes/profiles/bulged.ts");
const { buildTabletopGeometry } = await sourceModule("models/table.ts");
const { buildChairFrameGeometry, buildChairRearSeatGeometry,
    buildChairCrestGeometry } = await sourceModule("models/components/chairGeometry.ts");
const { buildDaggerGeometry } = await sourceModule("models/dagger.ts");
const { buildTankardGeometry, buildTankardServingCavity } =
    await sourceModule("models/beerMug.ts");
const { cooperedStaves } = await sourceModule("models/components/cooperedStaves.ts");
const { cooperedHead } = await sourceModule("models/components/cooperedHead.ts");
const { buildBarrelHoopGeometry } =
    await sourceModule("models/components/barrelHardware.ts");
const { buildSandingPaperGeometry } = await sourceModule("models/sandingpaper.ts");
const { buildPlankGeometry } = await sourceModule("models/plank.ts");
const { buildBenchTrestleGeometry } = await sourceModule("models/tavernBench.ts");

function check(label, result) {
    assert.ok(result.geometry.vertices.length > 0, label + ": no vertices");
    assert.ok(result.geometry.quads.length +
        (result.geometry.triangles?.length ?? 0) > 0, label + ": no faces");
    const open = topologyOf(result).openBoundaries();
    assert.equal(open.length, 0, label + ": open boundaries");
}

test("one-shot: migrate real model geometry, not just compile the imports", () => {
    check("plank", buildPlankGeometry());
    check("sandingpaper", buildSandingPaperGeometry());
    for (const [i, part] of buildTabletopGeometry().entries()) {
        check("tabletop/" + i, part);
    }
    for (const [name, part] of Object.entries(buildDaggerGeometry())) {
        check("dagger/" + name, part);
    }
    const chair = buildChairFrameGeometry();
    for (const [name, part] of chair.posts) check("chair/post/" + name, part.geometry);
    for (const part of chair.rails) check("chair/rail/" + part.name, part.timber.geometry);
    check("chair/rear", buildChairRearSeatGeometry());
    check("chair/crest", buildChairCrestGeometry());
    for (const [name, part] of buildBenchTrestleGeometry()) {
        check("bench/" + name, part.geometry);
    }

    const tankard = buildTankardGeometry();
    tankard.staves.forEach((part, i) => check("tankard/stave/" + i, part));
    check("tankard/floor", tankard.floor);
    tankard.bands.forEach((part, i) => check("tankard/band/" + i, part));
    check("tankard/handle", tankard.handle);
    const cavity = buildTankardServingCavity(tankard.staves);
    assert.ok(cavity.capacity > 0);

    const profile = bulgedProfile({
        height: 0.78, bottomDiameter: 0.52, topDiameter: 0.52,
        peakDiameter: 0.60, points: 9, curve: "quadratic"
    });
    cooperedStaves(profile, {
        count: 24, thickness: 0.024, edgeRoundover: 0.0022
    }).forEach((part, i) => check("barrel/stave/" + i, part));
    const radius = profile[0].x - 0.024 + 0.007;
    cooperedHead(radius, {
        planks: 5, thickness: 0.02, radialSegments: 36,
        widthWeights: [0.94, 1.08, 1.03, 0.92, 1.03]
    }).forEach((part, i) => check("barrel/head/" + i, part));
    const hardware = buildBarrelHoopGeometry(profile, 0.08, 0.028, 24, 0);
    check("barrel/hoop", hardware.band);
    check("barrel/lap", hardware.lap);
    console.info("Every migrated construction executed with real model dimensions");
});
