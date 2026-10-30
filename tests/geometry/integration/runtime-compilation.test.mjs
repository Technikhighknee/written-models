import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule } from "../../support/toolbox.mjs";

const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

async function exportJson(root) {
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
        const bytes = await new GLTFExporter().parseAsync(
            root, {binary: true}
        );
        const header = new DataView(bytes);
        assert.equal(header.getUint32(0, true), 0x46546c67);
        return JSON.parse(new TextDecoder().decode(
            new Uint8Array(bytes, 20, header.getUint32(12, true))
        ));
    } finally {
        if (previousReader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = previousReader;
    }
}

test("static batching leaves instances and morph controls intact", async () => {
    const scene = new THREE.Group();
    const oak = new THREE.MeshStandardMaterial({color: 0x876543});

    for (const x of [-2, 2]) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), oak);
        mesh.position.x = x;
        scene.add(mesh);
    }

    const instances = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.2), oak, 2
    );
    instances.name = "RepeatedPins";
    instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 1, 0));
    instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 2, 0));
    instances.setColorAt(0, new THREE.Color(0xff0000));
    instances.setColorAt(1, new THREE.Color(0x00ff00));
    scene.add(instances);

    const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const base = geometry.getAttribute("position");
    const raised = Array.from(base.array, (value, index) =>
        index % 3 === 1 ? value + 0.03 : value
    );
    geometry.morphAttributes.position = [
        new THREE.Float32BufferAttribute(raised, 3)
    ];
    const morph = new THREE.Mesh(geometry, oak);
    morph.name = "ShapeWithMorph";
    morph.updateMorphTargets();
    morph.morphTargetInfluences[0] = 0.35;
    scene.add(morph);

    const runtime = prepareRuntimeModel(scene);
    try {
        assert.equal(runtime.sourceMeshes, 4);
        assert.equal(runtime.outputMeshes, 3);
        assert.equal(runtime.atlasPages, 0);

        const pins = runtime.root.getObjectByName("RepeatedPins");
        assert.ok(pins instanceof THREE.InstancedMesh);
        assert.notEqual(pins, instances);
        assert.equal(pins.count, 2);
        assert.deepEqual(
            Array.from(pins.instanceMatrix.array),
            Array.from(instances.instanceMatrix.array)
        );
        assert.deepEqual(
            Array.from(pins.instanceColor.array),
            Array.from(instances.instanceColor.array)
        );

        const shape = runtime.root.getObjectByName("ShapeWithMorph");
        assert.ok(shape instanceof THREE.Mesh);
        assert.notEqual(shape, morph);
        assert.equal(shape.geometry, geometry);
        assert.equal(shape.geometry.morphAttributes.position.length, 1);
        assert.deepEqual(shape.morphTargetInfluences, [0.35]);

        morph.morphTargetInfluences[0] = 0.7;
        assert.deepEqual(shape.morphTargetInfluences, [0.35]);

        const document = await exportJson(runtime.root);
        assert.ok(document.extensionsUsed?.includes("EXT_mesh_gpu_instancing"));
        const instanceNode = document.nodes.find(node =>
            node.name === "RepeatedPins"
        );
        assert.ok(instanceNode?.extensions?.EXT_mesh_gpu_instancing);
        const attributes =
            instanceNode.extensions.EXT_mesh_gpu_instancing.attributes;
        assert.ok(Number.isInteger(attributes.TRANSLATION));
        assert.ok(Number.isInteger(attributes._COLOR_0));

        const morphNode = document.nodes.find(node =>
            node.name === "ShapeWithMorph"
        );
        assert.ok(Number.isInteger(morphNode?.mesh));
        const exportedMorph = document.meshes[morphNode.mesh];
        assert.equal(exportedMorph.primitives[0].targets.length, 1);
        assert.ok(Math.abs(exportedMorph.weights[0] - 0.35) < 1e-6);
    } finally {
        runtime.dispose();
        scene.traverse(object => {
            if (object instanceof THREE.Mesh) object.geometry.dispose();
        });
        oak.dispose();
    }
});

