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

const { bandAroundProfileData, bandAroundProfile } = await toolbox(
    "geometry/construction/bandAroundProfile.ts"
);
const { bulgedProfile } = await toolbox(
    "shapes/profiles/bulged.ts"
);
const { radialStaves } = await toolbox(
    "geometry/construction/radialStaves.ts"
);
const { surfaceClearance } = await toolbox(
    "geometry/queries/surfaceClearance.ts"
);
const { verifyExteriorPlacement } = await toolbox(
    "geometry/queries/verifyExteriorPlacement.ts"
);

const { buildTankardGeometry, buildTankardServingCavity } =
    await sourceModule("models/beerMug.ts");
const { createFillableVolume } = await toolbox(
    "geometry/construction/fillableVolume.ts"
);
const { geometryResult } = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const { raycastSurface } = await toolbox(
    "geometry/queries/raycastSurface.ts"
);
const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);
const { GLTFExporter } = await import(
    "three/addons/exporters/GLTFExporter.js"
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

/**
 * Use the barrel's actual twenty-four stave dimensions, section profile
 * and hoop sampling. Limit the query to outward wood faces and the
 * band surface closest to the wood; no invisible cylinder is involved.
 */
test("the barrel's real iron band remains outside its faceted staves", () => {
    const profile = bulgedProfile({
        height: 0.78,
        bottomDiameter: 0.52,
        topDiameter: 0.52,
        peakDiameter: 0.60,
        points: 9,
        curve: "quadratic"
    });
    const staves = radialStaves(profile, {
        count: 24,
        thickness: 0.024,
        innerWidthSamples: [0, 1],
        edgeRoundover: 0.0022
    });
    const bandOptions = {
        y: 0.08,
        width: 0.028,
        thickness: 0.0038,
        clearance: 0.001,
        bevel: 0.00075,
        radialSegments: 48,
        angleOffset: 0
    };
    const band = bandAroundProfileData(profile, bandOptions);

    assert.ok(band.quads.some(face => face.surface === "inside"));
    assert.ok(band.quads.some(face => face.surface === "outside"));

    const compiled = bandAroundProfile(profile, bandOptions);
    try {
        assert.equal(getControlOutline(compiled).quadCount,
            band.quads.length);
    } finally {
        compiled.dispose();
    }

    const shell = { vertices: [], quads: [] };
    for (const stave of staves) {
        const offset = shell.vertices.length;
        shell.vertices.push(...stave.vertices);
        for (const face of stave.quads) {
            if (face.surface !== "outer") continue;
            shell.quads.push({
                ...face,
                corners: face.corners.map(index => index + offset)
            });
        }
    }

    const wood = {
        geometry: shell,
        localToWorld: new THREE.Matrix4()
    };
    const innerBand = {
        geometry: {
            vertices: band.vertices,
            quads: band.quads.filter(face => face.surface === "inside")
        },
        localToWorld: new THREE.Matrix4()
    };

    const clearance = surfaceClearance(innerBand, wood, {
        minimum: 0.0003
    });
    assert.equal(clearance.intersects, false);
    assert.equal(clearance.meetsMinimum, true);
    assert.ok(clearance.closestDistance > 0);

    const side = verifyExteriorPlacement(innerBand, wood, {
        minimum: 0.0003
    });
    assert.equal(side.exterior, true);
    assert.equal(side.ambiguous, false);
    assert.ok(side.minimumSignedDistance > 0);
});

test("both real tankard handle mounts meet the staves and the full mug exports", async () => {
    const parts = buildTankardGeometry();
    const handle = parts.handle;
    const topology = topologyOf(handle);
    const target = {
        geometry: parts.staves[0].geometry,
        localToWorld: new THREE.Matrix4()
    };

    for (const region of ["cap-start", "cap-end"]) {
        const rims = topology.regionBoundaries(region);
        assert.equal(rims.length, 1);
        assert.equal(rims[0].closed, true);

        for (const index of rims[0].vertices) {
            const point = handle.geometry.vertices[index];
            const contact = raycastSurface(target, {
                origin: v(0.14, point.y, point.z),
                direction: v(-1, 0, 0),
                maxDistance: 0.16
            });

            assert.ok(contact, `No stave contact for ${region} station ${index}`);
            assert.ok(contact.frontFacing);
            assert.ok(Math.abs(point.x - contact.point.x) <= 0.0007,
                `Handle's ${region} mount missed its real stave by more than 0.7 mm`);
        }
    }

    const cavity = buildTankardServingCavity(parts.staves);
    const wood = new THREE.MeshStandardMaterial({ color: 0x987654 });
    const iron = new THREE.MeshStandardMaterial({
        color: 0x444444, metalness: 0.7
    });
    const liquid = new THREE.MeshPhysicalMaterial({
        name: "Amber Ale", color: 0xb77a2b
    });
    const beer = createFillableVolume(cavity, liquid, 0.65, 0.00035);
    beer.mesh.name = "AmberAleContents";

    const tankard = new THREE.Group();
    const owned = [];
    const add = (data, mapping, material) => {
        const geometry = toBufferGeometry(data, mapping);
        owned.push(geometry);
        tankard.add(new THREE.Mesh(geometry, material));
    };

    try {
        const staveMapping = {
            outer: 0, inner: 0,
            "edge-left": 0, "edge-right": 0,
            "cap-start": 0, "cap-end": 0
        };
        for (const stave of parts.staves) {
            add(stave, staveMapping, wood);
        }
        add(parts.floor, { side: 0, top: 0, bottom: 0 }, wood);
        add(parts.handle, {
            side: 0, "cap-start": 0, "cap-end": 0
        }, wood);
        for (const band of parts.bands) {
            add(band, {
                bottom: 0, "lower-bevel": 0, outside: 0,
                "upper-bevel": 0, top: 0, inside: 0,
                "cap-start": 0, "cap-end": 0
            }, iron);
        }
        tankard.add(beer.mesh);

        const runtime = prepareRuntimeModel(tankard);
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
            assert.equal(runtime.sourceMeshes, 17);
            assert.ok(runtime.outputMeshes < runtime.sourceMeshes);
            const bytes = await new GLTFExporter().parseAsync(
                runtime.root, { binary: true }
            );
            const header = new DataView(bytes);
            assert.equal(header.getUint32(0, true), 0x46546c67);
            const gltf = JSON.parse(new TextDecoder().decode(
                new Uint8Array(bytes, 20, header.getUint32(12, true))
            ));
            const liquidNode = gltf.nodes.find(node =>
                node.name === "AmberAleContents"
            );

            assert.ok(liquidNode);
            const liquidMesh = gltf.meshes[liquidNode.mesh];
            assert.equal(liquidMesh.primitives[0].targets.length, 8);
            assert.deepEqual(liquidMesh.extras.targetNames,
                Object.keys(beer.mesh.morphTargetDictionary));
            assert.equal(liquidMesh.weights.length, 8);
            assert.ok(gltf.meshes.length >= 3);
            assert.ok(gltf.materials.length >= 3);
        } finally {
            runtime.dispose();
            if (previousReader === undefined) {
                delete globalThis.FileReader;
            } else {
                globalThis.FileReader = previousReader;
            }
        }
    } finally {
        for (const geometry of owned) geometry.dispose();
        beer.mesh.geometry.dispose();
        wood.dispose();
        iron.dispose();
        liquid.dispose();
    }
});
