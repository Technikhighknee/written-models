import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { extrudeContour } = await toolbox("geometry/build/extrudeContour.ts");
const { revolveProfile } = await toolbox("geometry/build/revolveProfile.ts");
const { raycastSurface } = await toolbox("geometry/queries/raycastSurface.ts");
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

const p = (x, y) => new THREE.Vector2(x, y);
const bore = Array.from({ length: 16 }, (_, i) => {
    const angle = 2 * Math.PI * i / 16;
    return p(0.016 * Math.cos(angle), 0.016 * Math.sin(angle));
});

test("a bored timber accepts a fitted headed peg through authored surfaces and GLB", async () => {
    const timber = extrudeContour({
        outer: {
            closed: true,
            points: [
                p(-0.1, -0.05), p(-0.1, 0.05),
                p(0.1, 0.05), p(0.1, -0.05)
            ]
        },
        holes: [{ closed: true, points: bore }]
    }, {
        frame: new THREE.Matrix4(),
        depth: 0.07,
        layers: [
            { position: 0, contourOffset: 0 },
            { position: 0.5, contourOffset: 0 },
            { position: 1, contourOffset: 0 }
        ]
    });

    const peg = revolveProfile({
        closed: false,
        points: [
            p(0, 0), p(0.013, 0),
            p(0.014, 0.05), p(0.014, 0.079),
            p(0.019, 0.079), p(0.019, 0.095),
            p(0, 0.095)
        ]
    }, {
        axisOrigin: new THREE.Vector3(0, 0, -0.009),
        axisDirection: new THREE.Vector3(0, 0, 1),
        radialDirection: new THREE.Vector3(1, 0, 0),
        angle: 2 * Math.PI,
        segments: 16,
        surfaceAt: ({ meridianInterval }) =>
            meridianInterval >= 3 ? "head" : "shank"
    });

    for (const piece of [timber, peg]) {
        assert.equal(topologyOf(piece).openBoundaries().length, 0);
        assert.equal(topologyOf(piece).connectedComponents().length, 1);
        assert.ok(piece.geometry.quads.length > 0);
        for (const face of [
            ...piece.geometry.quads, ...(piece.geometry.triangles ?? [])
        ]) {
            assert.equal(face.uvs.length, face.corners.length);
            assert.ok(face.uvs.every(uv =>
                Number.isFinite(uv.x) && Number.isFinite(uv.y)
            ));
        }
    }

    assert.equal(timber.regions["inner-0"].length, bore.length * 2);
    assert.ok(peg.regions.shank.length > 0);
    assert.ok(peg.regions.head.length > 0);

    const hit = raycastSurface({
        geometry: timber.geometry,
        localToWorld: new THREE.Matrix4()
    }, {
        origin: new THREE.Vector3(0, 0, -0.02),
        direction: new THREE.Vector3(0, 0, 1),
        maxDistance: 0.12
    });
    assert.equal(hit, null, "The bore must pass through the timber");

    const headUnderside = -0.009 + 0.079;
    assert.ok(Math.abs(headUnderside - 0.07) < 1e-12);
    assert.ok(0.014 < 0.016 * Math.cos(Math.PI / 16),
        "The shank must clear the bore's actual polygon edges");

    const wood = new THREE.MeshStandardMaterial({ color: 0x725139 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x4d4c48 });
    const group = new THREE.Group();
    const meshes = [
        surfaceMesh({
            name: "BoredTimber", geometry: timber, materials: wood
        }),
        surfaceMesh({
            name: "FittedPeg", geometry: peg, materials: iron
        })
    ];
    group.add(...meshes);

    let runtime;
    const previousReader = globalThis.FileReader;
    globalThis.FileReader = class {
        result = null;
        onloadend = null;

        async readAsArrayBuffer(blob) {
            this.result = await blob.arrayBuffer();
            this.onloadend?.();
        }
    };

    try {
        for (const [i, mesh] of meshes.entries()) {
            assert.equal(getControlOutline(mesh.geometry).quadCount,
                [timber, peg][i].geometry.quads.length);
        }
        runtime = prepareRuntimeModel(group);
        const glb = await new GLTFExporter().parseAsync(runtime.root, {
            binary: true
        });
        assert.ok(glb instanceof ArrayBuffer);
        const header = new DataView(glb);
        assert.equal(header.getUint32(0, true), 0x46546c67);
        const jsonLength = header.getUint32(12, true);
        const document = JSON.parse(new TextDecoder().decode(
            new Uint8Array(glb, 20, jsonLength)
        ));
        const primitives = document.meshes.flatMap(mesh => mesh.primitives);
        assert.ok(primitives.length >= 2);
        assert.ok(primitives.every(item =>
            item.attributes.TEXCOORD_0 !== undefined &&
            item.material !== undefined
        ));
    } finally {
        runtime?.dispose();
        for (const mesh of meshes) mesh.geometry.dispose();
        wood.dispose();
        iron.dispose();
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
    }
});