test("skinned export clones the whole rig instead of merging its meshes", async () => {
    const scene = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = "RootBone";

    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const count = geometry.getAttribute("position").count;
    const indices = [];
    const weights = [];
    for (let i = 0; i < count; i++) {
        indices.push(0, 0, 0, 0);
        weights.push(1, 0, 0, 0);
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));

    const material = new THREE.MeshStandardMaterial({color: 0x665544});
    const skin = new THREE.SkinnedMesh(geometry, material);
    skin.name = "RiggedPart";
    scene.add(bone, skin);
    skin.bind(new THREE.Skeleton([bone]));

    const ordinary = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5), material
    );
    ordinary.name = "NearbyStaticPart";
    scene.add(ordinary);

    const runtime = prepareRuntimeModel(scene);
    try {
        assert.equal(runtime.sourceMeshes, 2);
        assert.equal(runtime.outputMeshes, 2);
        assert.equal(runtime.atlasPages, 0);

        const cloned = runtime.root.getObjectByName("RiggedPart");
        const clonedBone = runtime.root.getObjectByName("RootBone");
        assert.ok(cloned instanceof THREE.SkinnedMesh);
        assert.ok(clonedBone instanceof THREE.Bone);
        assert.notEqual(cloned, skin);
        assert.notEqual(clonedBone, bone);
        assert.equal(cloned.skeleton.bones[0], clonedBone);
        assert.equal(
            runtime.root.getObjectByName("NearbyStaticPart").geometry,
            ordinary.geometry
        );

        const document = await exportJson(runtime.root);
        assert.equal(document.skins.length, 1);
        const skinNode = document.nodes.find(node =>
            node.name === "RiggedPart"
        );
        assert.ok(Number.isInteger(skinNode?.skin));
        const exportedSkin = document.skins[skinNode.skin];
        assert.equal(exportedSkin.joints.length, 1);
        assert.equal(document.nodes[exportedSkin.joints[0]].name, "RootBone");
    } finally {
        runtime.dispose();
        geometry.dispose();
        ordinary.geometry.dispose();
        material.dispose();
    }
});

test("compatible PBR textures share atlas pages without losing surface tints", () => {
    const oldCanvas = globalThis.HTMLCanvasElement;
    const oldDocument = globalThis.document;

    class Canvas {
        constructor() {
            this.width = 8;
            this.height = 8;
        }

        getContext(kind) {
            return kind === "2d" ? {drawImage() {}} : null;
        }
    }

    globalThis.HTMLCanvasElement = Canvas;
    globalThis.document = {
        createElement(kind) {
            assert.equal(kind, "canvas");
            return new Canvas();
        }
    };

    const sources = [];
    const makeMaterial = color => {
        const texture = space => {
            const result = new THREE.CanvasTexture(new Canvas());
            result.colorSpace = space;
            result.wrapS = THREE.RepeatWrapping;
            result.wrapT = THREE.RepeatWrapping;
            sources.push(result);
            return result;
        };

        return new THREE.MeshStandardMaterial({
            color,
            map: texture(THREE.SRGBColorSpace),
            roughnessMap: texture(THREE.NoColorSpace),
            normalMap: texture(THREE.NoColorSpace),
            roughness: 0.75,
            metalness: 0.1
        });
    };

    const materials = [
        makeMaterial(0xff0000),
        makeMaterial(0x0000ff)
    ];
    const scene = new THREE.Group();
    for (const [i, material] of materials.entries()) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 0.2), material
        );
        mesh.position.x = i;
        scene.add(mesh);
    }

    let runtime;
    try {
        runtime = prepareRuntimeModel(scene);
        assert.equal(runtime.sourceMeshes, 2);
        assert.equal(runtime.outputMeshes, 1);
        assert.equal(runtime.atlasPages, 1);

        const merged = runtime.root.children[0];
        assert.ok(merged instanceof THREE.Mesh);
        assert.ok(merged.material.map);
        assert.ok(merged.material.roughnessMap);
        assert.ok(merged.material.normalMap);
        assert.equal(merged.material.color.getHex(), 0xffffff);
        assert.equal(merged.material.vertexColors, true);
        assert.equal(merged.material.map.colorSpace, THREE.SRGBColorSpace);

        const colors = merged.geometry.getAttribute("color");
        const reds = Array.from({length: colors.count}, (_, i) =>
            colors.getX(i)
        );
        const blues = Array.from({length: colors.count}, (_, i) =>
            colors.getZ(i)
        );
        assert.ok(reds.some(value => value > 0.99));
        assert.ok(blues.some(value => value > 0.99));
        assert.ok(reds.some(value => value < 0.01));
        assert.ok(blues.some(value => value < 0.01));

        const uv = merged.geometry.getAttribute("uv");
        assert.ok(Array.from(uv.array).every(value =>
            value >= 0 && value <= 1
        ));
    } finally {
        runtime?.dispose();
        scene.traverse(object => {
            if (object instanceof THREE.Mesh) object.geometry.dispose();
        });
        for (const material of materials) material.dispose();
        for (const source of sources) source.dispose();
        if (oldCanvas === undefined) delete globalThis.HTMLCanvasElement;
        else globalThis.HTMLCanvasElement = oldCanvas;
        if (oldDocument === undefined) delete globalThis.document;
        else globalThis.document = oldDocument;
    }
});

test("world-space static batching rejects triangles collapsed by Float32", () => {
    const model = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({color: 0x776655});
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.002, 0.004, 0.006), material
    );
    mesh.name = "TinyDistantPart";
    model.add(mesh);

    mesh.position.x = 1e8;
    assert.throws(
        () => prepareRuntimeModel(model),
        error => error.operation === "prepareRuntimeModel" &&
            error.reason === "precision-loss" &&
            error.message.includes("TinyDistantPart")
    );

    mesh.position.x = 0;
    const runtime = prepareRuntimeModel(model);
    try {
        assert.equal(runtime.sourceMeshes, 1);
        assert.equal(runtime.outputMeshes, 1);
    } finally {
        runtime.dispose();
        mesh.geometry.dispose();
        material.dispose();
    }
});
