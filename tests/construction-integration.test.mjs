import test, {after} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {createServer} from "vite";

// Vite resolves this project's ordinary extensionless TypeScript imports.
// This exercises the actual constructors instead of hand-copying algorithms
// into the tests or relying on Node's limited type-strip resolver.
const vite = await createServer({
    appType: "custom",
    server: {middlewareMode: true},
    logLevel: "silent"
});
after(async () => { await vite.close(); });
const moduleAt = path => vite.ssrLoadModule(`/src/toolbox/${path}`);

test("barrel planks share authored construction faces without collapsed polygons", async () => {
    const {radialStaves} = await moduleAt("geometry/construction/radialStaves.ts");
    const profile = [
        new THREE.Vector2(0.26, 0),
        new THREE.Vector2(0.30, 0.39),
        new THREE.Vector2(0.26, 0.78)
    ];
    const staves = radialStaves(profile, {
        count: 24, thickness: 0.024, edgeRoundover: 0.0022,
        innerWidthSamples: [0, 1]
    });
    assert.equal(staves.length, 24);
    for (const stave of staves) {
        assert.ok(stave.quads.length > 0);
        assert.ok((stave.triangles?.length ?? 0) > 0,
            "mismatched cross-section caps retain genuine triangles");
        assert.ok(stave.vertices.every(p =>
            [p.x, p.y, p.z].every(Number.isFinite)));
    }
});

test("curved jug wall accepts actual ray-fitted sweeping contacts", async () => {
    const {turnedVessel} = await moduleAt("geometry/construction/turnedVessel.ts");
    const {sweepSection} = await moduleAt("geometry/construction/sweepSection.ts");
    const {fitBoundaryToSurface} = await moduleAt(
        "geometry/construction/fitBoundaryToSurface.ts"
    );
    const {toBufferGeometry} = await moduleAt(
        "geometry/mesh/toBufferGeometry.ts"
    );
    const mugWall = turnedVessel({
        outline: [
            {y: 0, radius: 0.042},
            {y: 0.014, radius: 0.0445},
            {y: 0.072, radius: 0.054},
            {y: 0.106, radius: 0.0485},
            {y: 0.131, radius: 0.0365},
            {y: 0.171, radius: 0.038}
        ],
        wallThickness: 0.0045,
        floorThickness: 0.011,
        radialSegments: 40,
        samplesPerSpan: 5
    });
    assert.ok(mugWall.quads.length > 40);
    const bowl = new THREE.Mesh(toBufferGeometry(mugWall, {
        base: 0, outer: 0, rim: 0, inner: 0, floor: 0
    }), new THREE.MeshBasicMaterial());
    const section = new THREE.Shape();
    section.moveTo(-0.008, -0.004);
    section.lineTo(0.008, -0.004);
    section.lineTo(0.008, 0.004);
    section.lineTo(-0.008, 0.004);
    section.closePath();
    let handle = sweepSection({
        path: [
            new THREE.Vector3(0.0365, 0.1435, 0),
            new THREE.Vector3(0.057, 0.15, 0),
            new THREE.Vector3(0.0845, 0.133, 0),
            new THREE.Vector3(0.0945, 0.103, 0),
            new THREE.Vector3(0.0925, 0.077, 0),
            new THREE.Vector3(0.0775, 0.063, 0),
            new THREE.Vector3(0.052, 0.064, 0)
        ],
        section: section.getPoints(3),
        referenceAxis: new THREE.Vector3(0, 0, 1),
        segments: 28,
        endFlare: 0.28
    });
    for (const surface of ["cap-start", "cap-end"]) {
        handle = fitBoundaryToSurface({
            geometry: handle,
            boundarySurface: surface,
            target: bowl,
            direction: new THREE.Vector3(-1, 0, 0),
            rayOffset: 0.10,
            maxDistance: 0.20,
            embed: 0.0008,
            falloffRings: 2
        });
    }
    assert.ok(handle.quads.length > 100);
    assert.ok(handle.triangles.length > 0);
    assert.ok(handle.vertices.every(p =>
        [p.x, p.y, p.z].every(Number.isFinite)));
    bowl.geometry.dispose();
    bowl.material.dispose();
});

test("thin rotating shells preserve closed all-quad construction topology", async () => {
    const {revolveShell} = await moduleAt("shapes/operations/revolveShell.ts");
    const {getControlMesh} = await moduleAt("geometry/mesh/toBufferGeometry.ts");
    const geometry = revolveShell([
        new THREE.Vector2(0.052, 0),
        new THREE.Vector2(0.06, 0.2),
        new THREE.Vector2(0.052, 0.4)
    ], {
        thickness: 0.004, roundedRims: true,
        radialSegments: 24, rimSegments: 6
    });
    const control = getControlMesh(geometry);
    assert.ok(control);
    assert.ok(control.quads.length > 24);
    assert.equal(control.triangles?.length ?? 0, 0);
    for (const face of control.quads) {
        const [a, b, c] = face.corners.map(i => control.vertices[i]);
        const cross = new THREE.Vector3().subVectors(b, a).cross(
            new THREE.Vector3().subVectors(c, a)
        );
        assert.ok(cross.lengthSq() > 1e-20,
            "no closing quad may collapse at a duplicate meridian station");
    }
    assert.ok(geometry.getAttribute("position").count > 0);
    geometry.dispose();
});

test("panels retain fitted groove faces and non-empty control topology", async () => {
    const {groovedCircularPlankPanel} = await moduleAt(
        "geometry/construction/circularPlankPanel.ts"
    );
    const {getControlMesh} = await moduleAt("geometry/mesh/toBufferGeometry.ts");
    const pieces = groovedCircularPlankPanel(0.24, {
        planks: 5,
        thickness: 0.02,
        radialSegments: 36,
        shoulderWidth: 0.0042,
        recessDepth: 0.0024,
        grooveFloorWidth: 0.00095,
        detailedFace: "top",
        handFitted: {
            seed: 181,
            edgeWander: 0.0019,
            crown: 0.0011,
            edgeWear: 0.00065,
            maxDeviation: 0.0007
        }
    });
    assert.equal(pieces.length, 5);
    for (const piece of pieces) {
        const control = getControlMesh(piece);
        assert.ok(control && control.vertices.length > 0);
        assert.ok(control.quads.length + (control.triangles?.length ?? 0) > 0);
        assert.ok(control.vertices.every(p =>
            [p.x, p.y, p.z].every(Number.isFinite)));
        piece.dispose();
    }
});
