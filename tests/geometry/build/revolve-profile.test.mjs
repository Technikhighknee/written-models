import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { revolveProfile } = await toolbox(
    "geometry/build/revolveProfile.ts"
);
const { latheMeridian } = await toolbox(
    "geometry/construction/latheMeridian.ts"
);
const { turnedVessel } = await toolbox(
    "geometry/construction/turnedVessel.ts"
);
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { revolveShell } = await toolbox(
    "shapes/operations/revolveShell.ts"
);
const { getControlMesh } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

const vector = (x, y) => new THREE.Vector2(x, y);

function options(overrides = {}) {
    return {
        axisOrigin: new THREE.Vector3(0, 0, 0),
        axisDirection: new THREE.Vector3(0, 1, 0),
        radialDirection: new THREE.Vector3(0, 0, 1),
        angle: Math.PI * 2,
        segments: 12,
        ...overrides
    };
}

const solid = {
    closed: false,
    points: [vector(0, 0), vector(1, 0), vector(1, 2), vector(0, 2)]
};

const shell = {
    closed: true,
    points: [
        vector(1, 0), vector(1, 2), vector(0.8, 2), vector(0.8, 0)
    ]
};

test("complete revolution has real poles, quads and continuous face regions", () => {
    const result = revolveProfile(solid, options({
        surfaceAt: ({ meridianInterval }) =>
            meridianInterval === 0 ? "base" :
                meridianInterval === 2 ? "top" : "side",
        smoothingGroupAt: ({ meridianInterval }) =>
            `smooth-${meridianInterval}`
    }));

    assert.equal(result.geometry.vertices.length, 26);
    assert.equal(result.geometry.quads.length, 12);
    assert.equal(result.geometry.triangles.length, 24);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.base.length, 12);
    assert.equal(result.regions.side.length, 12);
    assert.equal(result.regions.top.length, 12);

    const material = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "RevolvedCylinder",
        geometry: result,
        materials: material
    });

    try {
        assert.equal(getControlOutline(mesh.geometry).quadCount, 12);
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }
});

test("closed meridian forms a real wall thickness without fake axis poles", () => {
    const result = revolveProfile(shell, options());

    assert.equal(result.geometry.vertices.length, 4 * 12);
    assert.equal(result.geometry.quads.length, 4 * 12);
    assert.equal(result.geometry.triangles.length, 0);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
});

test("partial solid revolution exposes real angular caps with shared vertices", () => {
    const result = revolveProfile(solid, options({
        angle: Math.PI,
        segments: 6,
        caps: true,
        capRegionAt: end => `end-${end}`
    }));

    assert.equal(result.geometry.vertices.length, 16);
    assert.equal(result.geometry.quads.length, 6);
    assert.equal(result.geometry.triangles.length, 16);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(result.regions["end-angular-start"].length, 2);
    assert.equal(result.regions["end-angular-end"].length, 2);
});

test("partial shell closes its angular cross-sections into a solid", () => {
    const result = revolveProfile(shell, options({
        angle: Math.PI * 1.3,
        segments: 10,
        caps: true
    }));

    assert.equal(result.geometry.quads.length, 40);
    assert.equal(result.geometry.triangles.length, 4);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
});

test("uncapped partial shell and solid keep their explicit open loops", () => {
    for (const meridian of [solid, shell]) {
        const result = revolveProfile(meridian, options({
            angle: Math.PI,
            segments: 6
        }));

        assert.ok(topologyOf(result).openBoundaries().length > 0);
        assert.ok(Object.keys(result.boundaries).length > 0);
    }
});

test("a positive-radius meridian keeps two open rims without caps", () => {
    const openMeridian = {
        closed: false,
        points: [
            vector(0.9, 0),
            vector(1.1, 0.5),
            vector(0.9, 1)
        ]
    };
    const result = revolveProfile(openMeridian, options());

    assert.equal(result.geometry.vertices.length, 3 * 12);
    assert.equal(result.geometry.quads.length, 2 * 12);
    assert.equal(topologyOf(result).openBoundaries().length, 2);
});

