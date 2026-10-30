import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { revolveProfile, revolveMeridianMesh } = await toolbox(
    "geometry/build/revolveProfile.ts"
);
const { geometryResult } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
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

test("revolved meridian stations retain poles, radial waves and hollow walls", () => {
    const body = revolveMeridianMesh([
        { radius: 0, height: 0, surface: "base" },
        {
            radius: 1, height: 0, surface: "body",
            radialWave: { lobes: 6, depth: 0.08 }
        },
        { radius: 1, height: 1, surface: "top" },
        { radius: 0, height: 1 }
    ], options());

    assert.equal(body.vertices.length, 26);
    assert.equal(body.quads.length, 12);
    assert.equal(body.triangles.length, 24);
    assert.ok(body.vertices.some(vertex =>
        vertex.y === 0 && Math.hypot(vertex.x, vertex.z) < 0.99
    ));
    assert.equal(topologyOf(geometryResult(body)).openBoundaries().length, 0);

    const hollow = revolveMeridianMesh([
        { radius: 1.1, height: 0, surface: "shell" },
        { radius: 1.2, height: 1, surface: "shell" },
        { radius: 1.1, height: 1, surface: "shell" },
        { radius: 1.0, height: 0, surface: "shell" }
    ], { ...options(), closedMeridian: true });

    assert.equal(hollow.vertices.length, 48);
    assert.equal(hollow.quads.length, 48);
    assert.equal(hollow.triangles.length, 0);
    assert.equal(topologyOf(geometryResult(hollow)).openBoundaries().length, 0);
});

test("a hollow turned profile retains its floor, interior, lip and exterior", () => {
    const mesh = revolveMeridianMesh([
        { radius: 0, height: 0, surface: "base" },
        {
            radius: 0.5, height: 0, surface: "outer",
            radialWave: { lobes: 6, depth: 0.02 }
        },
        { radius: 0.55, height: 0.2, surface: "outer" },
        { radius: 0.52, height: 0.5, surface: "rim" },
        { radius: 0.495, height: 0.525, surface: "rim" },
        { radius: 0.47, height: 0.5, surface: "inner" },
        { radius: 0.5, height: 0.2, surface: "inner" },
        { radius: 0.45, height: 0.08, surface: "floor" },
        { radius: 0, height: 0.08 }
    ], options());

    const regions = new Set([
        ...mesh.quads,
        ...mesh.triangles
    ].map(face => face.surface));

    for (const region of ["base", "outer", "rim", "inner", "floor"]) {
        assert.ok(regions.has(region), `Missing region: ${region}`);
    }
    const result = geometryResult(mesh);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
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
