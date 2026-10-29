import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { cavitySectionsFromSurfaces } = await toolbox(
    "geometry/queries/cavitySectionsFromSurfaces.ts"
);
const { samplePolarStripSections } = await toolbox(
    "geometry/build/samplePolarStripSections.ts"
);
const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { ProfiledCavity, cavityFromMeshSurfaces } = await toolbox(
    "geometry/construction/profiledCavity.ts"
);
const { radialStaves } = await toolbox(
    "geometry/construction/radialStaves.ts"
);

const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const uv = (x, y) => new THREE.Vector2(x, y);

function staves(count = 12, rows = [0, 0.3, 0.65, 1]) {
    const meridian = rows.map(y => ({
        x: 0.47 + 0.035 * Math.sin(Math.PI * y),
        y
    }));
    const sections = samplePolarStripSections({
        meridian,
        count,
        outerStations: [0, 0.05, 0.5, 0.95, 1],
        innerStations: [0, 1],
        outerRadiusAt: radius => radius,
        innerRadiusAt: radius => radius - 0.009
    });

    return sections.map(section => ({
        geometry: loftSectionWalls(section, {
            surfaceAt: ({ edge }) =>
                edge === 5 ? "inner" : "outer"
        }).geometry,
        localToWorld: new THREE.Matrix4(),
        regions: ["inner"]
    }));
}

function options(pieces, heights, sectionFrame = new THREE.Matrix4()) {
    return { pieces, heights, sectionFrame };
}

function pointClose(a, b, tolerance = 1e-9) {
    return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

test("twelve separate stave surfaces reconstruct one volume without a circle guess", () => {
    const pieces = staves();
    const heights = [0, 0.15, 0.3, 0.45, 0.65, 0.825, 1];
    const rings = cavitySectionsFromSurfaces(options(pieces, heights));
    assert.equal(rings.length, heights.length);
    assert.deepEqual(rings.map(ring => ring.y), heights);
    assert.ok(rings.every(ring => ring.outline.length === 12));
    assert.ok(rings.every(ring => ring.outline.every(p =>
        Number.isFinite(p.x) && Number.isFinite(p.y)
    )));

    // The actual faceted loft has the same twelve longitudinal stations,
    // including the intermediate Y sections (no freshly sorted circles).
    for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        const width = ring.outline[0].length();
        assert.ok(width > 0.45 && width < 0.51);
        assert.ok(ring.outline.every(p =>
            Math.abs(p.length() - width) < 1e-9
        ));
    }

    const cavity = new ProfiledCavity(rings);
    assert.ok(cavity.capacity > 0.4);
    assert.ok(cavity.volumeAt(0.5) > 0);
    assert.ok(cavity.volumeAt(0.5) < cavity.capacity);
    for (const fraction of [0.1, 0.25, 0.5, 0.9]) {
        const level = cavity.heightAtFill(fraction);
        assert.ok(Math.abs(
            cavity.volumeAt(level) / cavity.capacity - fraction
        ) < 1e-8);
    }

    const later = cavitySectionsFromSurfaces(options(
        pieces.slice().reverse(), heights
    ));
    for (let row = 0; row < heights.length; row++) {
        const first = rings[row].outline;
        const second = later[row].outline;

        assert.equal(second.length, first.length);
        first.forEach((point, index) =>
            assert.ok(pointClose(point, second[index], 1e-12))
        );
    }
});

test("world placements and a reflected section frame return section-local rings", () => {
    const pieces = staves(8, [0, 0.5, 1]);
    const frame = new THREE.Matrix4().makeRotationZ(0.32)
        .multiply(new THREE.Matrix4().makeScale(-1, 1, 1))
        .setPosition(12, -8, 3);
    const mounted = pieces.map(piece => ({
        ...piece,
        localToWorld: frame.clone()
    }));
    const rings = cavitySectionsFromSurfaces(
        options(mounted, [0, 0.25, 0.5, 0.75, 1], frame)
    );

    assert.equal(rings.length, 5);
    assert.ok(rings.every(ring => ring.outline.length === 8));
    assert.deepEqual(rings.map(r => r.y),
        [0, 0.25, 0.5, 0.75, 1]);
});

test("missing and duplicated stave seams reject incomplete cavity loops", () => {
    const pieces = staves(8, [0, 0.5, 1]);

    assert.throws(
        () => cavitySectionsFromSurfaces(
            options(pieces.slice(1), [0, 0.5, 1])
        ),
        error => error.reason === "invalid-topology"
    );

    assert.throws(
        () => cavitySectionsFromSurfaces(
            options([...pieces, pieces[0]], [0, 0.25, 0.5, 1])
        ),
        error => error.reason === "invalid-topology"
    );
});

