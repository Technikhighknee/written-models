import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { sourceModule, toolbox } from "../../support/toolbox.mjs";

const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { capBoundary } = await toolbox(
    "geometry/build/finishBoundaries.ts"
);
const { loftAxialProfile } = await toolbox(
    "geometry/construction/loftAxialProfile.ts"
);
const { profileSpans } = await toolbox(
    "shapes/profiles/profileSpans.ts"
);
const { cooperedStaves } = await sourceModule(
    "models/components/cooperedStaves.ts"
);
const { bulgedProfile } = await toolbox(
    "shapes/profiles/bulged.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);
const { toBufferGeometry } = await toolbox(
    "geometry/mesh/toBufferGeometry.ts"
);

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const sectionFrame = (z = 0) => new THREE.Matrix4()
    .makeTranslation(0, 0, z);

function plankSection(z, rise) {
    return [
        v(-0.11, -0.015 + rise, z),
        v(0.11, -0.015 + rise, z),
        v(0.11, 0.015 + rise, z),
        v(-0.11, 0.015 + rise, z)
    ];
}

test("the real five-section plank uses the same authored side topology", () => {
    const rings = [
        plankSection(-0.6, 0),
        plankSection(-0.3, 0.004),
        plankSection(0, 0.007),
        plankSection(0.3, 0.004),
        plankSection(0.6, 0)
    ];
    let authored = loftSectionWalls(
        rings.map(points => ({
            outer: { points, closed: true }
        })),
        {
            surfaceAt: ({ edge }) => `side-${edge}`,
            smoothingGroupAt: ({ edge }) => `side-${edge}`
        }
    );

    for (const [end, z] of [["start", -0.6], ["end", 0.6]]) {
        authored = capBoundary(
            authored,
            authored.boundaries[`${end}-outer`][0],
            {
                region: `cap-${end}`,
                uvFrame: sectionFrame(z),
                tessellation: "quad-if-planar"
            }
        );
    }

    assert.deepEqual(
        authored.geometry.vertices.map(point => point.toArray()),
        rings.flatMap(row => row.map(point => point.toArray()))
    );
    assert.equal(authored.geometry.quads.length, 18);
    assert.equal(authored.geometry.triangles?.length ?? 0, 0);
    assert.equal(topologyOf(authored).openBoundaries().length, 0);

    for (const region of ["side-0", "side-1", "side-2", "side-3"]) {
        assert.equal(authored.regions[region].length, 4);
    }
});

test("the dagger's steel / oak / iron section boundaries remain authored", () => {
    const stations = profileSpans({
        start: { at: 0.0048, radii: [0.0068, 0.0086] },
        spans: [
            { length: 0.009, to: [0.0109, 0.0122],
                bulge: { radii: [0.0004, 0.0009], peak: 0.77 },
                easing: "out", samples: 4 },
            { length: 0.0972, to: [0.0105, 0.0118],
                surface: "oak", easing: "smooth", samples: 9,
                bulge: { radii: [0.00155, 0.0025], peak: 0.38 } },
            { length: 0.02, to: [0.0086, 0.0094],
                surface: "iron", samples: 7,
                bulge: { radii: [0.0044, 0.0055], peak: 0.57 } }
        ]
    });
    const intervals = [];
    let current = "iron";

    for (let i = 0; i < stations.length - 1; i++) {
        if (stations[i].surface != null) current = stations[i].surface;
        intervals.push(current);
    }

    const rings = stations.map(station => ({
        outer: {
            points: Array.from({ length: 12 }, (_, index) => {
                const angle = 2 * Math.PI * index / 12;

                return v(
                    station.radii[1] * Math.sin(angle),
                    station.at,
                    station.radii[0] * Math.cos(angle)
                );
            }),
            closed: true
        }
    }));

    const authored = loftSectionWalls(rings, {
        surfaceAt: ({ interval }) => intervals[interval],
        smoothingGroupAt: ({ interval }) =>
            intervals[interval] === "oak" ? "carved-oak" : "forged-iron"
    });

    const legacy = loftAxialProfile({
        axis: "y",
        stations,
        surface: "iron",
        smoothing: { oak: "faceted", iron: "smooth" }
    });

    assert.equal(authored.geometry.quads.length, legacy.quads.length);
    assert.deepEqual(
        authored.geometry.quads.map(face => face.surface),
        legacy.quads.map(face => face.surface)
    );
    assert.ok(authored.regions.iron.length > 0);
    assert.ok(authored.regions.oak.length > 0);
    assert.equal(topologyOf(authored).openBoundaries().length, 2);
});

test("twenty-four barrel staves keep sparse inner rows and closed end grain", () => {
    const profile = bulgedProfile({
        height: 0.78,
        bottomDiameter: 0.52,
        topDiameter: 0.52,
        peakDiameter: 0.60,
        points: 9,
        curve: "quadratic"
    });

    const staves = cooperedStaves(profile, {
        count: 24,
        thickness: 0.024,
        edgeRoundover: 0.0022
    });

    assert.equal(staves.length, 24);

    for (const stave of staves) {
        const mesh = stave.geometry;

        assert.equal(mesh.vertices.length, 9 * 7);
        assert.equal(mesh.quads.length, 8 * 7);
        assert.equal(mesh.triangles.length, 10);
        assert.equal(topologyOf(stave).openBoundaries().length, 0);
        assert.ok(mesh.quads.some(face => face.surface === "outer"));
        assert.ok(mesh.quads.some(face => face.surface === "inner"));
    }
});

test("the tankard handle survives the new sweep and both real stave mounts", async () => {
    const { buildTankardGeometry } = await sourceModule("models/beerMug.ts");
    const pieces = buildTankardGeometry();

    assert.equal(pieces.staves.length, 12);
    assert.equal(pieces.bands.length, 2);
    assert.equal(pieces.handle.geometry.vertices.length, 19 * 8);
    assert.equal(pieces.handle.geometry.quads.length, 18 * 8);
    assert.equal(pieces.handle.geometry.triangles.length, 12);

    assert.equal(topologyOf(pieces.handle).openBoundaries().length, 0);
    assert.ok(pieces.handle.regions["cap-start"].length > 0);
    assert.ok(pieces.handle.regions["cap-end"].length > 0);

    const geometry = toBufferGeometry(pieces.handle, {
        side: 0, "cap-start": 1, "cap-end": 1
    });

    try {
        assert.equal(getControlOutline(geometry).quadCount, 18 * 8);
    } finally {
        geometry.dispose();
    }
});
