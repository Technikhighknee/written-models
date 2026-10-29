import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {GLTFExporter} from "three/addons/exporters/GLTFExporter.js";

import {sourceModule, toolbox} from "../../support/toolbox.mjs";

const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {extrudeContour} = await toolbox("geometry/build/extrudeContour.ts");
const {fillSurfacePatch} = await toolbox("geometry/build/fillSurfacePatch.ts");
const {geometryResult, assertSelectionOwner} = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {openPatch, recessPatch} = await toolbox("geometry/edit/patchOpening.ts");
const {cutThrough} = await toolbox("geometry/edit/cutThrough.ts");
const {splitByPlane} = await toolbox("geometry/edit/splitByPlane.ts");
const {booleanSolids} = await toolbox("geometry/edit/booleanSolids.ts");
const {reconstructPatchQuads} = await toolbox(
    "geometry/edit/reconstructPatchQuads.ts"
);
const {surfaceMesh} = await toolbox("geometry/mesh/surfaceMesh.ts");
const {getControlOutline} = await toolbox("geometry/mesh/controlOutline.ts");
const {getControlMesh} = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);
const {prepareRuntimeModel} = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

const p = (x, y) => new THREE.Vector2(x, y);

function box(width = 2, height = 2, depth = 2, offset = [0, 0, 0]) {
    const mesh = boxMesh({width, height, depth,
        widthSegments: 2, heightSegments: 2, depthSegments: 2});
    const displacement = new THREE.Vector3(...offset);
    return geometryResult({
        ...mesh,
        vertices: mesh.vertices.map(v => v.clone().add(displacement))
    });
}

function chartedBox() {
    const source = box();
    const patch = (region, height, direction) => ({
        owner: source.id,
        faces: source.geometry.quads.flatMap((face, i) =>
            face.surface === region ? [{kind: "quad", index: i}] : []
        ),
        chart: {
            at: uv => new THREE.Vector3(
                uv.x, height, direction * uv.y
            ),
            parameterOf: point => p(point.x, direction * point.z),
            normalAt: () => new THREE.Vector3(0, height > 0 ? 1 : -1, 0)
        }
    });
    return {
        ...source,
        boundaries: {
            upperRim: topologyOf(source).regionBoundaries("py")
        },
        patches: {
            top: [patch("py", 1, -1)],
            bottom: [patch("ny", -1, 1)]
        }
    };
}

function square(size = 0.4) {
    return {
        closed: true,
        points: [
            p(-size, -size), p(-size, size),
            p(size, size), p(size, -size)
        ]
    };
}

function closed(result, components = 1) {
    const topology = topologyOf(result);
    assert.equal(topology.openBoundaries().length, 0);
    assert.equal(topology.connectedComponents().length, components);
}

function checkSelections(result) {
    const topology = topologyOf(result);
    for (const chains of Object.values(result.boundaries)) {
        for (const chain of chains) {
            assertSelectionOwner(result, chain);
            assert.equal(typeof chain.closed, "boolean");
            const limit = chain.closed ? chain.vertices.length :
                chain.vertices.length - 1;
            for (let i = 0; i < limit; i++) {
                assert.ok(topology.edgeUses(chain.vertices[i],
                    chain.vertices[(i + 1) % chain.vertices.length]).length);
            }
        }
    }
    for (const patches of Object.values(result.patches)) {
        for (const patch of patches) {
            assertSelectionOwner(result, patch);
            for (const face of patch.faces) {
                assert.ok(face.kind === "quad"
                    ? result.geometry.quads[face.index]
                    : result.geometry.triangles[face.index]);
            }
        }
    }
}

function physicalVolume(result) {
    let sum = 0;
    for (const face of [
        ...result.geometry.quads, ...(result.geometry.triangles ?? [])
    ]) {
        const first = result.geometry.vertices[face.corners[0]];
        for (let index = 1; index < face.corners.length - 1; index++) {
            const second = result.geometry.vertices[face.corners[index]];
            const third = result.geometry.vertices[face.corners[index + 1]];
            sum += first.dot(second.clone().cross(third)) / 6;
        }
    }
    return sum;
}

