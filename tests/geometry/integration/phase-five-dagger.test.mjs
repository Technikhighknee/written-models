import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { daggerShapes, buildDaggerGeometry } = await sourceModule(
    "models/dagger.ts"
);
const { profileSpans } = await toolbox(
    "shapes/profiles/profileSpans.ts"
);
const { mirrorStations } = await toolbox(
    "shapes/profiles/mirrorStations.ts"
);
const { loftAxialProfile } = await toolbox(
    "geometry/construction/loftAxialProfile.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { getControlResult } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

function previousGeometry(spec) {
    const authored = profileSpans(spec.profile);
    const stations = spec.mirrorAround === undefined
        ? authored : mirrorStations(authored, spec.mirrorAround);
    const { profile, mirrorAround, ...shape } = spec;
    return loftAxialProfile({ ...shape, stations });
}

const sortedRegions = mesh => {
    const counts = new Map();
    for (const face of [...mesh.quads, ...(mesh.triangles ?? [])]) {
        counts.set(face.surface, (counts.get(face.surface) ?? 0) + 1);
    }
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
};

test("dagger blade, quillon and hilt preserve their authored geometry", () => {
    const migrated = buildDaggerGeometry();

    for (const name of ["blade", "quillon", "hilt"]) {
        const result = migrated[name];
        const source = result.geometry;
        const previous = previousGeometry(daggerShapes[name]);

        assert.equal(topologyOf(result).openBoundaries().length, 0,
            `${name} has an open boundary`);
        assert.equal(topologyOf(result).connectedComponents().length, 1);
        assert.equal(source.quads.length, previous.quads.length);
        assert.equal(source.triangles.length, previous.triangles.length);
        assert.deepEqual(sortedRegions(source), sortedRegions(previous));
        assert.deepEqual(
            source.vertices.map(point => point.toArray()),
            previous.vertices.map(point => point.toArray())
        );

        for (let i = 0; i < source.quads.length; i++) {
            const current = source.quads[i];
            const before = previous.quads[i];
            assert.equal(current.surface, before.surface);
            assert.equal(current.smoothingGroup, before.smoothingGroup);
            assert.deepEqual(current.corners, before.corners);
            assert.deepEqual(
                current.uvs.map(point => point.toArray()),
                before.uvs.map(point => point.toArray())
            );
        }

        assert.ok(source.triangles.some(face =>
            face.surface === "cap-start"
        ));
        assert.ok(source.triangles.some(face =>
            face.surface === "cap-end"
        ));
    }

    const blade = migrated.blade.geometry;
    assert.ok(blade.quads.some(face => face.surface === "blade"));
    assert.ok(blade.quads.some(face => face.surface === "edge"));
    assert.ok(blade.quads.some(face => face.surface === "ricasso"));
    assert.equal(blade.triangles.filter(face =>
        face.surface === "cap-start"
    ).length, 8);

    const quillon = migrated.quillon.geometry;
    assert.equal(quillon.triangles.filter(face =>
        face.surface.startsWith("cap-")
    ).length, 24);
    const xPositions = quillon.vertices.map(p => p.x);
    assert.ok(Math.abs(Math.min(...xPositions) + 0.0424) < 1e-10);
    assert.ok(Math.abs(Math.max(...xPositions) - 0.0424) < 1e-10);

    const hilt = migrated.hilt.geometry;
    const intervals = hilt.quads.map(face => face.surface);
    assert.ok(intervals.includes("iron"));
    assert.ok(intervals.includes("oak"));
    const oakStart = hilt.vertices.reduce((minimum, point) =>
        point.y > 0.0138 && point.y < minimum ? point.y : minimum,
        Infinity
    );
    assert.ok(Number.isFinite(oakStart));
});

test("dagger's material breaks, quads and capped geometry survive binary GLB", async () => {
    const migrated = buildDaggerGeometry();
    const steel = new THREE.MeshStandardMaterial({
        name: "Plain Forged Steel", color: 0x85868a
    });
    const edge = new THREE.MeshStandardMaterial({
        name: "Bright Edge", color: 0xb6b6b8
    });
    const iron = new THREE.MeshStandardMaterial({
        name: "Wrought Iron", color: 0x3e4145
    });
    const oak = new THREE.MeshStandardMaterial({
        name: "Oak Grip", color: 0x6a492f
    });
    const assembly = new THREE.Group();
    const parts = [
        surfaceMesh({
            name: "ForgedDoubleEdgedBlade",
            geometry: migrated.blade,
            materials: { blade: steel, edge, ricasso: steel },
            capMaterial: steel
        }),
        surfaceMesh({
            name: "ForgedQuillonWithIntegralSeat",
            geometry: migrated.quillon,
            materials: iron
        }),
        surfaceMesh({
            name: "ContinuousFittedOakAndIronHilt",
            geometry: migrated.hilt,
            materials: { iron, oak },
            capMaterial: iron
        })
    ];
    assembly.add(...parts);

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
        for (const [name, mesh] of [
            ["blade", parts[0]], ["quillon", parts[1]], ["hilt", parts[2]]
        ]) {
            assert.ok(getControlResult(mesh.geometry),
                `${name} lost its authored geometry result`);
            assert.equal(getControlOutline(mesh.geometry).quadCount,
                migrated[name].geometry.quads.length);
            assert.ok(mesh.geometry.groups.length > 0);
        }

        runtime = prepareRuntimeModel(assembly);
        assert.equal(runtime.sourceMeshes, 3);
        const bytes = await new GLTFExporter().parseAsync(
            runtime.root, { binary: true }
        );
        const header = new DataView(bytes);
        assert.equal(header.getUint32(0, true), 0x46546c67);
        const document = JSON.parse(new TextDecoder().decode(
            new Uint8Array(bytes, 20, header.getUint32(12, true))
        ));
        const primitives = document.meshes.flatMap(mesh => mesh.primitives);
        assert.ok(primitives.length >= 4);
        assert.ok(primitives.every(primitive =>
            primitive.attributes.POSITION !== undefined &&
            primitive.attributes.NORMAL !== undefined &&
            primitive.attributes.TEXCOORD_0 !== undefined
        ));
        assert.ok(document.materials.length >= 4);
    } finally {
        runtime?.dispose();
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
        parts.forEach(mesh => mesh.geometry.dispose());
        [steel, edge, iron, oak].forEach(material => material.dispose());
    }
});
