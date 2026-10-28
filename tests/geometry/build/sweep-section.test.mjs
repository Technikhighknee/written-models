import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { sweepSection } = await toolbox("geometry/build/sweepSection.ts");
const { topologyOf } = await toolbox("geometry/kernel/topology.ts");
const { surfaceMesh } = await toolbox("geometry/mesh/surfaceMesh.ts");
const { getControlOutline } = await toolbox("geometry/mesh/controlOutline.ts");

const v2 = (x, y) => new THREE.Vector2(x, y);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function rectangle(width, height) {
    return [
        v2(-width / 2, -height / 2),
        v2(width / 2, -height / 2),
        v2(width / 2, height / 2),
        v2(-width / 2, height / 2)
    ];
}

function profile(t, hollow = false) {
    return {
        outer: {
            points: rectangle(0.6 - t * 0.1, 0.35 + t * 0.1),
            closed: true
        },
        ...(hollow ? {
            holes: [{
                points: rectangle(0.2, 0.1).reverse(),
                closed: true
            }]
        } : {})
    };
}

const straight = {
    at: t => v3(0, 0, t * 2),
    tangent: () => v3(0, 0, 1)
};

function circle(nonplanar = false) {
    const radius = 2;
    const height = nonplanar ? 0.35 : 0;

    return {
        at: t => {
            const a = t * Math.PI * 2;
            return v3(
                radius * Math.cos(a),
                radius * Math.sin(a),
                height * Math.sin(2 * a)
            );
        },
        tangent: t => {
            const a = t * Math.PI * 2;
            return v3(
                -radius * Math.sin(a),
                radius * Math.cos(a),
                2 * height * Math.cos(2 * a)
            );
        }
    };
}

function circleStart(path) {
    const tangent = path.tangent(0).normalize();
    const u = v3(1, 0, 0);
    const v = tangent.clone().cross(u).normalize();

    return new THREE.Matrix4()
        .makeBasis(u, v, tangent)
        .setPosition(path.at(0));
}

test("open sweep varies its cross-section and caps real authored quads", () => {
    const result = sweepSection({
        path: straight,
        sectionAt: t => profile(t),
        startingFrame: new THREE.Matrix4(),
        stations: [0, 0.25, 0.5, 1]
    });

    const index = topologyOf(result);

    assert.equal(result.geometry.vertices.length, 16);
    assert.equal(result.geometry.quads.length, 14);
    assert.equal(index.openBoundaries().length, 0);
    assert.equal(index.connectedComponents().length, 1);
    assert.equal(result.regions["cap-start"].length, 1);
    assert.equal(result.regions["cap-end"].length, 1);
    assert.notEqual(
        result.geometry.vertices[0].x,
        result.geometry.vertices[12].x
    );

    const material = new THREE.MeshStandardMaterial();
    const mesh = surfaceMesh({
        name: "TransportedTimber",
        geometry: result,
        materials: material
    });

    try {
        assert.equal(getControlOutline(mesh.geometry).quadCount, 14);
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }
});

test("hollow sweep closes inner and outer contours without fake end discs", () => {
    const result = sweepSection({
        path: straight,
        sectionAt: t => profile(t, true),
        startingFrame: new THREE.Matrix4(),
        stations: [0, 0.5, 1]
    });

    assert.equal(result.geometry.vertices.length, 24);
    assert.equal(result.geometry.quads.length, 16);
    assert.ok(result.geometry.triangles.length > 0);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
});

test("open ends stay selected when the caller intends to finish them later", () => {
    const result = sweepSection({
        path: straight,
        sectionAt: t => profile(t),
        startingFrame: new THREE.Matrix4(),
        stations: [0, 0.5, 1],
        ends: "open"
    });

    assert.equal(result.geometry.quads.length, 8);
    assert.equal(topologyOf(result).openBoundaries().length, 2);
    assert.equal(result.boundaries["start-outer"][0].owner, result.id);
    assert.equal(result.boundaries["end-outer"][0].owner, result.id);
});

