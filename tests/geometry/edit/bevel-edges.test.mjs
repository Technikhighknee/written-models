import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {toolbox} from "../../support/toolbox.mjs";

const {bevelEdges} = await toolbox("geometry/edit/bevelEdges.ts");
const {subdivideEdges} = await toolbox("geometry/edit/subdivideEdges.ts");
const {splitByPlane} = await toolbox("geometry/edit/splitByPlane.ts");
const {boxMesh} = await toolbox("geometry/construction/boxMesh.ts");
const {extrudeContour} = await toolbox("geometry/build/extrudeContour.ts");
const {geometryResult, assertSelectionOwner} = await toolbox(
    "geometry/kernel/GeometryResult.ts"
);
const {topologyOf} = await toolbox("geometry/kernel/topology.ts");
const {toBufferGeometry, getControlMesh} = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

function box() {
    const base = geometryResult(boxMesh({
        width: 2, height: 2, depth: 2
    }));
    return {
        ...base,
        boundaries: {
            topRim: topologyOf(base).regionBoundaries("py")
        },
        patches: {
            top: [{
                owner: base.id,
                faces: base.regions.py,
                chart: {
                    at: uv => new THREE.Vector3(uv.x, 1, -uv.y),
                    parameterOf: point => new THREE.Vector2(point.x, -point.z),
                    normalAt: () => new THREE.Vector3(0, 1, 0)
                }
            }]
        }
    };
}

function topEdges(source) {
    const rim = source.boundaries.topRim[0].vertices;
    return rim.map((from, i) => ({
        owner: source.id,
        from,
        to: rim[(i + 1) % rim.length]
    }));
}

test("a complete box rim becomes a closed chamfer with real upper/lower edges", () => {
    const source = box();
    const before = source.geometry.vertices.map(v => v.clone());
    const result = bevelEdges(source, topEdges(source), () => 0.2);
    assert.deepEqual(source.geometry.vertices, before);
    assert.notEqual(result.id, source.id);
    assert.equal(result.geometry.quads.length, 10);
    assert.equal(result.regions.bevel.length, 4);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);

    const upper = result.boundaries["bevel-upper"][0];
    const lower = result.boundaries["bevel-lower"][0];
    assertSelectionOwner(result, upper);
    assertSelectionOwner(result, lower);
    assert.equal(upper.vertices.length, 4);
    assert.equal(lower.vertices.length, 4);
    for (let i = 0; i < 4; i++) {
        const top = result.geometry.vertices[upper.vertices[i]];
        const bottom = result.geometry.vertices[lower.vertices[i]];
        assert.ok(Math.abs(top.y - 1) < 1e-9);
        assert.ok(Math.abs(bottom.y - 0.8) < 1e-9);
        assert.ok(Math.abs(top.x) < 1 && Math.abs(top.z) < 1);
        assert.ok(before.some(point =>
            Math.abs(point.x - bottom.x) < 1e-9 &&
            Math.abs(point.z - bottom.z) < 1e-9 &&
            Math.abs(point.y - 1) < 1e-9
        ));
        assert.equal(topologyOf(result).edgeUses(
            upper.vertices[i], upper.vertices[(i + 1) % 4]
        ).length, 2);
        assert.equal(topologyOf(result).edgeUses(
            lower.vertices[i], lower.vertices[(i + 1) % 4]
        ).length, 2);
    }
    assert.equal(result.boundaries.topRim, undefined);
    assert.equal(result.patches.top.length, 1);

    const geometry = toBufferGeometry(
        result,
        Object.fromEntries(Object.keys(result.regions).map(name => [name, 0]))
    );
    try {
        assert.equal(getControlMesh(geometry), result.geometry);
        assert.ok(geometry.getAttribute("uv").count > 0);
    } finally {
        geometry.dispose();
    }
});

