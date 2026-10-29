import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { cooperedStaves } = await sourceModule(
    "models/components/cooperedStaves.ts"
);
const { cooperedHead } = await sourceModule(
    "models/components/cooperedHead.ts"
);
const { radialStaves } = await toolbox(
    "geometry/construction/radialStaves.ts"
);
const { groovedCircularPlankPanel } = await toolbox(
    "geometry/construction/circularPlankPanel.ts"
);
const { buildBarrelHoopGeometry } = await sourceModule(
    "models/components/barrelHardware.ts"
);
const { bulgedProfile } = await toolbox(
    "shapes/profiles/bulged.ts"
);
const { positionsFromEnds } = await toolbox(
    "spatial/layout/positionsFromEnds.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { getControlMesh, getControlResult } = await toolbox(
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

const profile = bulgedProfile({
    height: 0.78,
    bottomDiameter: 0.52,
    topDiameter: 0.52,
    peakDiameter: 0.60,
    points: 9,
    curve: "quadratic"
});

const headOptions = side => ({
    planks: 5,
    thickness: 0.02,
    detailedFace: side,
    radialSegments: 36,
    widthWeights: [0.94, 1.08, 1.03, 0.92, 1.03],
    shoulderWidth: 0.0042,
    recessDepth: 0.0024,
    grooveFloorWidth: 0.00095,
    handFitted: {
        seed: side === "top" ? 181 : 293,
        edgeWander: 0.0019,
        crown: 0.0011,
        edgeWear: 0.00065,
        maxDeviation: 0.0007
    }
});

function sameAuthoredShape(actual, original) {
    assert.equal(actual.vertices.length, original.vertices.length);
    assert.equal(actual.quads.length, original.quads.length);
    assert.equal(actual.triangles?.length ?? 0,
        original.triangles?.length ?? 0);

    for (let i = 0; i < actual.vertices.length; i++) {
        assert.deepEqual(actual.vertices[i].toArray(),
            original.vertices[i].toArray());
    }

    for (const key of ["quads", "triangles"]) {
        for (let i = 0; i < (actual[key]?.length ?? 0); i++) {
            const face = actual[key][i];
            const before = original[key][i];
            assert.equal(face.surface, before.surface);
            assert.deepEqual(face.corners, before.corners);
            assert.deepEqual(face.uvs.map(uv => uv.toArray()),
                before.uvs.map(uv => uv.toArray()));
        }
    }
}

test("all 24 staves retain the actual low-density interior and bevel geometry", () => {
    const newStaves = cooperedStaves(profile, {
        count: 24,
        thickness: 0.024,
        edgeRoundover: 0.0022
    });
    const reference = radialStaves(profile, {
        count: 24,
        thickness: 0.024,
        innerWidthSamples: [0, 1],
        edgeRoundover: 0.0022
    });

    assert.equal(newStaves.length, 24);
    for (let i = 0; i < newStaves.length; i++) {
        const result = newStaves[i];
        assert.equal(topologyOf(result).openBoundaries().length, 0);
        assert.equal(topologyOf(result).connectedComponents().length, 1);
        sameAuthoredShape(result.geometry, reference[i]);

        assert.ok(result.geometry.quads.some(face =>
            face.surface === "outer"
        ));
        assert.ok(result.geometry.triangles.some(face =>
            face.surface.startsWith("cap-")
        ));
    }
});

test("both actual five-piece heads match the original trimmed, worn seams", () => {
    const radius = 0.26 - 0.024 + 0.007;

    for (const side of ["top", "bottom"]) {
        const options = headOptions(side);
        const before = groovedCircularPlankPanel(radius, options);

        try {
            const boards = cooperedHead(radius, options);
            assert.equal(boards.length, 5);

            for (let i = 0; i < boards.length; i++) {
                const head = boards[i];
                const original = getControlMesh(before[i]);
                assert.ok(original, "Old head is missing its control geometry");
                sameAuthoredShape(head.geometry, original);

                assert.equal(topologyOf(head).openBoundaries().length, 0);
                assert.equal(topologyOf(head).connectedComponents().length, 1);
                assert.ok(head.geometry.quads.length > 0);
                assert.ok(head.geometry.vertices.every(p =>
                    p.toArray().every(Number.isFinite)
                ));
                const surfaces = new Set([
                    ...head.geometry.quads,
                    ...(head.geometry.triangles ?? [])
                ].map(face => face.surface));
                assert.ok(surfaces.has("face"));
                assert.ok(surfaces.has("cut"));
                assert.ok(surfaces.has("recess"));
            }
        } finally {
            before.forEach(geometry => geometry.dispose());
        }
    }
});

test("barrel's four bands, four forged laps and eight rivets export with the wood", async () => {
    const wood = new THREE.MeshStandardMaterial({
        color: 0x876543, vertexColors: true
    });
    const grain = new THREE.MeshStandardMaterial({
        color: 0x63452d, vertexColors: true
    });
    const groove = new THREE.MeshStandardMaterial({
        color: 0x4a3829, vertexColors: true
    });
    const iron = new THREE.MeshStandardMaterial({
        color: 0x514d46, metalness: 0.65
    });
    const scene = new THREE.Group();
    const materials = [wood, grain, groove, iron];

    const add = (parent, name, data, faces, tint) => {
        const mesh = surfaceMesh({
            name, geometry: data, materials: faces,
            ...(tint === undefined ? {} : { tint })
        });
        parent.add(mesh);
        assert.ok(getControlResult(mesh.geometry) ||
            getControlMesh(mesh.geometry));
        assert.equal(getControlOutline(mesh.geometry).quadCount,
            (data.geometry ?? data).quads.length);
        return mesh;
    };

    const body = new THREE.Group();
    body.name = "Body";
    scene.add(body);
    cooperedStaves(profile, {
        count: 24, thickness: 0.024, edgeRoundover: 0.0022
    }).forEach((stave, index) => {
        add(body, `Stave${String(index + 1).padStart(2, "0")}`,
            stave, {
                outer: wood, inner: wood,
                "edge-left": wood, "edge-right": wood,
                "cap-start": grain, "cap-end": grain
            }, 0.97);
    });

    const radius = 0.243;
    for (const side of ["top", "bottom"]) {
        const head = new THREE.Group();
        head.name = side === "top" ? "TopHead" : "BottomHead";
        head.position.y = side === "top" ? 0.78 - 0.031 : 0.031;
        scene.add(head);

        cooperedHead(radius, headOptions(side)).forEach((board, index) => {
            add(head, `HeadBoard${index + 1}`, board, {
                face: wood, cut: grain, recess: groove
            }, 0.95);
        });
    }

    const ys = positionsFromEnds({
        start: 0, end: 0.78,
        fromStart: [0.08, 0.23], fromEnd: [0.08, 0.23]
    });

    for (let i = 0; i < ys.length; i++) {
        const y = ys[i];
        const width = i === 0 || i === 3 ? 0.028 : 0.022;
        const geometry = buildBarrelHoopGeometry(
            profile, y, width, 24, i
        );

        const hoop = new THREE.Group();
        hoop.name = `IronHoop${i + 1}`;
        scene.add(hoop);
        add(hoop, "ClosedForgedBand", geometry.band, iron);
        add(hoop, "OverlappingStrapJoint", geometry.lap, iron);

        for (const fastener of geometry.rivets) {
            const rivet = add(hoop, fastener.name,
                fastener.geometry, iron);
            rivet.position.copy(fastener.position);
            rivet.quaternion.copy(fastener.quaternion);

            const radius = Math.hypot(
                rivet.position.x, rivet.position.z
            );
            assert.ok(radius > profile[0].x);
            assert.ok(radius < profile[4].x + 0.02);
        }

        for (const part of [
            geometry.band, geometry.lap,
            ...geometry.rivets.map(rivet => rivet.geometry)
        ]) {
            assert.equal(topologyOf(part).openBoundaries().length, 0);
            assert.equal(topologyOf(part).connectedComponents().length, 1);
        }
    }

    assert.equal(body.children.length, 24);
    assert.equal(scene.getObjectByName("TopHead").children.length, 5);
    assert.equal(scene.getObjectByName("BottomHead").children.length, 5);
    assert.equal(ys.length, 4);

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
        runtime = prepareRuntimeModel(scene);
        assert.equal(runtime.sourceMeshes, 50);
        const bytes = await new GLTFExporter().parseAsync(runtime.root, {
            binary: true
        });
        const view = new DataView(bytes);
        assert.equal(view.getUint32(0, true), 0x46546c67);
        const doc = JSON.parse(new TextDecoder().decode(
            new Uint8Array(bytes, 20, view.getUint32(12, true))
        ));
        assert.ok(doc.meshes.length > 0);
        assert.ok(doc.materials.length >= 4);
        assert.ok(doc.meshes.flatMap(mesh => mesh.primitives).every(part =>
            part.attributes.POSITION !== undefined &&
            part.attributes.NORMAL !== undefined &&
            part.attributes.TEXCOORD_0 !== undefined
        ));
    } finally {
        runtime?.dispose();
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
        scene.traverse(item => {
            if (item.isMesh) item.geometry.dispose();
        });
        materials.forEach(material => material.dispose());
    }
});
