import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { createTrestleSupport } = await sourceModule(
    "models/components/trestleSupport.ts"
);
const { boxMesh } = await toolbox(
    "geometry/construction/boxMesh.ts"
);
const { fitBetweenSurfaces } = await toolbox(
    "geometry/queries/fitBetweenSurfaces.ts"
);
const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { capBoundary } = await toolbox(
    "geometry/build/finishBoundaries.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { toBufferGeometry } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const uv = (x, y) => new THREE.Vector2(x, y);

function rectangularSection(width, depth) {
    return {
        outer: {
            closed: true,
            points: [
                uv(-width / 2, -depth / 2),
                uv(width / 2, -depth / 2),
                uv(width / 2, depth / 2),
                uv(-width / 2, depth / 2)
            ]
        }
    };
}

/** A real authored beam, with its long axis between the given endpoints. */
function memberTarget(start, end, width, depth) {
    const axis = end.clone().sub(start);
    const geometry = boxMesh({
        width, height: axis.length(), depth
    });
    const rotation = new THREE.Quaternion().setFromUnitVectors(
        v(0, 1, 0), axis.normalize()
    );

    return {
        geometry,
        localToWorld: new THREE.Matrix4().compose(
            start.clone().add(end).multiplyScalar(0.5),
            rotation,
            v(1, 1, 1)
        )
    };
}

function sectionFrame(section) {
    const [first, second, third] = section.outer.points;
    const x = second.clone().sub(first).normalize();
    const z = second.clone().sub(first)
        .cross(third.clone().sub(first)).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();

    return new THREE.Matrix4().makeBasis(x, y, z).setPosition(first);
}

/** Preserve the actual fitted end rings through loft, caps and Quad View. */
function closedMember(sections) {
    let result = loftSectionWalls(sections, {
        outerRegion: "long-grain"
    });

    for (const [name, ring] of [
        ["start", sections[0]],
        ["end", sections[1]]
    ]) {
        result = capBoundary(
            result,
            result.boundaries[`${name}-outer`][0],
            {
                region: "end-grain",
                uvFrame: sectionFrame(ring),
                tessellation: "quad-if-planar"
            }
        );
    }

    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.geometry.quads.length, 6);
    assert.equal(result.geometry.triangles?.length ?? 0, 0);

    const rendered = toBufferGeometry(result.geometry, {
        "long-grain": 0,
        "end-grain": 1
    });

    try {
        assert.equal(getControlOutline(rendered).quadCount, 6);
        assert.ok(rendered.getAttribute("uv").count > 0);
    } finally {
        rendered.dispose();
    }

    return result;
}

function assertFittedToPlanes(fitted) {
    assert.equal(fitted.startContact.kind, "surface");
    assert.equal(fitted.endContact.kind, "surface");

    for (const [ring, contact] of [
        [fitted.sections[0], fitted.startContact],
        [fitted.sections[1], fitted.endContact]
    ]) {
        assert.ok(contact.patch.faces.length > 0);

        const inverse = contact.patch.frame.clone().invert();
        for (const vertex of ring.outer.points) {
            assert.ok(Math.abs(
                vertex.clone().applyMatrix4(inverse).z
            ) < 1e-8);
        }
    }
}

test("chair seat and low rails fit the finite faces of the front legs", () => {
    // Same front-leg lean, seat height and two rail sizes as the chair.
    const left = memberTarget(
        v(-0.188, 0, 0.169), v(-0.185, 0.422, 0.160),
        0.062, 0.062
    );
    const right = memberTarget(
        v(0.188, 0, 0.169), v(0.185, 0.422, 0.160),
        0.062, 0.062
    );

    for (const [height, width, depth] of [
        [0.422 - 0.083 / 2 - 0.002, 0.083, 0.042],
        [0.180, 0.044, 0.042]
    ]) {
        const fitted = fitBetweenSurfaces({
            start: { target: left, near: v(-0.185, height, 0.160) },
            end: { target: right, near: v(0.185, height, 0.160) },
            section: rectangularSection(width, depth),
            referenceDirection: v(0, 1, 0)
        });

        assertFittedToPlanes(fitted);
        closedMember(fitted.sections);
    }

    // The full rail outline must fit on both legs, not just its center.
    assert.throws(() => fitBetweenSurfaces({
        start: { target: left, near: v(-0.185, 0.39, 0.160) },
        end: { target: right, near: v(0.185, 0.39, 0.160) },
        section: rectangularSection(0.12, 0.042),
        referenceDirection: v(0, 1, 0)
    }), error => error.reason === "outside-contact-patch");
});

test("both diagonal table braces fit the real foot and post footprints", () => {
    const timber = new Map();
    createTrestleSupport({
        height: 0.71,
        footLength: 0.80,
        headLength: 0.72,
        postWidth: 0.145,
        postDepth: 0.135,
        crossWidth: 0.16,
        footHeight: 0.10,
        headHeight: 0.105,
        braceSize: 0.07
    }, (name, start, end, width, depth, contacts) => {
        timber.set(name, { start, end, width, depth, contacts });
        return new THREE.Mesh();
    });

    const target = name => {
        const part = timber.get(name);
        assert.ok(part, `Missing trestle part ${name}`);
        return memberTarget(part.start, part.end, part.width, part.depth);
    };

    const foot = target("Foot");
    const post = target("Post");

    for (const name of ["BraceBack", "BraceFront"]) {
        const brace = timber.get(name);
        assert.ok(brace);
        const fitted = fitBetweenSurfaces({
            start: { target: foot, near: brace.start },
            end: { target: post, near: brace.end },
            section: rectangularSection(brace.width, brace.depth),
            referenceDirection: v(1, 0, 0)
        });

        assertFittedToPlanes(fitted);
        const result = closedMember(fitted.sections);
        assert.ok(result.geometry.vertices.every(point =>
            point.toArray().every(Number.isFinite)
        ));

        const footNormal = fitted.startContact.patch.contact.normal;
        const postNormal = fitted.endContact.patch.contact.normal;
        assert.ok(footNormal.dot(brace.contacts.startNormal) > 0.99);
        assert.ok(postNormal.dot(brace.contacts.endNormal) > 0.99);
    }
});