test("width field can vary along the selected ring without splitting its neighbors", () => {
    const source = box();
    const widths = [];
    const result = bevelEdges(source, topEdges(source), t => {
        widths.push(t);
        return 0.12 + 0.06 * t;
    });
    assert.deepEqual(widths.map(t => Number(t.toFixed(5))),
        [0, 0.25, 0.5, 0.75]);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(result.regions.bevel.length, 4);
    assert.equal(result.geometry.quads.length, 10);
    const upper = result.boundaries["bevel-upper"][0].vertices;
    const lower = result.boundaries["bevel-lower"][0].vertices;
    const displacements = upper.map((id, i) =>
        result.geometry.vertices[id].distanceTo(
            result.geometry.vertices[lower[i]]
        )
    );
    assert.ok(Math.max(...displacements) > Math.min(...displacements));
});

test("invalid selection order and excessive widths fail without source changes", () => {
    const source = box();
    const original = JSON.stringify(source.geometry.vertices);
    const edges = topEdges(source);
    // A single open edge is an intentionally supported terminated bevel.
    const single = bevelEdges(source, [edges[0]], () => 0.1);
    assert.equal(topologyOf(single).openBoundaries().length, 0);
    assert.throws(
        () => bevelEdges(source,
            [edges[0], edges[2], edges[1], edges[3]], () => 0.1),
        error => error.reason === "invalid-topology"
    );
    assert.throws(
        () => bevelEdges(source, edges, () => 1.01),
        error => error.reason === "unsupported-topology"
    );
    assert.throws(
        () => bevelEdges(source, edges, () => NaN),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => bevelEdges(source, edges.map(e => ({
            ...e, owner: Symbol()
        })), () => 0.1),
        error => error.reason === "invalid-input"
    );
    assert.equal(JSON.stringify(source.geometry.vertices), original);
});

test("three adjoining open edges form shared corner seams, not terminated overlaps", () => {
    const source = box();
    const result = bevelEdges(source, topEdges(source).slice(0, 3),
        () => 0.1);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 5);
    assert.equal(result.boundaries["bevel-upper"][0].vertices.length, 4);
    assert.equal(result.boundaries["bevel-lower"][0].vertices.length, 4);
    assert.equal(result.geometry.triangles.filter(f =>
        f.surface === "bevel"
    ).length, 2);
    for (const ref of ["bevel-upper", "bevel-lower"]) {
        const chain = result.boundaries[ref][0];
        assertSelectionOwner(result, chain);
        for (let i = 0; i < chain.vertices.length - 1; i++) {
            assert.equal(topologyOf(result).edgeUses(
                chain.vertices[i], chain.vertices[i + 1]
            ).length, 2);
        }
    }
});

test("a triangular prism cap gets a three-panel bevel without open edges", () => {
    const prism = extrudeContour({
        outer: {
            closed: true,
            points: [
                new THREE.Vector2(-1, -1),
                new THREE.Vector2(-1, 1),
                new THREE.Vector2(1, -1)
            ]
        }
    }, {frame: new THREE.Matrix4(), depth: 1});
    const rim = topologyOf(prism).regionBoundaries("cap-end")[0];
    assert.equal(rim.vertices.length, 3);
    const result = bevelEdges(prism, rim.vertices.map((from, i) => ({
        owner: prism.id,
        from,
        to: rim.vertices[(i + 1) % rim.vertices.length]
    })), () => 0.08);

    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 3);
    assert.equal(result.boundaries["bevel-upper"][0].vertices.length, 3);
    assert.equal(result.boundaries["bevel-lower"][0].vertices.length, 3);
    assert.equal(result.geometry.quads.length, prism.geometry.quads.length + 3);
});

