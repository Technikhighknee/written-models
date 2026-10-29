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
