import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { attachAtFrames } = await toolbox(
    "spatial/relationships/attachAtFrames.ts"
);
const { attachByFrames } = await toolbox(
    "spatial/relationships/attachByFrames.ts"
);
const { attachByAnchors } = await toolbox(
    "spatial/relationships/attachByAnchor.ts"
);
const { addAnchor } = await toolbox(
    "spatial/anchors/anchors.ts"
);
const {
    frameFromAncestor,
    frameToLocal,
    frameToWorld
} = await toolbox("spatial/frames/frames.ts");

function sameFrame(actual, expected, tolerance = 1e-10) {
    for (let i = 0; i < 16; i++) {
        assert.ok(
            Math.abs(actual.elements[i] - expected.elements[i]) <= tolerance,
            `Matrix element ${i}: ${actual.elements[i]} vs ${expected.elements[i]}`
        );
    }
}

test("frame attachment uses parent-local and child-local contacts", () => {
    const parent = new THREE.Group();
    const child = new THREE.Group();

    parent.position.set(7, -4, 3);
    const parentFrame = new THREE.Matrix4()
        .makeTranslation(2, 0, 1);
    const childFrame = new THREE.Matrix4()
        .makeTranslation(-1, 2, 0);

    const attached = attachAtFrames({
        parent,
        child,
        parentFrame,
        childFrame
    });

    assert.equal(attached, child);
    assert.equal(child.parent, parent);

    sameFrame(
        frameToWorld(child, childFrame),
        frameToWorld(parent, parentFrame)
    );

    const local = frameToLocal(
        parent,
        frameToWorld(child, childFrame)
    );
    sameFrame(local, parentFrame);

    const other = new THREE.Group();
    attachByFrames(parent, other, parentFrame, childFrame);
    sameFrame(other.matrix, child.matrix);
});

test("explicit mating rotation aligns nested named anchors", () => {
    const scene = new THREE.Group();
    const parent = new THREE.Group();
    scene.add(parent);
    parent.position.set(3, 4, -2);

    const target = addAnchor(parent, "target", {
        position: new THREE.Vector3(0, 2, 0)
    });
    const child = new THREE.Group();
    const intermediate = new THREE.Group();
    intermediate.position.set(0.5, -0.5, 0.25);
    child.add(intermediate);

    const source = addAnchor(intermediate, "source", {
        position: new THREE.Vector3(0.25, 0.5, -0.25)
    });

    attachByAnchors(target, child, source);

    assert.equal(child.parent, target);
    sameFrame(
        frameFromAncestor(target, source),
        new THREE.Matrix4().makeRotationX(Math.PI)
    );
    sameFrame(
        frameToWorld(source),
        frameToWorld(target).multiply(
            new THREE.Matrix4().makeRotationX(Math.PI)
        )
    );
});

test("cycle, singular, shear and foreign anchor failures leave hierarchy intact", () => {
    const parent = new THREE.Group();
    const child = new THREE.Group();
    parent.add(child);
    const grandchild = new THREE.Group();
    child.add(grandchild);
    const origin = new THREE.Matrix4();

    assert.throws(
        () => attachAtFrames({
            parent: grandchild,
            child: parent,
            parentFrame: origin,
            childFrame: origin
        }),
        /cycle/
    );

    const separate = new THREE.Group();
    const shear = new THREE.Matrix4().set(
        1, 0.4, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    );

    assert.throws(
        () => attachAtFrames({
            parent,
            child: separate,
            parentFrame: shear,
            childFrame: origin
        }),
        /shear/
    );

    const distantShear = shear.clone()
        .setPosition(new THREE.Vector3(1e11, 2e11, -3e11));

    assert.throws(
        () => attachAtFrames({
            parent,
            child: separate,
            parentFrame: distantShear,
            childFrame: origin
        }),
        /shear/
    );

    assert.throws(
        () => attachAtFrames({
            parent,
            child: separate,
            parentFrame: new THREE.Matrix4().makeScale(0, 1, 1),
            childFrame: origin
        }),
        error => error.reason === "invalid-input"
    );

    const foreign = addAnchor(new THREE.Group(), "foreign");
    assert.throws(
        () => attachByAnchors(foreign, separate, foreign),
        /outside the requested hierarchy/
    );

    assert.equal(separate.parent, null);
    assert.equal(parent.parent, null);
    assert.equal(child.parent, parent);
    assert.equal(grandchild.parent, child);
});

test("world/local frame conversion accounts for nested parent transforms", () => {
    const root = new THREE.Group();
    root.position.set(4, -2, 1);
    root.rotation.z = Math.PI / 5;
    const nested = new THREE.Group();
    nested.position.set(1, 3, -0.5);
    nested.rotation.x = -Math.PI / 8;
    root.add(nested);

    const authored = new THREE.Matrix4()
        .makeTranslation(0.2, -0.4, 0.8);
    const world = frameToWorld(nested, authored);
    sameFrame(frameToLocal(nested, world), authored);
    sameFrame(
        frameFromAncestor(root, nested),
        nested.matrix
    );

    root.scale.x = 0;
    assert.throws(
        () => frameToLocal(nested, new THREE.Matrix4()),
        error => error.reason === "invalid-input"
    );
});