test("one open manifold edge is beveled with closed physical terminal triangles", () => {
    const source = box();
    const edge = topEdges(source)[0];
    const original = source.geometry.vertices.map(point => point.clone());
    const result = bevelEdges(source, [edge], () => 0.12);
    assert.deepEqual(source.geometry.vertices, original);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 3);
    assert.equal(result.geometry.quads.filter(face =>
        face.surface === "bevel"
    ).length, 1);
    assert.equal(result.geometry.triangles.filter(face =>
        face.surface === "bevel"
    ).length, 2);
    assert.equal(result.boundaries["bevel-upper"].length, 1);
    assert.equal(result.boundaries["bevel-upper"][0].closed, false);
    assert.equal(result.boundaries["bevel-lower"][0].closed, false);
    assert.equal(result.boundaries.topRim.length, 1);
    assert.equal(result.boundaries.topRim[0].closed, false);
    assert.equal(result.boundaries.topRim[0].vertices.length, 4);
    assertSelectionOwner(result, result.boundaries.topRim[0]);
    for (const name of ["bevel-upper", "bevel-lower"]) {
        const selected = result.boundaries[name][0];
        assertSelectionOwner(result, selected);
        assert.equal(selected.vertices.length, 2);
        assert.equal(topologyOf(result).edgeUses(
            selected.vertices[0], selected.vertices[1]
        ).length, 2);
    }
    assert.ok(result.patches.top?.length);
    assertSelectionOwner(result, result.patches.top[0]);
});

test("open edge chamfer is invariant to the caller's edge direction", () => {
    const source = box();
    const e = topEdges(source)[0];
    const forward = bevelEdges(source, [e], () => 0.08);
    const reversed = bevelEdges(source, [{
        owner: source.id, from: e.to, to: e.from
    }], () => 0.08);
    assert.equal(topologyOf(reversed).openBoundaries().length, 0);
    assert.equal(reversed.regions.bevel.length, 3);
    assert.equal(forward.geometry.triangles.length,
        reversed.geometry.triangles.length);
});

test("a full top and bottom bevel retain both independent named rings", () => {
    const source = box();
    const bottom = topologyOf(source).regionBoundaries("ny")[0].vertices;
    const rings = [
        ...topEdges(source),
        ...bottom.map((from, i) => ({
            owner: source.id,
            from, to: bottom[(i + 1) % bottom.length]
        }))
    ];
    const distances = [];
    const result = bevelEdges(source, rings, t => {
        distances.push(t);
        return 0.14;
    });
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 8);
    assert.equal(result.boundaries["bevel-upper"].length, 2);
    assert.equal(result.boundaries["bevel-lower"].length, 2);
    assert.deepEqual(distances.map(x => Number(x.toFixed(2))),
        [0, 0.25, 0.5, 0.75, 0, 0.25, 0.5, 0.75]);
    for (const rim of result.boundaries["bevel-upper"]) {
        assertSelectionOwner(result, rim);
    }
});

test("unclosed and shared-corner ring sets do not create partial geometry", () => {
    const source = box();
    const edges = topEdges(source);
    assert.throws(
        () => bevelEdges(source, [
            ...edges, ...edges
        ], () => 0.1),
        error => error.reason === "unsupported-topology"
    );
    assert.throws(
        () => bevelEdges(source, [
            ...edges, ...edges.slice(0, 1)
        ], () => 0.1),
        error => error.reason === "unsupported-topology"
    );
});

test("open chamfer rejects a broken or concave dihedral", () => {
    const source = box();
    const edge = topEdges(source)[0];
    assert.throws(
        () => bevelEdges(source, [edge], () => 2),
        error => error.reason === "unsupported-topology"
    );
});

test("one edge shared by two triangular sheets can be chamfered without touching their outer rims", () => {
    const source = geometryResult({
        vertices: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(2, 0, 0),
            new THREE.Vector3(1, 1, 0),
            new THREE.Vector3(1, 0, 1)
        ],
        quads: [],
        triangles: [
            {
                corners: [0, 1, 2], surface: "first",
                uvs: [
                    new THREE.Vector2(0, 0),
                    new THREE.Vector2(2, 0),
                    new THREE.Vector2(1, 1)
                ]
            },
            {
                corners: [1, 0, 3], surface: "second",
                uvs: [
                    new THREE.Vector2(2, 0),
                    new THREE.Vector2(0, 0),
                    new THREE.Vector2(1, 1)
                ]
            }
        ]
    });
    const before = topologyOf(source).openBoundaries();
    assert.equal(before.length, 1);
    const result = bevelEdges(source, [{
        owner: source.id, from: 0, to: 1
    }], () => 0.12);
    assert.equal(topologyOf(result).openBoundaries().length, 1);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 3);
    assert.ok(result.regions.first.length >= 2);
    assert.ok(result.regions.second.length >= 2);
    for (const id of [0, 1, 2, 3]) {
        assert.ok(result.geometry.vertices[id].equals(source.geometry.vertices[id]));
    }
});

