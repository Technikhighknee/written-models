import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import {toolbox} from "../../support/toolbox.mjs";

const {booleanSolids} = await toolbox("geometry/edit/booleanSolids.ts");
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {geometryResult} = await toolbox("geometry/kernel/GeometryResult.ts");
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {surfaceMesh} = await toolbox("geometry/mesh/surfaceMesh.ts");
const {toBufferGeometry, getControlMesh} = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

function box(x = 0, y = 0, z = 0, size = 2) {
    const mesh = boxMesh({width: size, height: size, depth: size});
    return geometryResult({
        ...mesh,
        vertices: mesh.vertices.map(point =>
            point.clone().add(new THREE.Vector3(x, y, z))
        )
    });
}

function physicalVolume(result) {
    let total = 0;
    for (const face of result.geometry.triangles ?? []) {
        const [a, b, c] = face.corners.map(id =>
            result.geometry.vertices[id]
        );
        total += a.dot(b.clone().cross(c)) / 6;
    }
    return total;
}

function closed(result) {
    assert.equal(result.geometry.quads.length, 0);
    assert.ok(result.geometry.triangles.length > 0);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
}

function exportable(result) {
    const geometry = toBufferGeometry(
        result,
        Object.fromEntries(Object.keys(result.regions).map((name, i) =>
            [name, i]
        ))
    );
    try {
        assert.equal(getControlMesh(geometry), result.geometry);
        assert.ok(geometry.getAttribute("uv").count > 0);
        assert.ok(geometry.index.count >= 3);
    } finally {
        geometry.dispose();
    }
}

test("intersecting authored boxes preserve actual union, intersection and difference solids", async () => {
    const first = box();
    const second = box(1);
    const snapshots = [
        first.geometry.vertices.map(point => point.clone()),
        second.geometry.vertices.map(point => point.clone())
    ];
    const expected = [
        ["union", 12],
        ["intersection", 4],
        ["difference", 4]
    ];
    for (const [operation, volume] of expected) {
        const result = await booleanSolids(first, second, operation);
        closed(result);
        assert.equal(topologyOf(result).connectedComponents().length, 1);
        assert.ok(Math.abs(physicalVolume(result) - volume) < 1e-4);
        assert.ok(result.geometry.triangles.every(face =>
            face.uvs.every(uv => Number.isFinite(uv.x) &&
                Number.isFinite(uv.y))
        ));
        assert.ok(Object.keys(result.regions).some(name =>
            name.startsWith("first:")
        ));
        if (operation === "difference") {
            assert.ok(Object.keys(result.regions).some(name =>
                name.startsWith("cut:")
            ));
        }
        exportable(result);
    }
    assert.deepEqual(first.geometry.vertices, snapshots[0]);
    assert.deepEqual(second.geometry.vertices, snapshots[1]);
});

test("a smaller cutter produces a fully closed interior with separate cut region", async () => {
    const first = box();
    const cutter = box(0, 0, 0, 0.8);
    const result = await booleanSolids(first, cutter, "difference");
    closed(result);
    assert.ok(Math.abs(physicalVolume(result) - (8 - 0.8 ** 3)) < 1e-4);
    assert.equal(topologyOf(result).connectedComponents().length, 2);
    assert.ok(Object.keys(result.regions).some(name =>
        name.startsWith("cut:")
    ));
    exportable(result);
});

test("disjoint intersection is an owned empty geometry result", async () => {
    const result = await booleanSolids(box(), box(10), "intersection");
    assert.equal(result.geometry.vertices.length, 0);
    assert.equal(result.geometry.triangles.length, 0);
    assert.deepEqual(Object.keys(result.regions), []);
    assert.equal(topologyOf(result).connectedComponents().length, 0);
});

test("non-overlapping union keeps both disconnected closed components", async () => {
    const result = await booleanSolids(box(), box(10), "union");
    closed(result);
    assert.equal(topologyOf(result).connectedComponents().length, 2);
    assert.ok(Math.abs(physicalVolume(result) - 16) < 1e-4);
});

test("a boolean result can be used as a new boolean operand", async () => {
    const first = await booleanSolids(box(), box(1), "union");
    const result = await booleanSolids(first, box(0, 0, 1), "difference");
    closed(result);
    assert.ok(physicalVolume(result) > 0);
    assert.ok(Object.keys(result.regions).some(name =>
        name.startsWith("first:first:")
    ));
});