function uvSeamCount(result) {
    const coordinates = new Map();
    for (const face of [
        ...result.geometry.quads, ...(result.geometry.triangles ?? [])
    ]) {
        for (let i = 0; i < face.corners.length; i++) {
            const vertex = face.corners[i];
            const uv = face.uvs[i];
            const key = vertex;
            const unique = coordinates.get(key) ?? new Set();
            unique.add(uv.x.toFixed(6) + ":" + uv.y.toFixed(6));
            coordinates.set(key, unique);
        }
    }
    return [...coordinates.values()].filter(values => values.size > 1).length;
}

function faceUVsAreFinite(result) {
    for (const face of [
        ...result.geometry.quads, ...(result.geometry.triangles ?? [])
    ]) {
        assert.ok(result.regions[face.surface]?.length > 0);
        assert.equal(face.corners.length, face.uvs.length);
        for (const coord of face.uvs) {
            assert.ok(Number.isFinite(coord.x) && Number.isFinite(coord.y));
        }
        for (const id of face.corners) {
            const point = result.geometry.vertices[id];
            assert.ok(point && [point.x, point.y, point.z]
                .every(Number.isFinite));
        }
    }
}

function render(result, name) {
    const materials = Object.fromEntries(
        Object.keys(result.regions).map((region, i) => [
            region, new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(i / 15, 0.25, 0.55),
                roughness: 0.9
            })
        ])
    );
    const mesh = surfaceMesh({
        name, geometry: result, materials
    });
    assert.equal(getControlMesh(mesh.geometry), result.geometry);
    assert.equal(getControlOutline(mesh.geometry).quadCount,
        result.geometry.quads.length);
    return {mesh, materials};
}

function profileHexagon(radius) {
    return {
        outer: {
            closed: true,
            points: Array.from({length: 6}, (_, i) => {
                const angle = (i + 0.5) * Math.PI / 3;
                return p(radius * Math.cos(angle),
                    radius * Math.sin(angle));
            })
        }
    };
}

function curvedSurface() {
    const chart = {
        at: uv => new THREE.Vector3(
            uv.x, uv.y, 0.12 * (1 - uv.x ** 2) * (1 - uv.y ** 2)
        ),
        parameterOf: point => p(point.x, point.y),
        normalAt: uv => new THREE.Vector3(
            0.24 * uv.x * (1 - uv.y ** 2),
            0.24 * uv.y * (1 - uv.x ** 2), 1
        ).normalize()
    };
    const source = fillSurfacePatch({
        chart, region: "crown",
        maxDeviation: 0.005,
        profile: {
            outer: {
                points: [p(-1, -1), p(-1, 1), p(1, 1), p(1, -1)],
                parameters: [0, 0.25, 0.5, 0.75]
            }
        }
    });
    const corners = [
        p(-0.4, -0.4), p(-0.4, 0.4),
        p(0.4, 0.4), p(0.4, -0.4)
    ];
    const contour = {
        closed: true,
        points: corners.flatMap((from, i) =>
            Array.from({length: 12}, (_, j) =>
                from.clone().lerp(corners[(i + 1) % 4],
                    j / 12))
        )
    };
    return {source, chart, contour};
}