test("closed sweep shares seam vertices and distributes transport twist", () => {
    for (const nonplanar of [false, true]) {
        const path = circle(nonplanar);
        const stations = Array.from({ length: 16 }, (_, i) => i / 16);
        const result = sweepSection({
            path,
            startingFrame: circleStart(path),
            sectionAt: t => ({
                outer: {
                    points: rectangle(
                        0.25 * (1 + 0.1 * Math.sin(2 * Math.PI * t)),
                        0.2
                    ),
                    closed: true
                }
            }),
            stations,
            closedPath: true
        });

        assert.equal(result.geometry.vertices.length, 64);
        assert.equal(result.geometry.quads.length, 64);
        assert.equal(topologyOf(result).openBoundaries().length, 0);
        assert.equal(topologyOf(result).connectedComponents().length, 1);
        assert.equal(result.boundaries["start-outer"], undefined);

        const seamQuads = result.geometry.quads.filter(face =>
            face.corners.some(id => id < 4) &&
            face.corners.some(id => id >= 60)
        );

        assert.equal(seamQuads.length, 4);
        assert.ok(seamQuads.every(face =>
            face.uvs[2].y !== face.uvs[0].y
        ));
    }
});

test("closed hollow sweeps have no exposed edges or duplicated seam rings", () => {
    const path = circle();
    const stations = Array.from({ length: 12 }, (_, i) => i / 12);

    const result = sweepSection({
        path,
        startingFrame: circleStart(path),
        sectionAt: () => profile(0, true),
        stations,
        closedPath: true
    });

    assert.equal(result.geometry.vertices.length, 12 * 8);
    assert.equal(result.geometry.quads.length, 12 * 8);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 2);
    assert.equal(result.geometry.triangles?.length ?? 0, 0);
});

test("asymmetric spatial loops close after distributing residual roll", () => {
    const radius = 2;
    const heightAt = angle =>
        0.31 * Math.sin(angle) +
        0.18 * (Math.sin(2 * angle + 0.37) - Math.sin(0.37));

    const path = {
        at: t => {
            const angle = t * Math.PI * 2;

            return v3(
                radius * Math.cos(angle),
                radius * Math.sin(angle),
                heightAt(angle)
            );
        },
        tangent: t => {
            const angle = t * Math.PI * 2;

            return v3(
                -radius * Math.sin(angle),
                radius * Math.cos(angle),
                0.31 * Math.cos(angle) +
                    0.36 * Math.cos(2 * angle + 0.37)
            );
        }
    };

    const stations = Array.from({ length: 24 }, (_, i) => i / 24);
    const result = sweepSection({
        path,
        startingFrame: circleStart(path),
        sectionAt: () => ({
            outer: { points: rectangle(0.23, 0.14), closed: true }
        }),
        stations,
        closedPath: true
    });

    assert.equal(result.geometry.vertices.length, 24 * 4);
    assert.equal(result.geometry.quads.length, 24 * 4);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
});

test("inconsistent frame, reversed path and nonperiodic section fail", () => {
    assert.throws(
        () => sweepSection({
            path: straight,
            sectionAt: t => profile(t),
            startingFrame: new THREE.Matrix4().makeRotationX(0.5),
            stations: [0, 1]
        }),
        error => error.operation === "sweepSection" &&
            error.reason === "invalid-input"
    );

    assert.throws(
        () => sweepSection({
            path: straight,
            sectionAt: t => profile(t),
            startingFrame: new THREE.Matrix4(),
            stations: [0, 0.6, 0.4, 1]
        }),
        error => error.reason === "invalid-input"
    );

    const path = circle();

    assert.throws(
        () => sweepSection({
            path,
            sectionAt: t => profile(t),
            startingFrame: circleStart(path),
            stations: [0, 0.25, 0.5, 0.75],
            closedPath: true
        }),
        error => error.reason === "unsupported-topology"
    );

    assert.throws(
        () => sweepSection({
            path,
            sectionAt: () => profile(0),
            startingFrame: circleStart(path),
            stations: [0, 0.25, 0.5, 0.75],
            closedPath: true,
            ends: "open"
        }),
        error => error.reason === "invalid-input"
    );
});
