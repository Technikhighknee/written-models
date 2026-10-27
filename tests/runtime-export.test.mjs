import test, {after} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {createServer} from "vite";

const vite = await createServer({
    appType: "custom",
    server: {middlewareMode: true},
    logLevel: "silent"
});
after(async () => { await vite.close(); });

const {prepareRuntimeModel} = await vite.ssrLoadModule(
    "/src/core/export/prepareRuntimeModel.ts"
);

test("GLB compilation preserves instance transforms and colors", () => {
    const parent = new THREE.Group();
    parent.position.set(4, 2, -1);

    const instances = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial(),
        2
    );
    instances.name = "RepeatedParts";
    instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 1));
    instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 0, 3));
    instances.setColorAt(0, new THREE.Color("#ff0000"));
    instances.setColorAt(1, new THREE.Color("#00ff00"));
    parent.add(instances);

    const asset = prepareRuntimeModel(parent);
    try {
        const copy = asset.root.getObjectByName("RepeatedParts");
        assert.ok(copy instanceof THREE.InstancedMesh);
        assert.equal(copy.count, 2);
        assert.deepEqual(
            Array.from(copy.instanceMatrix.array),
            Array.from(instances.instanceMatrix.array)
        );
        assert.deepEqual(
            Array.from(copy.instanceColor.array),
            Array.from(instances.instanceColor.array)
        );
        assert.deepEqual(
            Array.from(copy.matrix.elements),
            Array.from(instances.matrixWorld.elements)
        );
    } finally {
        asset.dispose();
        instances.geometry.dispose();
        instances.material.dispose();
    }
});

test("physical material properties survive runtime compilation", () => {
    const material = new THREE.MeshPhysicalMaterial({
        color: "#a85525",
        roughness: 0.3,
        clearcoat: 0.8,
        clearcoatRoughness: 0.1
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.name = "ClearcoatedSurface";

    const asset = prepareRuntimeModel(mesh);
    try {
        const copy = asset.root.children.find(child => child.name === "ClearcoatedSurface");
        assert.ok(copy instanceof THREE.Mesh);
        assert.ok(copy.material instanceof THREE.MeshPhysicalMaterial);
        assert.equal(copy.material.clearcoat, 0.8);
        assert.equal(copy.material.clearcoatRoughness, 0.1);
    } finally {
        asset.dispose();
        mesh.geometry.dispose();
        material.dispose();
    }
});

test("a skinned model keeps its cloned skeleton and bone hierarchy", () => {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = "RigBone";
    const geometry = new THREE.BoxGeometry();
    const vertices = geometry.getAttribute("position").count;
    geometry.setAttribute(
        "skinIndex", new THREE.Uint16BufferAttribute(new Array(vertices * 4).fill(0), 4)
    );
    geometry.setAttribute(
        "skinWeight", new THREE.Float32BufferAttribute(
            Array.from({length: vertices}, () => [1, 0, 0, 0]).flat(), 4
        )
    );

    const material = new THREE.MeshStandardMaterial();
    const skin = new THREE.SkinnedMesh(geometry, material);
    skin.name = "Deformable";
    root.add(bone, skin);
    skin.bind(new THREE.Skeleton([bone]));

    const asset = prepareRuntimeModel(root);
    try {
        const copy = asset.root.getObjectByName("Deformable");
        const copiedBone = asset.root.getObjectByName("RigBone");
        assert.ok(copy instanceof THREE.SkinnedMesh);
        assert.ok(copiedBone instanceof THREE.Bone);
        assert.notEqual(copiedBone, bone);
        assert.equal(copy.skeleton.bones[0], copiedBone);
        assert.equal(asset.atlasPages, 0);
    } finally {
        asset.dispose();
        geometry.dispose();
        material.dispose();
    }
});