test("invalid open surfaces and invalid operations fail explicitly", async () => {
    const source = box();
    const unclosed = geometryResult({
        vertices: source.geometry.vertices,
        quads: source.geometry.quads.slice(0, -1),
        triangles: []
    });
    await assert.rejects(
        booleanSolids(unclosed, source, "union"),
        error => error.reason === "invalid-topology"
    );
    await assert.rejects(
        booleanSolids(source, source, "bogus"),
        error => error.reason === "invalid-input"
    );
});

test("Float32-collapse in a far-away small solid is rejected", async () => {
    const source = box(1e8, 0, 0, 0.002);
    await assert.rejects(
        booleanSolids(source, box(), "union"),
        error => error.reason === "precision-loss"
    );
});

test("a rotated rectangular operand retains closed triangulation and real source UV regions", async () => {
    const original = boxMesh({width: 1.6, height: 2, depth: 1.2});
    const rotation = new THREE.Matrix4().makeRotationY(Math.PI / 5);
    const second = geometryResult({
        ...original,
        vertices: original.vertices.map(point => point.clone()
            .applyMatrix4(rotation).add(new THREE.Vector3(0.7, 0.1, 0.15)))
    });
    const result = await booleanSolids(box(), second, "intersection");
    closed(result);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    const volume = physicalVolume(result);
    assert.ok(volume > 0.1 && volume < 1.6 * 2 * 1.2);
    assert.ok(Object.keys(result.regions).some(name =>
        name.startsWith("first:")
    ));
    assert.ok(Object.keys(result.regions).some(name =>
        name.startsWith("second:")
    ));
    assert.ok(result.geometry.triangles.every(face =>
        face.uvs.every(uv => Number.isFinite(uv.x) &&
            Number.isFinite(uv.y))
    ));
    exportable(result);
});

test("Boolean face region provenance and smoothing survive per-UV seam separation", async () => {
    const result = await booleanSolids(box(), box(1), "difference");
    closed(result);

    assert.ok(result.regions["first:px"] === undefined ||
        result.regions["first:px"].length > 0);
    assert.ok(result.regions["cut:nx"]?.length > 0);
    for (const face of result.geometry.triangles) {
        if (face.surface.startsWith("first:")) {
            assert.equal(face.smoothingGroup,
                face.surface.slice("first:".length));
        }
        if (face.surface.startsWith("cut:")) {
            assert.equal(face.smoothingGroup,
                face.surface.slice("cut:".length));
        }
    }
    assert.ok(result.geometry.triangles.some(face =>
        face.surface === "first:py" &&
        face.uvs.some(uv => Math.abs(uv.y - 2) < 1e-5)
    ));
});

test("Boolean output can serialize as a real material-grouped GLB with UV attributes", async () => {
    const result = await booleanSolids(box(), box(1), "difference");
    const materials = Object.fromEntries(
        Object.keys(result.regions).map((region, index) =>
            [region, new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(index / 8, 0.4, 0.5),
                roughness: 0.8
            })]
        )
    );
    const scene = new THREE.Group();
    const mesh = surfaceMesh({
        name: "BooleanModel", geometry: result, materials
    });
    scene.add(mesh);

    const previous = globalThis.FileReader;
    globalThis.FileReader = class {
        result = null;
        onloadend = null;
        async readAsArrayBuffer(blob) {
            this.result = await blob.arrayBuffer();
            this.onloadend?.();
        }
    };
    try {
        const bytes = await new GLTFExporter().parseAsync(scene, {
            binary: true
        });
        const header = new DataView(bytes);
        assert.equal(header.getUint32(0, true), 0x46546c67);
        const json = JSON.parse(new TextDecoder().decode(
            new Uint8Array(bytes, 20, header.getUint32(12, true))
        ));
        assert.equal(json.meshes.length, 1);
        assert.ok(json.meshes[0].primitives.length >= 2);
        assert.ok(json.meshes[0].primitives.every(part =>
            part.attributes.TEXCOORD_0 !== undefined &&
            part.material !== undefined
        ));
    } finally {
        if (previous === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previous;
        mesh.geometry.dispose();
        for (const material of Object.values(materials)) {
            material.dispose();
        }
    }
});
