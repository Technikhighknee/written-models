import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";
import { assertBoardPanel } from "../../support/assert-board-panel.mjs";

const {
    CHAIR,
    CHAIR_FRONT_SEAT,
    CHAIR_BACK_INFILL,
    buildChairFrameGeometry,
    buildChairRearSeatGeometry,
    buildChairCrestGeometry,
    chairBackTransform,
    chairCrestTransform
} = await sourceModule("models/components/chairGeometry.ts");
const { oakPanelGeometry } = await sourceModule(
    "models/components/oakSeating.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { cylinderMesh } = await toolbox(
    "geometry/construction/cylinderMesh.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

const near = (a, b, tolerance = 1e-10) =>
    assert.ok(Math.abs(a - b) <= tolerance,
        `Expected ${a} to match ${b} within ${tolerance}`);

test("chair frame's 13 timbers and 12 pins use authored finite surfaces", () => {
    const frame = buildChairFrameGeometry();

    assert.deepEqual([...frame.posts.keys()], [
        "LeftFrontLeg", "LeftBackStile",
        "RightFrontLeg", "RightBackStile"
    ]);
    assert.deepEqual(frame.rails.map(part => part.name), [
        "FrontSeatRail", "FrontLowStretcher",
        "RearSeatRail", "RearLowStretcher",
        "LeftSeatApron", "LeftLowerStretcher",
        "RightSeatApron", "RightLowerStretcher",
        "LowerBackRail"
    ]);
    assert.equal(frame.pegs.length, 12);

    for (const [name, part] of [
        ...frame.posts,
        ...frame.rails.map(rail => [rail.name, rail.timber])
    ]) {
        assert.equal(topologyOf(part.geometry).openBoundaries().length, 0,
            `Open ${name}`);
        assert.equal(topologyOf(part.geometry).connectedComponents().length, 1);
        assert.equal(part.geometry.geometry.quads.length, 6);
        assert.equal(part.geometry.geometry.triangles?.length ?? 0, 0);
        assert.ok(part.geometry.geometry.vertices.every(point =>
            point.toArray().every(Number.isFinite)
        ));
    }

    for (const peg of frame.pegs) {
        assert.ok(peg.point.toArray().every(Number.isFinite));
        assert.ok(peg.outward.toArray().every(Number.isFinite));
        near(peg.outward.length(), 1);
        near(Math.abs(peg.outward.x), 1, 0.04);
        assert.ok(peg.radius >= 0.005 && peg.radius <= 0.0055);
    }
});

test("seat housings, raked back and crest preserve the authored silhouette", () => {
    const seat = oakPanelGeometry(CHAIR_FRONT_SEAT);
    const infill = oakPanelGeometry(CHAIR_BACK_INFILL);
    assertBoardPanel(seat, {
        count: CHAIR_FRONT_SEAT.planks,
        gap: CHAIR_FRONT_SEAT.gap
    }, topologyOf);
    assertBoardPanel(infill, {
        count: CHAIR_BACK_INFILL.planks,
        gap: CHAIR_BACK_INFILL.gap
    }, topologyOf);

    const rear = buildChairRearSeatGeometry();
    const crest = buildChairCrestGeometry();
    for (const [name, part] of [
        ["RearSeatBoardWithCornerHousings", rear],
        ["ShapedCrestRail", crest],
        ...infill.map((part, index) => [`BackInfill${index}`, part])
    ]) {
        assert.equal(topologyOf(part).openBoundaries().length, 0,
            `Open ${name}`);
        assert.ok(part.geometry.quads.length > 0);
    }

    const exposed = rear.geometry.quads.flatMap(face =>
        face.corners.map(i => rear.geometry.vertices[i])
    );
    assert.ok(exposed.some(p => p.x < -0.21));
    assert.ok(exposed.some(p => p.x > 0.21));

    const back = chairBackTransform();
    const crown = chairCrestTransform();
    near(back.position.y, 0.7);
    near(crown.position.y, 0.89);
    assert.ok(Math.abs(back.quaternion.z) > 0);
    assert.ok(crown.rotationX < -Math.PI / 2);
});

test("complete 32-piece chair keeps Quad View and exports as GLB", async () => {
    const frame = buildChairFrameGeometry();
    const oak = new THREE.MeshStandardMaterial({
        name: "Chair Oak", color: 0x876344
    });
    const grain = new THREE.MeshStandardMaterial({
        name: "Chair End Grain", color: 0x654530
    });
    const scene = new THREE.Group();

    function addBoard(parent, name, geometry) {
        const mesh = surfaceMesh({
            name, geometry,
            materials: {
                outer: oak, inner: oak,
                "edge-left": oak, "edge-right": oak,
                "cap-start": grain, "cap-end": grain
            }
        });
        assert.equal(getControlOutline(mesh.geometry).quadCount,
            geometry.geometry.quads.length);
        parent.add(mesh);
    }

    function addTimber(parent, name, timber) {
        const faces = timber.fitted
            ? {
                "side-0": oak, "side-1": oak,
                "side-2": oak, "side-3": oak,
                "cap-start": grain, "cap-end": grain
            }
            : {
                px: oak, nx: oak, pz: oak, nz: oak,
                py: grain, ny: grain
            };
        const mesh = surfaceMesh({
            name,
            geometry: timber.geometry,
            materials: faces
        });
        mesh.applyMatrix4(timber.localToParent);
        scene.add(mesh);
        assert.equal(getControlOutline(mesh.geometry).quadCount, 6);
    }

    const front = new THREE.Group();
    front.name = "FrontSeatBoards";
    front.position.set(0, 0.46 - 0.038 / 2,
        (CHAIR.seatFront + CHAIR.frontBoardBack) / 2);
    oakPanelGeometry(CHAIR_FRONT_SEAT).forEach((part, i) =>
        addBoard(front, `FrontSeatBoard${i + 1}`, part)
    );
    scene.add(front);

    const rear = new THREE.Group();
    rear.position.y = 0.46 - 0.038 / 2;
    addBoard(rear, "RearSeatBoardWithCornerHousings",
        buildChairRearSeatGeometry());
    scene.add(rear);

    for (const [name, timber] of frame.posts) {
        addTimber(scene, name, timber);
    }
    for (const {name, timber} of frame.rails) {
        addTimber(scene, name, timber);
    }

    const back = new THREE.Group();
    const backPlacement = chairBackTransform();
    back.position.copy(backPlacement.position);
    back.quaternion.copy(backPlacement.quaternion);
    oakPanelGeometry(CHAIR_BACK_INFILL).forEach((part, i) =>
        addBoard(back, `BackInfillBoard${i + 1}`, part)
    );
    scene.add(back);

    const crest = new THREE.Group();
    const crestPlacement = chairCrestTransform();
    crest.position.copy(crestPlacement.position);
    crest.rotation.x = crestPlacement.rotationX;
    addBoard(crest, "ShapedCrestRail", buildChairCrestGeometry());
    scene.add(crest);

    for (const peg of frame.pegs) {
        const mesh = surfaceMesh({
            name: peg.name,
            geometry: cylinderMesh({
                radiusTop: peg.radius * 0.91,
                radiusBottom: peg.radius,
                height: 0.004,
                radialSegments: 10
            }),
            materials: {side: oak, top: grain, bottom: grain}
        });
        mesh.position.copy(peg.point)
            .addScaledVector(peg.outward, 0.0014);
        mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), peg.outward
        );
        scene.add(mesh);
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
        runtime = prepareRuntimeModel(scene);
        assert.equal(runtime.sourceMeshes, 32);

        const bytes = await new GLTFExporter().parseAsync(
            runtime.root, {binary: true}
        );
        const header = new DataView(bytes);
        assert.equal(header.getUint32(0, true), 0x46546c67);
        const json = JSON.parse(new TextDecoder().decode(
            new Uint8Array(bytes, 20, header.getUint32(12, true))
        ));
        assert.equal(json.materials.length, 2);
        assert.ok(json.meshes.flatMap(mesh => mesh.primitives).every(part =>
            part.attributes.POSITION !== undefined &&
            part.attributes.NORMAL !== undefined &&
            part.attributes.TEXCOORD_0 !== undefined
        ));
    } finally {
        runtime?.dispose();
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
        scene.traverse(object => {
            if (object.isMesh) object.geometry.dispose();
        });
        oak.dispose();
        grain.dispose();
    }
});