test("planar pocket -> capped split -> exact quad floor reconstruction", () => {
    const source = chartedBox();
    const original = source.geometry.vertices.map(v => v.clone());
    const pocket = recessPatch(source, source.patches.top[0],
        square(0.35), {
            depth: 0.4, wallRegion: "pocket-wall",
            floorRegion: "pocket-floor"
        });
    closed(pocket);
    assert.ok(Math.abs(physicalVolume(source) - 8) < 1e-8);
    assert.ok(Math.abs(physicalVolume(pocket) -
        (8 - 0.7 * 0.7 * 0.4)) < 1e-6);
    assert.ok(uvSeamCount(pocket) > 0);
    assert.equal(pocket.regions["pocket-wall"].length, 4);
    assert.equal(pocket.boundaries.upperRim.length, 1);
    checkSelections(pocket);

    const partition = splitByPlane(pocket, {
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 1, 0)
    }, {cap: true, cutRegion: "sawn-section"});
    assert.equal(partition.parts.length, 2);
    assert.equal(partition.interfaces.length, 1);
    assert.ok(Math.abs(partition.parts.reduce(
        (sum, part) => sum + physicalVolume(part), 0
    ) - physicalVolume(pocket)) < 1e-6);

    for (const part of partition.parts) {
        closed(part);
        faceUVsAreFinite(part);
        checkSelections(part);
    }
    const upper = partition.parts[
        partition.sideOfPart.indexOf("positive")
    ];
    assert.equal(upper.regions["pocket-floor"].length, 2);
    const reconstructed = reconstructPatchQuads(
        upper, "pocket-floor", {requireComplete: true}
    );
    closed(reconstructed);
    assert.equal(reconstructed.regions["pocket-floor"].length, 1);
    assert.equal(reconstructed.geometry.quads.filter(face =>
        face.surface === "pocket-floor"
    ).length, 1);
    assert.ok(reconstructed.regions["sawn-section"]?.length);
    checkSelections(reconstructed);
    faceUVsAreFinite(reconstructed);
    assert.deepEqual(source.geometry.vertices, original);
});

test("through-bore -> annular plane split -> Boolean trim retains real interior walls", async () => {
    const source = chartedBox();
    const bored = cutThrough(source, {
        entry: {patch: source.patches.top[0], contour: square(0.32)},
        exit: {patch: source.patches.bottom[0], contour: square(0.32)},
        wallRegion: "through-wall"
    });
    closed(bored);
    assert.equal(bored.regions["through-wall"].length, 4);
    checkSelections(bored);

    const split = splitByPlane(bored, {
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 1, 0)
    }, {cap: true, cutRegion: "annular-saw"});
    assert.equal(split.parts.length, 2);
    assert.equal(split.interfaces.length, 2);
    assert.ok(Math.abs(physicalVolume(bored) -
        (8 - 0.64 * 0.64 * 2)) < 1e-6);
    assert.ok(Math.abs(split.parts.reduce(
        (sum, part) => sum + physicalVolume(part), 0
    ) - physicalVolume(bored)) < 1e-6);
    for (const part of split.parts) {
        closed(part);
        assert.ok(part.regions["through-wall"]?.length);
        assert.ok(part.regions["annular-saw"]?.length);
        checkSelections(part);
    }
    const upper = split.parts[split.sideOfPart.indexOf("positive")];
    const cutter = box(0.53, 0.54, 0.61, [0.77, 0.63, 0.54]);
    const carved = await booleanSolids(upper, cutter, "difference");
    closed(carved);
    assert.ok(carved.regions["cut:px"]?.length ||
        Object.keys(carved.regions).some(name => name.startsWith("cut:")));
    assert.ok(carved.regions["first:through-wall"]?.length);
    faceUVsAreFinite(carved);
    assert.ok(physicalVolume(carved) > 0);
    assert.ok(physicalVolume(carved) < physicalVolume(upper));
    assert.ok(uvSeamCount(carved) > 0);
    assert.equal(carved.geometry.quads.length, 0);
    const {mesh, materials} = render(carved, "BoreTrim");
    mesh.geometry.dispose();
    Object.values(materials).forEach(material => material.dispose());
});