test("intermediate slices catch deformed seams that agree at the authored ends", () => {
    const first = staves(8, [0, 0.5, 1]);
    const modified = first.map(piece => ({
        ...piece,
        geometry: {
            ...piece.geometry,
            vertices: piece.geometry.vertices.map(point => point.clone())
        }
    }));

    // Shift a selected inner-wall station in only one stave.
    // The row at the middle height is shared by its neighboring strips.
    const mesh = modified[0].geometry;
    const inner = mesh.quads.find(face => face.surface === "inner");
    assert.ok(inner);
    const vertex = inner.corners[0];
    mesh.vertices[vertex].x += 0.01;

    assert.throws(
        () => cavitySectionsFromSurfaces(
            options(modified, [0, 0.25, 0.5, 0.75, 1])
        ),
        error => [
            "invalid-topology", "unsupported-topology",
            "self-intersection"
        ].includes(error.reason)
    );
});

test("non-planar wall quads cannot silently lose diagonal section crossings", () => {
    const wall = {
        geometry: {
            vertices: [
                vec(0, 0, 0), vec(1, 0, 0),
                vec(1, 1, 0.2), vec(0, 1, 0)
            ],
            quads: [{
                corners: [0, 1, 2, 3],
                uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
                surface: "inner"
            }]
        },
        localToWorld: new THREE.Matrix4(),
        regions: ["inner"]
    };

    assert.throws(
        () => cavitySectionsFromSurfaces(options(
            [wall], [0, 0.5, 1]
        )),
        error => error.operation === "cavitySectionsFromSurfaces" &&
            error.reason === "unsupported-topology"
    );
});

test("explicit height order and rigid section frames are enforced", () => {
    const pieces = staves(8);

    assert.throws(
        () => cavitySectionsFromSurfaces(options(
            pieces, [0, 0.7, 0.7, 1]
        )),
        error => error.reason === "invalid-input"
    );
    assert.throws(
        () => cavitySectionsFromSurfaces(options(
            pieces, [0, 1],
            new THREE.Matrix4().makeScale(2, 1, 1)
        )),
        error => error.reason === "invalid-input"
    );
});

test("the existing wooden mug's inner faces agree with its physical cavity", () => {
    const profile = [
        uv(0.047, 0),
        uv(0.0515, 0.071),
        uv(0.049, 0.152)
    ];
    const pieces = radialStaves(profile, {
        count: 12,
        thickness: 0.008,
        edgeRoundover: 0.0008,
        innerWidthSamples: [0, 1],
        angleOffset: Math.PI / 2 - Math.PI / 12
    });

    const sections = cavitySectionsFromSurfaces(options(
        pieces.map(geometry => ({
            geometry,
            regions: ["inner"],
            localToWorld: new THREE.Matrix4()
        })),
        [0, 0.0355, 0.071, 0.1115, 0.152]
    ));

    const cavity = new ProfiledCavity(sections);
    const previous = cavityFromMeshSurfaces(pieces);

    assert.ok(cavity.capacity > 0);
    assert.ok(Math.abs(cavity.capacity - previous.capacity) < 1e-10);
    assert.ok(Math.abs(
        cavity.heightAtFill(0.9) - previous.heightAtFill(0.9)
    ) < 1e-9);
    assert.equal(sections[0].outline.length, 12);
    assert.equal(sections.at(-1).outline.length, 12);
});

test("interpolation rejects a brief ring collapse missed at the midpoint", () => {
    const lower = [
        uv(-1, -1), uv(1, -1),
        uv(1, 1), uv(-1, 1)
    ];
    const upper = lower.map(p => uv(-2 * p.x, -2 * p.y));
    const pieces = lower.map((start, index) => {
        const next = (index + 1) % lower.length;
        return {
            geometry: {
                vertices: [
                    vec(start.x, 0, start.y),
                    vec(lower[next].x, 0, lower[next].y),
                    vec(upper[next].x, 1, upper[next].y),
                    vec(upper[index].x, 1, upper[index].y)
                ],
                quads: [{
                    corners: [0, 1, 2, 3],
                    uvs: [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)],
                    surface: "inner"
                }]
            },
            regions: ["inner"],
            localToWorld: new THREE.Matrix4()
        };
    });

    assert.throws(
        () => cavitySectionsFromSurfaces(options(pieces, [0, 1])),
        error => error.operation === "cavitySectionsFromSurfaces" &&
            ["degenerate-geometry", "self-intersection"].includes(error.reason)
    );
});
