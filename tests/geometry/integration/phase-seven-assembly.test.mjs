import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { extrudeContour } = await toolbox(
    "geometry/build/extrudeContour.ts"
);
const { sweepSection } = await toolbox(
    "geometry/build/sweepSection.ts"
);
const { revolveProfile } = await toolbox(
    "geometry/build/revolveProfile.ts"
);
const { raycastSurface } = await toolbox(
    "geometry/queries/raycastSurface.ts"
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
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

const point = (x, y) => new THREE.Vector2(x, y);

function circle(radius, centerX, centerY, count) {
    return Array.from({ length: count }, (_, index) => {
        const angle = index * Math.PI * 2 / count;
        return point(
            centerX + radius * Math.cos(angle),
            centerY + radius * Math.sin(angle)
        );
    });
}

function sconceGeometry() {
    const plate = extrudeContour({
        outer: {
            closed: true,
            points: [
                point(-0.06, -0.08), point(-0.07, 0.10),
                point(-0.04, 0.16), point(0.04, 0.16),
                point(0.07, 0.10), point(0.06, -0.08)
            ]
        },
        holes: [{
            closed: true,
            points: circle(0.009, 0, 0.125, 12)
        }]
    }, {
        frame: new THREE.Matrix4(),
        depth: 0.02,
        layers: [
            { position: 0, contourOffset: 0 },
            { position: 0.2, contourOffset: -0.001 },
            { position: 0.8, contourOffset: -0.001 },
            { position: 1, contourOffset: 0 }
        ]
    });

    const armAt = t => new THREE.Vector3(
        0,
        0.025 + 0.145 * t,
        0.01 + 0.28 * t - 0.022 * Math.sin(Math.PI * t)
    );
    const armTangent = t => new THREE.Vector3(
        0,
        0.145,
        0.28 - 0.022 * Math.PI * Math.cos(Math.PI * t)
    );
    const tangent = armTangent(0).normalize();
    const across = new THREE.Vector3(1, 0, 0);
    const upright = new THREE.Vector3()
        .crossVectors(tangent, across).normalize();
    const frame = new THREE.Matrix4()
        .makeBasis(across, upright, tangent)
        .setPosition(armAt(0));

    const arm = sweepSection({
        path: { at: armAt, tangent: armTangent },
        startingFrame: frame,
        stations: [0, 0.2, 0.4, 0.6, 0.8, 1],
        sectionAt: t => ({
            outer: {
                closed: true,
                points: circle(0.014 * (1 + 0.12 * t), 0, 0, 8)
            }
        }),
        wall: {
            outerRegion: "forged-arm",
            smoothingGroupAt: () => "rounded-iron"
        }
    });

    const cupCenter = armAt(1);
    const cup = revolveProfile({
        closed: false,
        points: [
            point(0, 0), point(0.052, 0),
            point(0.055, 0.008), point(0.055, 0.027),
            point(0.043, 0.035), point(0.039, 0.035),
            point(0.037, 0.026), point(0.037, 0.009),
            point(0, 0.009)
        ]
    }, {
        axisOrigin: cupCenter,
        axisDirection: new THREE.Vector3(0, 1, 0),
        radialDirection: new THREE.Vector3(1, 0, 0),
        angle: 2 * Math.PI,
        segments: 24,
        surfaceAt: ({ meridianInterval }) =>
            meridianInterval >= 3 && meridianInterval <= 5
                ? "rim" : "cup"
    });

    return { plate, arm, cup, armAt, cupCenter };
}

test("a pierced sconce assembles extrusion, transported sweep and revolution into a runtime asset", async () => {
    const assembly = sconceGeometry();
    const { plate, arm, cup, armAt, cupCenter } = assembly;

    for (const [name, part] of [
        ["Plate", plate], ["CurvedArm", arm], ["Cup", cup]
    ]) {
        const topology = topologyOf(part);
        assert.equal(topology.openBoundaries().length, 0,
            name + " has an open edge");
        assert.equal(topology.connectedComponents().length, 1,
            name + " is disconnected");
        assert.ok(part.geometry.quads.length > 0);
        assert.ok([...part.geometry.quads,
            ...(part.geometry.triangles ?? [])].every(face =>
            face.uvs.length === face.corners.length &&
            face.uvs.every(uv => Number.isFinite(uv.x) &&
                Number.isFinite(uv.y))
        ), name + " has missing UVs");
    }

    assert.equal(plate.regions["inner-0"].length, 12 * 3);
    assert.ok(arm.regions["forged-arm"].length > 0);
    assert.ok(cup.regions.rim.length > 0);
    assert.ok(cup.regions.cup.length > 0);

    const front = raycastSurface({
        geometry: plate.geometry,
        localToWorld: new THREE.Matrix4()
    }, {
        origin: new THREE.Vector3(0, 0.025, 0.06),
        direction: new THREE.Vector3(0, 0, -1),
        maxDistance: 0.1
    });
    assert.ok(front);
    assert.equal(front.region, "cap-end");
    assert.ok(Math.abs(front.point.z - 0.02) < 1e-10);

    assert.ok(armAt(0).z > 0 && armAt(0).z < 0.02);
    assert.ok(armAt(0).y < 0.16 && armAt(0).y > -0.08);
    assert.ok(armAt(1).distanceTo(cupCenter) < 1e-12);

    const iron = new THREE.MeshStandardMaterial({
        name: "Forged Iron", color: 0x494744, roughness: 0.86
    });
    const cupMaterial = new THREE.MeshStandardMaterial({
        name: "Darkened Cup", color: 0x65615a, roughness: 0.72
    });
    const source = new THREE.Group();
    const rendered = [
        surfaceMesh({ name: "PiercedPlate", geometry: plate,
            materials: iron }),
        surfaceMesh({ name: "CurvedArm", geometry: arm,
            materials: iron }),
        surfaceMesh({ name: "CandleCup", geometry: cup,
            materials: cupMaterial })
    ];
    for (const [index, mesh] of rendered.entries()) {
        source.add(mesh);
        assert.equal(getControlOutline(mesh.geometry).quadCount,
            [plate, arm, cup][index].geometry.quads.length);
    }

    const previousReader = globalThis.FileReader;
    globalThis.FileReader = class {
        result = null;
        onloadend = null;
        async readAsArrayBuffer(blob) {
            this.result = await blob.arrayBuffer();
            this.onloadend?.();
        }
    };

    let runtime;
    try {
        runtime = prepareRuntimeModel(source);
        assert.equal(runtime.sourceMeshes, 3);
        const scene = new THREE.Scene();
        scene.add(runtime.root);
        const glb = await new GLTFExporter().parseAsync(scene, {
            binary: true
        });
        assert.ok(glb instanceof ArrayBuffer);

        const bytes = new DataView(glb);
        assert.equal(bytes.getUint32(0, true), 0x46546c67);
        const jsonLength = bytes.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(
            new Uint8Array(glb, 20, jsonLength)
        ).trim());

        const primitives = json.meshes.flatMap(mesh => mesh.primitives);
        assert.ok(primitives.length >= 2);
        assert.ok(primitives.every(item =>
            item.attributes.TEXCOORD_0 !== undefined &&
            item.material !== undefined
        ));
    } finally {
        runtime?.dispose();
        for (const mesh of rendered) mesh.geometry.dispose();
        iron.dispose();
        cupMaterial.dispose();
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
    }
});