test("curved recess and curved opening preserve exact contour stations and distinct UV regions", () => {
    const {source, chart, contour} = curvedSurface();
    const original = source.geometry.vertices.map(v => v.clone());
    const opening = openPatch(source, source.patches.crown[0], contour);
    assert.equal(topologyOf(opening).openBoundaries().length, 2);
    assert.equal(opening.boundaries.opening[0].vertices.length,
        contour.points.length);
    assert.equal(opening.patches.crown.length, 1);
    checkSelections(opening);

    const pocket = recessPatch(source, source.patches.crown[0],
        contour, {
            depth: 0.12,
            wallRegion: "curved-wall",
            floorRegion: "curved-floor"
        });
    assert.equal(topologyOf(pocket).openBoundaries().length, 1);
    assert.equal(topologyOf(pocket).connectedComponents().length, 1);
    assert.equal(pocket.geometry.quads.filter(face =>
        face.surface === "curved-wall"
    ).length, contour.points.length);
    assert.ok(pocket.regions["curved-floor"].length > 2);
    checkSelections(pocket);
    faceUVsAreFinite(pocket);

    const floor = pocket.patches["curved-floor"][0].chart;
    for (const uv of [p(-0.2, 0.25), p(0.15, -0.1), p(0, 0)]) {
        const actual = floor.at(uv);
        const expected = chart.at(uv).clone().addScaledVector(
            chart.normalAt(uv), -0.12
        );
        assert.ok(actual.distanceTo(expected) < 1e-8);
        assert.ok(floor.parameterOf(actual).distanceTo(uv) < 1e-7);
    }
    assert.deepEqual(source.geometry.vertices, original);
});

test("non-box extrusion -> plane partition -> Boolean -> Quad View and runtime GLB", async () => {
    const prism = extrudeContour(profileHexagon(0.88), {
        frame: new THREE.Matrix4(), depth: 2
    });
    closed(prism);
    const split = splitByPlane(prism, {
        point: new THREE.Vector3(0, 0, 1),
        normal: new THREE.Vector3(0, 0, 1)
    }, {cap: true, cutRegion: "hex-cross-section"});
    assert.equal(split.parts.length, 2);
    assert.equal(split.interfaces.length, 1);
    assert.ok(Math.abs(split.parts.reduce(
        (sum, part) => sum + physicalVolume(part), 0
    ) - physicalVolume(prism)) < 1e-6);
    for (const part of split.parts) {
        closed(part);
        faceUVsAreFinite(part);
    }

    const positive = split.parts[split.sideOfPart.indexOf("positive")];
    const cutter = box(0.65, 0.72, 0.6, [0.58, 0.18, 1.55]);
    const result = await booleanSolids(positive, cutter, "difference");
    closed(result);
    assert.ok(physicalVolume(result) > 0);
    assert.ok(physicalVolume(result) < physicalVolume(positive));
    assert.ok(Object.keys(result.regions).some(region =>
        region.startsWith("cut:")
    ));
    faceUVsAreFinite(result);

    // Capture an actual model with two dissimilar edited pieces, so this
    // is the same runtime material/UV boundary exercised by model export.
    const bore = chartedBox();
    const tunneled = cutThrough(bore, {
        entry: {patch: bore.patches.top[0], contour: square(0.32)},
        exit: {patch: bore.patches.bottom[0], contour: square(0.32)},
        wallRegion: "through-wall"
    });
    const pieces = [render(result, "CutHexagon"),
        render(tunneled, "ThroughBox")];
    pieces[1].mesh.position.x = 4;
    const stage = new THREE.Group();
    for (const item of pieces) stage.add(item.mesh);
    const runtime = prepareRuntimeModel(stage);
    assert.equal(runtime.sourceMeshes, 2);
    assert.ok(runtime.outputMeshes >= 1);

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
        const scene = new THREE.Scene();
        scene.add(runtime.root);
        const glb = await new GLTFExporter().parseAsync(scene, {
            binary: true
        });
        assert.ok(glb instanceof ArrayBuffer);
        const header = new DataView(glb);
        assert.equal(header.getUint32(0, true), 0x46546c67);
        const document = JSON.parse(new TextDecoder().decode(
            new Uint8Array(glb, 20, header.getUint32(12, true))
        ).trim());
        assert.ok(document.meshes.length > 0);
        assert.ok(document.meshes.flatMap(mesh => mesh.primitives)
            .every(primitive =>
                primitive.attributes.TEXCOORD_0 !== undefined &&
                primitive.material !== undefined
            ));
    } finally {
        runtime.dispose();
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
        for (const {mesh, materials} of pieces) {
            mesh.geometry.dispose();
            Object.values(materials).forEach(material =>
                material.dispose()
            );
        }
    }
});
