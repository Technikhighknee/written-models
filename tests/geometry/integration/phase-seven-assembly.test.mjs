import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { raycastSurface } = await toolbox(
    "geometry/queries/raycastSurface.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);
const { buildSconceGeometry } = await sourceModule(
    "models/candleSconce.ts"
);
const { models } = await sourceModule("models/index.ts");

test("a pierced sconce assembles extrusion, transported sweep and revolution into a runtime asset", async () => {
    const assembly = buildSconceGeometry();
    const { plate, armAndCup, armAt, cupCenter } = assembly;

    for (const [name, part] of [
        ["Plate", plate], ["JoinedArmAndCup", armAndCup]
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
    assert.ok(armAndCup.regions["forged-arm"].length > 0);
    assert.ok(armAndCup.regions["arm-base"].length > 0);
    assert.ok(armAndCup.regions.rim.length > 0);
    assert.ok(armAndCup.regions.cup.length > 0);
    assert.equal(armAndCup.geometry.vertices.length,
        9 * 24 + 12 * 24 + 1);
    assert.equal(armAndCup.geometry.quads.filter(face =>
        face.surface === "forged-arm"
    ).length, 8 * 24);
    assert.equal(armAndCup.boundaries["end-outer"], undefined);
    assert.equal(armAndCup.boundaries["open-0"], undefined);

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

    const registered = models.find(model => model.slug === "candle-sconce");
    assert.ok(registered, "The sconce must appear in the model browser");

    const source = registered.create();
    assert.equal(source.name, "ForgedIronCandleSconce");
    const rendered = source.children;
    assert.equal(rendered.length, 2);

    for (const [index, mesh] of rendered.entries()) {
        assert.ok(mesh instanceof THREE.Mesh);
        assert.equal(getControlOutline(mesh.geometry).quadCount,
            [plate, armAndCup][index].geometry.quads.length);
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
        assert.equal(runtime.sourceMeshes, 2);
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
        const materials = new Set();
        for (const mesh of rendered) {
            mesh.geometry.dispose();
            for (const material of Array.isArray(mesh.material)
                ? mesh.material : [mesh.material]) {
                materials.add(material);
            }
        }
        for (const material of materials) material.dispose();
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
    }
});