test("meridian end caps close a positive-radius profile without fake rim vertices", () => {
    const meridian = {
        closed: false,
        points: [
            vector(0.9, 0),
            vector(1.1, 0.5),
            vector(0.9, 1)
        ]
    };

    for (const angle of [Math.PI * 2, Math.PI]) {
        const result = revolveProfile(meridian, options({
            angle,
            caps: true,
            capRegionAt: end => `surface-${end}`,
            surfaceAt: ({ meridianInterval }) =>
                meridianInterval === 0 ? "lower-wall" : "upper-wall",
            smoothingGroupAt: ({ meridianInterval }) => {
                assert.ok(meridianInterval === 0 || meridianInterval === 1);
                return "continuous-wall";
            }
        }));

        assert.equal(topologyOf(result).openBoundaries().length, 0);
        assert.equal(result.regions["surface-meridian-start"].length, 12);
        assert.equal(result.regions["surface-meridian-end"].length, 12);
        assert.ok(result.regions["lower-wall"].length > 0);
        assert.ok(result.regions["upper-wall"].length > 0);
    }
});

test("arbitrary axis and radial zero direction preserve geometry scale", () => {
    const result = revolveProfile(solid, options({
        axisOrigin: new THREE.Vector3(4, 0, -2),
        axisDirection: new THREE.Vector3(0, 0, 1),
        radialDirection: new THREE.Vector3(1, 0, 0)
    }));

    const firstRingPoint = result.geometry.vertices[1];
    assert.ok(firstRingPoint.distanceTo(new THREE.Vector3(5, 0, -2)) < 1e-10);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
});

test("old lathe and shell continue using real geometry with radial waves", () => {
    const mesh = latheMeridian([
        { radius: 0, y: 0, surface: "bottom" },
        {
            radius: 1, y: 0, surface: "body",
            radialWave: { lobes: 6, depth: 0.08 }
        },
        { radius: 1, y: 1, surface: "top" },
        { radius: 0, y: 1 }
    ], 12);

    assert.equal(mesh.vertices.length, 26);
    assert.equal(mesh.quads.length, 12);
    assert.equal(mesh.triangles.length, 24);
    assert.ok(mesh.vertices.some(vertex => vertex.length() < 0.99));

    const geometry = revolveShell([
        vector(1.1, 0),
        vector(1.2, 1)
    ], { thickness: 0.1, radialSegments: 12 });

    try {
        const authored = getControlMesh(geometry);
        assert.ok(authored);
        assert.ok(authored.quads.length > 0);
    } finally {
        geometry.dispose();
    }
});

test("turned vessel retains floor, inner wall, rim and outer regions", () => {
    const mesh = turnedVessel({
        outline: [
            { y: 0, radius: 0.5 },
            { y: 0.2, radius: 0.55 },
            { y: 0.5, radius: 0.52 }
        ],
        wallThickness: 0.05,
        floorThickness: 0.08,
        radialSegments: 12,
        samplesPerSpan: 2,
        rolledRim: true,
        footImpressions: { count: 6, depth: 0.02, height: 0.06 }
    });

    const regions = new Set([
        ...mesh.quads,
        ...(mesh.triangles ?? [])
    ].map(face => face.surface));

    for (const region of ["base", "outer", "rim", "inner", "floor"]) {
        assert.ok(regions.has(region), `Missing region: ${region}`);
    }

    assert.ok(mesh.vertices.some(vertex =>
        Math.abs(vertex.y) < 1e-8 && Math.hypot(vertex.x, vertex.z) < 0.5
    ));
});

test("invalid axis, meridian and collapsed radial modulation are rejected", () => {
    assert.throws(
        () => revolveProfile(solid, options({
            radialDirection: new THREE.Vector3(0, 1, 0)
        })),
        error => error.reason === "invalid-input"
    );

    assert.throws(
        () => revolveProfile({
            closed: false,
            points: [vector(0.3, 0), vector(0, 0.5), vector(0.5, 1)]
        }, options()),
        error => error.reason === "unsupported-topology"
    );
});