test("an open chamfer survives later subdivision and a capped plane split", () => {
    const source = box();
    const beveled = bevelEdges(source, [topEdges(source)[0]], () => 0.12);
    const rim = beveled.boundaries["bevel-upper"][0].vertices;
    const refined = subdivideEdges(beveled, [{
        edge: {owner: beveled.id, from: rim[0], to: rim[1]},
        t: 0.5
    }]);
    assert.equal(topologyOf(refined).openBoundaries().length, 0);
    assert.equal(refined.boundaries["bevel-upper"][0].vertices.length, 3);

    const partition = splitByPlane(refined, {
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 1, 0)
    }, {cap: true, cutRegion: "cross-section"});
    assert.equal(partition.parts.length, 2);
    assert.equal(partition.interfaces.length, 1);
    for (const part of partition.parts) {
        assert.equal(topologyOf(part).openBoundaries().length, 0);
        assert.equal(topologyOf(part).connectedComponents().length, 1);
        assert.ok(part.regions["cross-section"].length > 0);
    }
});

test("two connected edges use exactly one welded bevel miter at their corner", () => {
    const source = box();
    const chain = topEdges(source).slice(0, 2);
    const sourceVertices = source.geometry.vertices.map(v => v.clone());
    const result = bevelEdges(source, chain, () => 0.14);

    assert.deepEqual(source.geometry.vertices, sourceVertices);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 4);
    assert.equal(result.geometry.quads.filter(face =>
        face.surface === "bevel"
    ).length, 2);
    assert.equal(result.geometry.triangles.filter(face =>
        face.surface === "bevel"
    ).length, 2);
    const upper = result.boundaries["bevel-upper"][0].vertices;
    const lower = result.boundaries["bevel-lower"][0].vertices;
    assert.equal(upper.length, 3);
    assert.equal(lower.length, 3);
    assert.equal(topologyOf(result).edgeUses(upper[1], lower[1]).length, 2);
    assert.ok(result.patches.top?.length);
    assertSelectionOwner(result, result.patches.top[0]);
});

test("connected open chain supports reversed orientation and a varying width", () => {
    const source = box();
    const edges = topEdges(source).slice(0, 2);
    const reverse = [...edges].reverse().map(edge => ({
        owner: edge.owner, from: edge.to, to: edge.from
    }));
    const samples = [];
    const result = bevelEdges(source, reverse, t => {
        samples.push(t);
        return 0.1 + 0.04 * t;
    });
    assert.deepEqual(samples.map(v => Number(v.toFixed(3))),
        [0, 0.5, 1]);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(result.regions.bevel.length, 4);
});

test("an invalid multi-edge corner cannot be joined by independent fake caps", () => {
    const source = box();
    const selected = topEdges(source);
    assert.throws(
        () => bevelEdges(source, [selected[0], selected[2]], () => 0.1),
        error => error.reason === "invalid-topology"
    );
    assert.throws(
        () => bevelEdges(source, [selected[0], selected[1]], () => 1.1),
        error => error.reason === "unsupported-topology"
    );
});

test("two adjacent triangular-prism edges meet at one chamfer corner", () => {
    const source = extrudeContour({
        outer: {
            closed: true,
            points: [
                new THREE.Vector2(-1, -1),
                new THREE.Vector2(-1, 1),
                new THREE.Vector2(1, -1)
            ]
        }
    }, {frame: new THREE.Matrix4(), depth: 1});
    const rim = topologyOf(source).regionBoundaries("cap-end")[0].vertices;
    const edges = rim.slice(0, 2).map((from, index) => ({
        owner: source.id, from, to: rim[index + 1]
    }));
    const result = bevelEdges(source, edges, () => 0.06);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 4);
    assert.equal(result.boundaries["bevel-upper"][0].vertices.length, 3);
    const corner = result.boundaries["bevel-upper"][0].vertices[1];
    const lower = result.boundaries["bevel-lower"][0].vertices[1];
    assert.equal(topologyOf(result).edgeUses(corner, lower).length, 2);
});

