import test, {after} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {createServer} from "vite";

// Load real toolbox TypeScript through Vite, as the project does.
const vite = await createServer({
    appType: "custom",
    server: {middlewareMode: true},
    logLevel: "silent"
});
after(async () => { await vite.close(); });
const moduleAt = path => vite.ssrLoadModule(`/src/toolbox/${path}`);

// Test durable geometry contracts, not the current contents or dimensions of
// individual models. Their silhouettes and construction may change freely.
test("surface fitting follows a curved target without losing authored topology", async () => {
    const {sweepSection} = await moduleAt("geometry/construction/sweepSection.ts");
    const {fitBoundaryToSurface} = await moduleAt(
        "geometry/construction/fitBoundaryToSurface.ts"
    );
    const target = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.15, 16)
    );
    target.position.y = 0.075;
    let sweep = sweepSection({
        path: [
            new THREE.Vector3(0.053, 0.115, 0),
            new THREE.Vector3(0.085, 0.105, 0),
            new THREE.Vector3(0.085, 0.05, 0),
            new THREE.Vector3(0.053, 0.04, 0)
        ],
        section: [
            new THREE.Vector2(-0.006, -0.004),
            new THREE.Vector2(0.006, -0.004),
            new THREE.Vector2(0.006, 0.004),
            new THREE.Vector2(-0.006, 0.004)
        ],
        referenceAxis: new THREE.Vector3(0, 0, 1),
        segments: 10
    });
    const faces = sweep.quads.length;
    try {
        for (const surface of ["cap-start", "cap-end"]) {
            sweep = fitBoundaryToSurface({
                geometry: sweep,
                boundarySurface: surface,
                target,
                direction: new THREE.Vector3(-1, 0, 0),
                rayOffset: 0.08,
                maxDistance: 0.18,
                embed: 0.0005
            });
        }
        assert.equal(sweep.quads.length, faces);
        for (const face of [...sweep.quads, ...(sweep.triangles ?? [])]) {
            if (face.surface !== "cap-start" && face.surface !== "cap-end") {
                continue;
            }
            for (const index of face.corners) {
                const vertex = sweep.vertices[index];
                assert.ok(
                    Math.abs(Math.hypot(vertex.x, vertex.z) - 0.0495) < 0.001,
                    "fitted boundaries should follow the real curved surface"
                );
            }
        }
    } finally {
        target.geometry.dispose();
    }
});

test("revolved shells preserve control faces without collapsed quads", async () => {
    const {revolveShell} = await moduleAt("shapes/operations/revolveShell.ts");
    const {getControlMesh} = await moduleAt("geometry/mesh/toBufferGeometry.ts");
    const geometry = revolveShell([
        new THREE.Vector2(0.052, 0),
        new THREE.Vector2(0.06, 0.2),
        new THREE.Vector2(0.052, 0.4)
    ], {thickness: 0.004, roundedRims: true, radialSegments: 24, rimSegments: 6});
    try {
        const control = getControlMesh(geometry);
        assert.ok(control);
        assert.ok(control.quads.length > 0);
        for (const face of control.quads) {
            const [a, b, c] = face.corners.map(i => control.vertices[i]);
            assert.ok(new THREE.Vector3().subVectors(b, a)
                .cross(new THREE.Vector3().subVectors(c, a))
                .lengthSq() > 1e-20, "control faces may not collapse");
        }
    } finally {
        geometry.dispose();
    }
});

test("neighboring worked boards agree on shared subdivision stations", async () => {
    const {boardPanel} = await moduleAt("geometry/construction/boardPanel.ts");
    const {getProfiledBoardStations} = await moduleAt(
        "geometry/construction/profiledBoard.ts"
    );
    const panel = boardPanel({
        length: 1.8, width: 0.9, thickness: 0.05,
        count: 4, widthWeights: [1.07, 0.94, 1.03, 0.96],
        gap: 0.0025, chamfer: 0.003, crown: 0.0006,
        handWorked: {
            seed: 1400, edgeWander: 0.0042, endStagger: 0.012,
            cornerWear: 0.007, thicknessVariation: 0.0014,
            chamferVariation: 0.33
        }
    });
    const stations = getProfiledBoardStations(panel[0]);
    assert.ok(stations.length > 1);
    for (const board of panel) {
        assert.deepEqual(getProfiledBoardStations(board), stations);
    }
});

test("radial strips share boundaries despite differing inner and outer detail", async () => {
    const {radialStripLayout, polygonalRadiusOutside} = await moduleAt(
        "geometry/construction/radialStripLayout.ts"
    );
    const strips = radialStripLayout({
        profile: [new THREE.Vector2(0.4, 0), new THREE.Vector2(0.5, 1)],
        count: 8,
        outerSamples: [0, 0.25, 0.5, 0.75, 1],
        innerSamples: [0, 1],
        outerRadius: radius => radius,
        innerRadius: radius => radius - 0.02
    });
    assert.equal(strips.length, 8);
    assert.notEqual(strips[0][0].outer.length, strips[0][0].inner.length);
    for (let i = 0; i < strips.length; i++) {
        const current = strips[i][0].outer.at(-1);
        const next = strips[(i + 1) % strips.length][0].outer[0];
        assert.ok(current.distanceTo(next) < 1e-12,
            "adjacent radial strips must have a shared seam");
    }
    assert.ok(polygonalRadiusOutside(0.4, Math.PI / 4, 0.001) *
        Math.cos(Math.PI / 8) > 0.4);
});
