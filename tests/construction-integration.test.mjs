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

// Adjacent worked pieces must agree on their longitudinal topology, even
// when their curvature differs and adaptive sampling picks separate loops.
test("worked panel shares adaptive stations across neighboring boards", async () => {
    const {boardPanel} = await moduleAt(
        "geometry/construction/boardPanel.ts"
    );
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
    assert.ok(stations.length >= 4);
    for (const board of panel) {
        assert.deepEqual(getProfiledBoardStations(board), stations);
        assert.equal(board.quads.length,
            (stations.length - 1) * 10 + 8);
    }
});

test("plain profile needs no unnecessary longitudinal support loops", async () => {
    const {profiledBoard, getProfiledBoardStations} = await moduleAt(
        "geometry/construction/profiledBoard.ts"
    );
    const board = profiledBoard({
        length: 1, thickness: 0.02, chamfer: 0,
        leftEdge: () => -0.1, rightEdge: () => 0.1
    });
    assert.deepEqual(getProfiledBoardStations(board), [0, 1]);
});

// A generic radial partition must also serve strips that are not barrels.
test("radial surface strips share angular boundaries and permit independent section density", async () => {
    const {radialStripLayout, polygonalRadiusOutside} = await moduleAt(
        "geometry/construction/radialStripLayout.ts"
    );
    const profile = [
        new THREE.Vector2(0.4, 0),
        new THREE.Vector2(0.5, 1)
    ];
    const strips = radialStripLayout({
        profile, count: 8, outerSamples: [0, 0.25, 0.5, 0.75, 1],
        innerSamples: [0, 1],
        outerRadius: radius => radius,
        innerRadius: radius => radius - 0.02
    });
    assert.equal(strips.length, 8);
    assert.equal(strips[0][0].outer.length, 5);
    assert.equal(strips[0][0].inner.length, 2);
    const last = strips[0][0].outer.at(-1);
    const next = strips[1][0].outer[0];
    assert.ok(last.distanceTo(next) < 1e-12,
        "radial neighbors must share the same angular boundary");
    const radius = polygonalRadiusOutside(0.4, Math.PI / 4, 0.001);
    assert.ok(radius * Math.cos(Math.PI / 8) > 0.4);
});

test("trestle is a higher-level component assembled from generic timbers", async () => {
    const {createTrestleSupport} = await vite.ssrLoadModule(
        "/src/models/components/trestleSupport.ts"
    );
    const calls = [];
    const component = createTrestleSupport({
        height: 0.7, footLength: 0.8, headLength: 0.72,
        postWidth: 0.145, postDepth: 0.135,
        crossWidth: 0.16, footHeight: 0.1, headHeight: 0.105,
        braceSize: 0.07
    }, (name, start, end, width, depth, contacts) => {
        calls.push({name, start, end, width, depth, contacts});
        return new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01));
    });
    assert.equal(component.children.length, 5);
    assert.equal(calls.filter(call => call.contacts !== undefined).length, 2);
    assert.deepEqual(
        calls.map(call => call.name),
        ["Foot", "Post", "TopBearer", "BraceBack", "BraceFront"]
    );
});

test("wooden tavern tankard has an open stave-built body and low triangle cost", async () => {
    const {buildTankardGeometry} = await vite.ssrLoadModule(
        "/src/models/beerMug.ts"
    );
    const {staves, floor, bands, handle} = buildTankardGeometry();
    const count = mesh => mesh.quads.length * 2 +
        (mesh.triangles?.length ?? 0);
    const triangles = staves.reduce((n, mesh) => n + count(mesh), 0) +
        count(floor) + count(handle) +
        bands.reduce((n, band) => n + (band.getIndex()?.count ?? 0) / 3, 0);
    assert.equal(staves.length, 12);
    assert.equal(bands.length, 2);
    assert.ok(triangles >= 700 && triangles < 1400,
        `expected an economical tankard, got ${triangles} triangles`);
    console.log(`Tankard triangle budget: ${triangles} tris`);
    assert.ok(staves.every(mesh =>
        mesh.quads.some(face => face.surface === "inner") &&
        mesh.vertices.every(v => [v.x, v.y, v.z].every(Number.isFinite))
    ));
    assert.ok(handle.quads.length > 0);
    assert.ok((handle.triangles?.length ?? 0) > 0);

    // Graspability must be measured on the actual handle mesh, not the
    // sketched spline: room for adult fingers along a real outer grip.
    const grip = handle.vertices.filter(v => v.x >= 0.082);
    assert.ok(grip.length > 0, "the handle must have an outer grasp");
    const graspHeight = Math.max(...grip.map(v => v.y)) -
        Math.min(...grip.map(v => v.y));
    assert.ok(graspHeight >= 0.073,
        `handle only provides ${(graspHeight * 100).toFixed(1)} cm of grasp span`);
    const midGrip = grip.filter(v => v.y >= 0.06 && v.y <= 0.10);
    assert.ok(midGrip.length > 0);
    const gripWidth = Math.max(...midGrip.map(v => v.z)) -
        Math.min(...midGrip.map(v => v.z));
    assert.ok(gripWidth >= 0.019 && gripWidth <= 0.022,
        "the hand-contact section should be about 20 mm wide");
    const insideGrip = handle.vertices.filter(v =>
        v.y >= 0.06 && v.y <= 0.10
    );
    assert.ok(insideGrip.length > 0);
    assert.ok(Math.min(...insideGrip.map(v => v.x)) - 0.0515 >= 0.030,
        "the grip must leave at least 30 mm finger clearance to the vessel");
    assert.ok(Math.max(...handle.vertices.map(v => v.x)) < 0.101,
        "the handle silhouette must remain compact relative to the vessel");

    // Compare actual construction vertices against the rendered hoop's
    // vertical bounds. This prevents a future handle/ring intersection
    // even when either part's proportions are changed.
    for (const band of bands) band.computeBoundingBox();
    const handleTop = Math.max(...handle.vertices.map(point => point.y));
    const handleBottom = Math.min(...handle.vertices.map(point => point.y));
    assert.ok(
        handleTop <= bands[1].boundingBox.min.y - 0.002,
        "the wooden grip must clear the lower edge of the upper iron band"
    );
    assert.ok(
        handleBottom >= bands[0].boundingBox.max.y + 0.002,
        "the wooden grip must clear the upper edge of the lower iron band"
    );
    for (const band of bands) band.dispose();
});
