import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { buildTabletopGeometry } = await sourceModule("models/table.ts");
const { tableTimberGeometry } = await sourceModule(
    "models/components/tableTimberGeometry.ts"
);
const { createTrestleSupport } = await sourceModule(
    "models/components/trestleSupport.ts"
);
const { boardPanel } = await toolbox(
    "geometry/construction/boardPanel.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { getControlOutline, getControlResult } = await Promise.all([
    toolbox("geometry/mesh/controlOutline.ts"),
    toolbox("geometry/mesh/toBufferGeometry.ts")
]).then(([outline, buffer]) => ({
    getControlOutline: outline.getControlOutline,
    getControlResult: buffer.getControlResult
}));
const { offsetMeshUvs } = await toolbox(
    "geometry/edit/geometryEdits.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

const almost = (actual, expected, tolerance = 1e-9) =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `Expected ${expected}, got ${actual}`);

function originalTableBoards() {
    return boardPanel({
        length: 1.8,
        width: 0.9,
        thickness: 0.05,
        count: 4,
        widthWeights: [1.07, 0.94, 1.03, 0.96],
        gap: 0.0025,
        chamfer: 0.003,
        crown: 0.0006,
        handWorked: {
            seed: 1400,
            edgeWander: 0.0042,
            endStagger: 0.012,
            cornerWear: 0.007,
            thicknessVariation: 0.0014,
            chamferVariation: 0.33
        }
    });
}

test("the actual four tabletop boards keep their worn seams and authored faces", () => {
    const old = originalTableBoards();
    const updated = buildTabletopGeometry();

    assert.equal(updated.length, 4);
    assert.equal(old.length, 4);

    for (let i = 0; i < updated.length; i++) {
        const result = updated[i];
        const before = old[i];
        const mesh = result.geometry;

        assert.equal(topologyOf(result).openBoundaries().length, 0);
        assert.equal(topologyOf(result).connectedComponents().length, 1);
        assert.equal(mesh.vertices.length, before.vertices.length);
        assert.equal(mesh.quads.length, before.quads.length);
        assert.equal(mesh.triangles?.length ?? 0,
            before.triangles?.length ?? 0);

        for (let j = 0; j < mesh.vertices.length; j++) {
            const point = mesh.vertices[j];
            const previous = before.vertices[j];
            almost(point.x, previous.x);
            almost(point.y, previous.y);
            almost(point.z, previous.z);
        }

        for (let j = 0; j < mesh.quads.length; j++) {
            const face = mesh.quads[j];
            const previous = before.quads[j];
            assert.equal(face.surface, previous.surface);
            assert.deepEqual(face.corners, previous.corners);
            for (let k = 0; k < face.uvs.length; k++) {
                almost(face.uvs[k].x, previous.uvs[k].x);
                almost(face.uvs[k].y, previous.uvs[k].y);
            }
        }

        const oak = new THREE.MeshStandardMaterial({
            color: 0x986f44, vertexColors: true
        });
        const endGrain = new THREE.MeshStandardMaterial({
            color: 0x745230, vertexColors: true
        });
        const colored = offsetMeshUvs(result, 0.015 + i * 0.032,
            0.09 + i * 0.07);
        const timber = surfaceMesh({
            name: `Plank${i + 1}`,
            geometry: colored,
            materials: {
                outer: oak, inner: oak,
                "edge-left": oak, "edge-right": oak,
                "cap-start": endGrain, "cap-end": endGrain
            },
            tint: new THREE.Color(0.97, 0.97, 0.97)
        });

        try {
            assert.ok(getControlResult(timber.geometry));
            assert.equal(getControlOutline(timber.geometry).quadCount,
                mesh.quads.length);
            assert.equal(timber.material.length, 2);
            assert.equal(timber.geometry.groups.length, 2);
            assert.ok(timber.geometry.getAttribute("color"));
            assert.ok(timber.geometry.getAttribute("uv"));
        } finally {
            timber.geometry.dispose();
            oak.dispose();
            endGrain.dispose();
        }
    }
});

test("table trestle's rectangular members retain cut faces and group transforms", () => {
    const material = new THREE.MeshStandardMaterial();
    const endGrain = new THREE.MeshStandardMaterial();

    const trestle = createTrestleSupport({
        height: 0.71,
        footLength: 0.8,
        headLength: 0.72,
        postWidth: 0.145,
        postDepth: 0.135,
        crossWidth: 0.16,
        footHeight: 0.1,
        headHeight: 0.105,
        braceSize: 0.07
    }, (name, start, end, width, depth, contacts) => {
        const member = tableTimberGeometry(
            start, end, width, depth, contacts
        );
        const faces = member.fitted
            ? {
                "side-0": material, "side-1": material,
                "side-2": material, "side-3": material,
                "cap-start": endGrain, "cap-end": endGrain
            }
            : {
                px: material, nx: material,
                py: endGrain, ny: endGrain,
                pz: material, nz: material
            };
        const mesh = surfaceMesh({
            name,
            geometry: member.geometry,
            materials: faces
        });
        mesh.applyMatrix4(member.localToParent);
        return mesh;
    });

    const stretcher = tableTimberGeometry(
        new THREE.Vector3(-0.5275, -0.395, 0),
        new THREE.Vector3(0.5275, -0.395, 0),
        0.105, 0.105
    );

    try {
        assert.equal(trestle.children.length, 5);
        const parts = [
            "Foot", "Post", "TopBearer",
            "BraceBack", "BraceFront"
        ];

        for (const name of parts) {
            const mesh = trestle.getObjectByName(name);
            assert.ok(mesh?.isMesh, `Missing trestle member ${name}`);
            const authored = getControlResult(mesh.geometry);
            assert.ok(authored);
            assert.equal(topologyOf(authored).openBoundaries().length, 0);
            assert.equal(getControlOutline(mesh.geometry).quadCount,
                authored.geometry.quads.length);
            assert.ok(mesh.geometry.groups.length >= 2);
        }

        assert.equal(stretcher.fitted, false);
        almost(stretcher.localToParent.elements[12], 0);
        almost(stretcher.localToParent.elements[13], -0.395);

        const group = new THREE.Group();
        const left = trestle.clone();
        left.position.set(-0.6, -0.735, 0);
        const right = trestle.clone();
        right.position.set(0.6, -0.735, 0);
        group.add(left, right);

        const runtime = prepareRuntimeModel(group);
        try {
            assert.equal(runtime.sourceMeshes, 10);
            assert.ok(runtime.outputMeshes > 0);
        } finally {
            runtime.dispose();
        }
    } finally {
        trestle.traverse(object => {
            if (object.isMesh) object.geometry.dispose();
        });
        material.dispose();
        endGrain.dispose();
    }
});
