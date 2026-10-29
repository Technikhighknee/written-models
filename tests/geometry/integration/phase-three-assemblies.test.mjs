import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { toolbox } from "../../support/toolbox.mjs";

const { correspondContours } = await toolbox(
    "geometry/build/correspondContours.ts"
);
const { loftSectionWalls } = await toolbox(
    "geometry/build/loftSectionWalls.ts"
);
const { fillSurfacePatch } = await toolbox(
    "geometry/build/fillSurfacePatch.ts"
);
const { joinGeometry } = await toolbox(
    "geometry/build/joinGeometry.ts"
);
const { topologyOf } = await toolbox(
    "geometry/kernel/topology.ts"
);
const { partitionContour } = await toolbox(
    "geometry/build/partitionContour.ts"
);
const { samplePartition } = await toolbox(
    "geometry/build/samplePartition.ts"
);
const { bridgeBoundaries } = await toolbox(
    "geometry/build/bridgeBoundaries.ts"
);
const { shapeSurfaceRelief } = await toolbox(
    "geometry/edit/shapeSurfaceRelief.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

const p = (x, y, z = 0) => new THREE.Vector3(x, y, z);

function chart(z, direction) {
    return {
        at: uv => p(uv.x, uv.y, z),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: () => p(0, 0, direction)
    };
}

function notchedSeatContour(z, postFace) {
    return {
        closed: true,
        points: [
            p(-0.23, 0.12, z),
            p(0.23, 0.12, z),
            p(0.23, postFace, z),
            p(0.16, postFace, z),
            p(0.16, -0.10, z),
            p(-0.16, -0.10, z),
            p(-0.16, postFace, z),
            p(-0.23, postFace, z)
        ]
    };
}

function patchFromContour(contour, stations, surfaceChart, region) {
    return fillSurfacePatch({
        profile: {
            outer: {
                points: contour.points.map(point =>
                    surfaceChart.parameterOf(point)
                ),
                parameters: stations
            }
        },
        chart: surfaceChart,
        region
    });
}

test("raked chair housings retain their distinct top and bottom corners", () => {
    const top = notchedSeatContour(0.038, 0.015);
    const bottom = notchedSeatContour(0, 0.035);
    const marks = [
        "front-left", "front-right", "right-post-outer",
        "right-housing", "rear-right", "rear-left",
        "left-housing", "left-post-outer"
    ];
    const matched = correspondContours(top, bottom, marks.map(
        (id, index) => ({ id, first: index, second: index })
    ));

    const walls = loftSectionWalls([
        { outer: matched.first },
        { outer: matched.second }
    ], { outerRegion: "end-grain" });

    const upper = patchFromContour(
        matched.first, matched.stations,
        chart(0.038, 1), "upper"
    );
    const lower = patchFromContour(
        matched.second, matched.stations,
        chart(0, -1), "underside"
    );
    const solid = joinGeometry([walls, upper, lower], {
        weld: [{
            firstPart: 0,
            first: walls.boundaries["start-outer"][0],
            secondPart: 1,
            second: upper.boundaries.outer[0]
        }, {
            firstPart: 0,
            first: walls.boundaries["end-outer"][0],
            secondPart: 2,
            second: lower.boundaries.outer[0]
        }]
    });

    assert.equal(topologyOf(solid).openBoundaries().length, 0);
    assert.equal(topologyOf(solid).connectedComponents().length, 1);
    assert.ok(solid.geometry.quads.length >= 8);
    assert.ok(solid.regions.upper.length > 0);
    assert.ok(solid.regions.underside.length > 0);

    const topCorner = matched.first.points[3];
    const bottomCorner = matched.second.points[3];
    assert.equal(topCorner.y, 0.015);
    assert.equal(bottomCorner.y, 0.035);
    assert.ok(solid.geometry.vertices.some(v => v.equals(topCorner)));
    assert.ok(solid.geometry.vertices.some(v => v.equals(bottomCorner)));

    const material = new THREE.MeshBasicMaterial();
    const mesh = surfaceMesh({
        name: "RakedSeatHousing",
        geometry: solid,
        materials: material
    });
    try {
        assert.equal(
            getControlOutline(mesh.geometry).quadCount,
            solid.geometry.quads.length
        );
    } finally {
        mesh.geometry.dispose();
        material.dispose();
    }
});

function disk(radius, sides) {
    return Array.from({ length: sides }, (_, index) => {
        const angle = Math.PI * 2 * (sides - index) / sides;
        return new THREE.Vector2(
            radius * Math.cos(angle),
            radius * Math.sin(angle)
        );
    });
}

function diskSeam(points, x, id) {
    const hits = [];

    for (let index = 0; index < points.length; index++) {
        const from = points[index];
        const to = points[(index + 1) % points.length];

        if ((from.x < x && to.x > x) || (from.x > x && to.x < x)) {
            const fraction = (x - from.x) / (to.x - from.x);
            hits.push(from.clone().lerp(to, fraction));
        }
    }

    hits.sort((a, b) => a.y - b.y);
    assert.equal(hits.length, 2);
    return { id, points: hits };
}

function headCharts(radius, thickness, crown = 0.001) {
    return {
        outer: {
            at: uv => p(
                uv.x, uv.y,
                thickness + crown * (1 - (uv.x / radius) ** 2)
            ),
            parameterOf: point => new THREE.Vector2(point.x, point.y),
            normalAt: uv => p(
                2 * crown * uv.x / (radius * radius), 0, 1
            ).normalize()
        },
        inner: chart(0, -1)
    };
}

function layeredPiece(sampled, outerChart, innerChart, outerRegion) {
    const top = fillSurfacePatch({
        profile: sampled, chart: outerChart, region: outerRegion
    });
    const bottom = fillSurfacePatch({
        profile: sampled, chart: innerChart, region: "inner"
    });
    const wall = bridgeBoundaries({
        points: sampled.outer.points.map(uv => outerChart.at(uv)),
        closed: true
    }, {
        points: sampled.outer.points.map(uv => innerChart.at(uv)),
        closed: true
    }, {
        fromStations: sampled.outer.parameters,
        toStations: sampled.outer.parameters,
        region: "end-grain",
        reverseWinding: true
    });

    return { top, bottom, wall };
}

function weldLayered({ top, bottom, wall }) {
    return joinGeometry([top, bottom, wall], {
        weld: [{
            firstPart: 0,
            first: top.boundaries.outer[0],
            secondPart: 2,
            second: wall.boundaries.from[0]
        }, {
            firstPart: 1,
            first: bottom.boundaries.outer[0],
            secondPart: 2,
            second: wall.boundaries.to[0]
        }]
    });
}

test("five barrel head planks keep exact seams and independently detailed faces", () => {
    const radius = 0.46;
    const circle = disk(radius, 32);
    const cuts = [-0.30, -0.11, 0.14, 0.32].map(
        (x, index) => diskSeam(circle, x, `joint-${index}`)
    );
    const layout = samplePartition(
        partitionContour({
            outer: { points: circle, closed: true }
        }, cuts), Object.fromEntries(cuts.map(
            cut => [cut.id, [0, 0.25, 0.5, 0.75, 1]]
        ))
    );

    assert.equal(layout.parts.length, 5);
    assert.equal(layout.interfaces.length, 4);

    const head = [];
    const { outer, inner } = headCharts(radius, 0.02);

    for (const sampled of layout.parts) {
        const piece = weldLayered(layeredPiece(
            sampled, outer, inner, "outer"
        ));
        const topology = topologyOf(piece);

        assert.equal(topology.openBoundaries().length, 0);
        assert.equal(topology.connectedComponents().length, 1);
        assert.ok(piece.regions.outer.length > 0);
        assert.ok(piece.regions.inner.length > 0);
        assert.ok(piece.regions["end-grain"].length > 0);
        head.push(piece);
    }

    for (const seam of layout.interfaces) {
        const first = layout.parts[seam.firstPart].outer.points;
        const second = layout.parts[seam.secondPart].outer.points;

        for (const point of seam.points) {
            assert.ok(first.some(vertex => vertex.equals(point)));
            assert.ok(second.some(vertex => vertex.equals(point)));
        }
    }

    const material = new THREE.MeshBasicMaterial();
    for (let index = 0; index < head.length; index++) {
        const result = head[index];
        const mesh = surfaceMesh({
            name: `HeadBoard${index + 1}`,
            geometry: result,
            materials: material
        });
        try {
            assert.equal(
                getControlOutline(mesh.geometry).quadCount,
                result.geometry.quads.length
            );
            assert.ok(mesh.geometry.getAttribute("uv").count > 0);
        } finally {
            mesh.geometry.dispose();
        }
    }
    material.dispose();
});