function articulatedEdges(source, corners) {
    const indexAt = ([x, y, z]) => {
        const index = source.geometry.vertices.findIndex(v =>
            Math.abs(v.x - x) < 1e-9 &&
            Math.abs(v.y - y) < 1e-9 &&
            Math.abs(v.z - z) < 1e-9
        );
        assert.ok(index >= 0, "Missing authored prism vertex");
        return index;
    };
    const ids = corners.map(indexAt);
    return ids.slice(0, -1).map((from, i) => {
        const to = ids[i + 1];
        assert.equal(topologyOf(source).edgeUses(from, to).length, 2);
        return {owner: source.id, from, to};
    });
}

test("an open chamfer traverses three edges across changing cap faces", () => {
    const source = box();
    const original = source.geometry.vertices.map(v => v.clone());
    const edges = articulatedEdges(source, [
        [-1, 1, 1], [1, 1, 1], [1, -1, 1], [1, -1, -1]
    ]);
    const result = bevelEdges(source, edges, () => 0.12);

    assert.deepEqual(source.geometry.vertices, original);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 5);
    assert.equal(result.geometry.quads.filter(f =>
        f.surface === "bevel"
    ).length, 3);
    assert.equal(result.geometry.triangles.filter(f =>
        f.surface === "bevel"
    ).length, 2);

    assert.equal(result.boundaries["bevel-rails"].length, 6);
    for (const name of ["bevel-upper", "bevel-lower"]) {
        const chain = result.boundaries[name][0];
        assertSelectionOwner(result, chain);
        assert.equal(chain.vertices.length, 4);
        for (let i = 0; i < chain.vertices.length - 1; i++) {
            assert.equal(topologyOf(result).edgeUses(
                chain.vertices[i], chain.vertices[i + 1]
            ).length, 2);
        }
    }
    for (const chain of result.boundaries["bevel-rails"]) {
        assertSelectionOwner(result, chain);
        assert.equal(chain.closed, false);
        assert.equal(chain.vertices.length, 2);
        assert.equal(topologyOf(result).edgeUses(
            chain.vertices[0], chain.vertices[1]
        ).length, 2);
    }
    assert.ok(result.patches.top?.length);
    assertSelectionOwner(result, result.patches.top[0]);

    const surface = toBufferGeometry(
        result,
        Object.fromEntries(Object.keys(result.regions).map(name => [name, 0]))
    );
    try {
        assert.equal(getControlMesh(surface), result.geometry);
    } finally {
        surface.dispose();
    }
});

test("articulated chain in reverse travels through the same physical junctions", () => {
    const source = box();
    const edges = articulatedEdges(source, [
        [-1, 1, 1], [1, 1, 1], [1, -1, 1], [1, -1, -1]
    ]);
    const reversed = edges.slice().reverse().map(edge => ({
        owner: source.id, from: edge.to, to: edge.from
    }));
    const samples = [];
    const result = bevelEdges(source, reversed, t => {
        samples.push(Number(t.toFixed(4)));
        return 0.09 + t * 0.025;
    });
    assert.deepEqual(samples, [0, 1 / 3, 2 / 3, 1]
        .map(x => Number(x.toFixed(4))));
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(result.regions.bevel.length, 5);
});

test("a cross-face bevel remains a sound solid for plane cutting", () => {
    const source = box();
    const edges = articulatedEdges(source, [
        [-1, 1, 1], [1, 1, 1], [1, -1, 1], [1, -1, -1]
    ]);
    const chamfered = bevelEdges(source, edges, () => 0.1);
    const split = splitByPlane(chamfered, {
        point: new THREE.Vector3(0, 0, 0),
        normal: new THREE.Vector3(0, 1, 0)
    }, {cap: true, cutRegion: "section"});
    assert.equal(split.parts.length, 2);
    assert.equal(split.interfaces.length, 1);
    for (const part of split.parts) {
        assert.equal(topologyOf(part).openBoundaries().length, 0);
        assert.equal(topologyOf(part).connectedComponents().length, 1);
    }
});

test("articulated corner rejects a width that collapses one of its rails", () => {
    const source = box();
    const edges = articulatedEdges(source, [
        [-1, 1, 1], [1, 1, 1], [1, -1, 1], [1, -1, -1]
    ]);
    assert.throws(
        () => bevelEdges(source, edges, () => 1.05),
        error => error.reason === "unsupported-topology"
    );
});

function signedVolume(mesh) {
    let volume = 0;
    for (const face of [
        ...mesh.quads,
        ...(mesh.triangles ?? [])
    ]) {
        const ids = face.corners;
        const points = mesh.vertices;
        for (let i = 1; i < ids.length - 1; i++) {
            const a = points[ids[0]];
            const b = points[ids[i]];
            const c = points[ids[i + 1]];
            volume += a.dot(b.clone().cross(c)) / 6;
        }
    }
    return volume;
}

test("four consecutive bevel edges can change their support face three times", () => {
    const source = box();
    const edges = articulatedEdges(source, [
        [-1, 1, 1], [1, 1, 1], [1, -1, 1],
        [1, -1, -1], [-1, -1, -1]
    ]);
    const result = bevelEdges(source, edges, t => 0.08 + t * 0.04);

    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(topologyOf(result).connectedComponents().length, 1);
    assert.equal(result.regions.bevel.length, 6);
    assert.equal(result.boundaries["bevel-rails"].length, 8);
    assert.ok(signedVolume(result.geometry) > 0);
    assert.ok(signedVolume(result.geometry) < signedVolume(source.geometry));

    const panels = result.geometry.quads.filter(face =>
        face.surface === "bevel"
    );
    assert.equal(panels.length, 4);
    for (const panel of panels) {
        const [a, b, c, d] = panel.corners.map(id =>
            result.geometry.vertices[id]
        );
        const n0 = b.clone().sub(a).cross(c.clone().sub(a));
        const n1 = c.clone().sub(a).cross(d.clone().sub(a));
        assert.ok(n0.length() > 1e-9);
        assert.ok(n1.length() > 1e-9);
        assert.ok(n0.dot(n1) > 0);
    }
});

test("articulated bevel cannot repeat a vertex or accept stale edge owners", () => {
    const source = box();
    const loop = articulatedEdges(source, [
        [-1, 1, 1], [1, 1, 1], [1, -1, 1],
        [1, -1, -1], [-1, -1, -1]
    ]);
    assert.throws(
        () => bevelEdges(source, [
            ...loop, {...loop[0], from: loop.at(-1).to,
                to: loop[0].from}
        ], () => 0.1),
        error => error.reason === "invalid-topology" ||
            error.reason === "unsupported-topology"
    );
    assert.throws(
        () => bevelEdges(source, loop.map(edge => ({
            ...edge, owner: Symbol()
        })), () => 0.1),
        error => error.reason === "invalid-input"
    );
});

test("the articulated bevel keeps an existing unrelated upper-rim selection", () => {
    const base = box();
    const unrelated = topologyOf(base).regionBoundaries("nx")[0];
    const source = {
        ...base,
        boundaries: {
            ...base.boundaries,
            "bevel-upper": [unrelated]
        }
    };
    const edges = articulatedEdges(source, [
        [-1, 1, 1], [1, 1, 1], [1, -1, 1],
        [1, -1, -1]
    ]);
    const result = bevelEdges(source, edges, () => 0.1);
    assert.equal(topologyOf(result).openBoundaries().length, 0);
    assert.equal(result.boundaries["bevel-upper"].length, 2);
    assertSelectionOwner(result, result.boundaries["bevel-upper"][0]);
    assertSelectionOwner(result, result.boundaries["bevel-upper"][1]);
});
