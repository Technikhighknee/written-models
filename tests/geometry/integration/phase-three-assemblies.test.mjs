import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import { sourceModule } from "../../support/toolbox.mjs";

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
const { transformGeometry } = await toolbox(
    "geometry/edit/geometryEdits.ts"
);
const { surfaceMesh } = await toolbox(
    "geometry/mesh/surfaceMesh.ts"
);
const { getControlOutline } = await toolbox(
    "geometry/mesh/controlOutline.ts"
);

const { prepareRuntimeModel } = await sourceModule(
    "core/export/prepareRuntimeModel.ts"
);

class BinaryFileReader {
    result = null;
    onloadend = null;

    async readAsArrayBuffer(blob) {
        this.result = await blob.arrayBuffer();
        this.onloadend?.();
    }
}

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

test("five barrel head planks keep exact seams and export distinct materials", async () => {
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

    let detailedPart = -1;

    for (const [index, sampled] of layout.parts.entries()) {
        const assembly = layeredPiece(sampled, outer, inner, "outer");
        const seams = layout.interfaces.filter(seam =>
            seam.firstPart === index || seam.secondPart === index
        );

        if (detailedPart === -1 && seams.length === 2) {
            const centerX = sampled.outer.points.reduce(
                (sum, point) => sum + point.x, 0
            ) / sampled.outer.points.length;

            const features = seams.map(seam => {
                const middleX = seam.points[0].x;
                const inward = centerX > middleX ? 1 : -1;

                return {
                    path: {
                        points: seam.points.slice(1, -1).map(point =>
                            outer.at(new THREE.Vector2(
                                point.x + inward * 0.018, point.y
                            ))
                        ),
                        parameters: [0, 0.5, 1],
                        closed: false
                    },
                    halfWidthAt: () => 0.008,
                    displacementAt: (u, t) =>
                        -0.0024 * (1 - u * u) * Math.sin(Math.PI * t),
                    regionAt: u => Math.abs(u) < 0.5
                        ? "groove-floor" : "groove-shoulder"
                };
            });

            assembly.top = shapeSurfaceRelief(
                assembly.top, assembly.top.patches.outer[0],
                features, { overlap: "minimum", maxDeviation: 0.001 }
            );
            assert.ok(assembly.top.geometry.triangles.length >
                assembly.bottom.geometry.triangles.length);
            detailedPart = index;
        }

        const piece = weldLayered(assembly);
        const topology = topologyOf(piece);

        assert.equal(topology.openBoundaries().length, 0);
        assert.equal(topology.connectedComponents().length, 1);
        assert.ok(piece.regions.outer.length > 0);
        assert.ok(piece.regions.inner.length > 0);
        assert.ok(piece.regions["end-grain"].length > 0);
        head.push(piece);
    }

    assert.notEqual(detailedPart, -1);
    assert.ok(head[detailedPart].regions["groove-floor"].length > 0);
    assert.ok(head[detailedPart].regions["groove-shoulder"].length > 0);

    for (const seam of layout.interfaces) {
        const first = layout.parts[seam.firstPart].outer.points;
        const second = layout.parts[seam.secondPart].outer.points;

        for (const point of seam.points) {
            assert.ok(first.some(vertex => vertex.equals(point)));
            assert.ok(second.some(vertex => vertex.equals(point)));
        }
    }

    const materials = Object.fromEntries([
        ["outer", "#916b42"],
        ["inner", "#755334"],
        ["end-grain", "#65472e"],
        ["groove-floor", "#4a3021"],
        ["groove-shoulder", "#85603c"]
    ].map(([region, color]) => [
        region,
        new THREE.MeshStandardMaterial({
            name: `head-${region}`,
            color,
            vertexColors: true
        })
    ]));
    const group = new THREE.Group();

    for (let index = 0; index < head.length; index++) {
        const result = head[index];
        const mesh = surfaceMesh({
            name: `HeadBoard${index + 1}`,
            geometry: result,
            materials,
            tint: new THREE.Color().setScalar(0.94 + index * 0.01)
        });

        assert.equal(
            getControlOutline(mesh.geometry).quadCount,
            result.geometry.quads.length
        );
        assert.ok(mesh.geometry.getAttribute("uv").count > 0);
        group.add(mesh);
    }

    const runtime = prepareRuntimeModel(group);
    const scene = new THREE.Scene();
    scene.add(runtime.root);
    const reader = globalThis.FileReader;
    globalThis.FileReader = BinaryFileReader;

    try {
        const bytes = await new GLTFExporter().parseAsync(
            scene, { binary: true }
        );
        assert.ok(bytes instanceof ArrayBuffer);

        const header = new DataView(bytes);
        assert.equal(header.getUint32(0, true), 0x46546c67);

        const json = JSON.parse(new TextDecoder().decode(
            new Uint8Array(bytes, 20, header.getUint32(12, true))
        ).trim());
        const names = new Set((json.materials ?? []).map(m => m.name));
        const primitives = (json.meshes ?? []).flatMap(mesh => mesh.primitives);

        for (const region of [
            "outer", "inner", "end-grain",
            "groove-floor", "groove-shoulder"
        ]) {
            assert.ok(names.has(`head-${region}`),
                JSON.stringify({ materials: json.materials, meshes: json.meshes?.length }));
        }
        assert.ok(primitives.length > 1);
        assert.ok(primitives.some(primitive =>
            primitive.attributes.TEXCOORD_0 !== undefined &&
            primitive.attributes.COLOR_0 !== undefined
        ));
    } finally {
        runtime.dispose();

        if (reader === undefined) delete globalThis.FileReader;
        else globalThis.FileReader = reader;

        for (const mesh of group.children) mesh.geometry.dispose();
        for (const material of Object.values(materials)) material.dispose();
    }
});

function tabletopCrown() {
    const halfWidth = 0.55;
    const crown = 0.0012;

    return {
        at: uv => p(
            uv.x, uv.y,
            0.046 + crown * (1 - (uv.y / halfWidth) ** 2)
        ),
        parameterOf: point => new THREE.Vector2(point.x, point.y),
        normalAt: uv => p(
            0, 2 * crown * uv.y / (halfWidth * halfWidth), 1
        ).normalize()
    };
}

function sharedTableCut(y, index) {
    const x = [-0.9, -0.45, 0, 0.45, 0.9];
    const wander = [0, 0.002, -0.003, 0.003, 0];

    return {
        id: `seam-${index}`,
        points: x.map((station, i) =>
            new THREE.Vector2(station, y + wander[i] * (index % 2 ? -1 : 1))
        )
    };
}

test("four hand-fitted tabletop boards preserve matching worn seams and gaps", () => {
    const cuts = [-0.30, 0.01, 0.29].map(sharedTableCut);
    const layout = samplePartition(partitionContour({
        outer: {
            closed: true,
            points: [
                new THREE.Vector2(-0.9, -0.55),
                new THREE.Vector2(-0.9, 0.55),
                new THREE.Vector2(0.9, 0.55),
                new THREE.Vector2(0.9, -0.55)
            ]
        }
    }, cuts));

    assert.equal(layout.parts.length, 4);
    assert.equal(layout.interfaces.length, 3);

    const crown = tabletopCrown();
    const underside = chart(0, -1);
    const boards = [];
    const centers = [];
    let wornIndex = -1;

    for (const [index, sampled] of layout.parts.entries()) {
        const assembly = layeredPiece(sampled, crown, underside, "top");
        const seams = layout.interfaces.filter(seam =>
            seam.firstPart === index || seam.secondPart === index
        );

        if (wornIndex === -1 && seams.length === 2) {
            const centerY = sampled.outer.points.reduce(
                (sum, point) => sum + point.y, 0
            ) / sampled.outer.points.length;
            const features = seams.map(seam => {
                const meanY = seam.points.reduce(
                    (sum, point) => sum + point.y, 0
                ) / seam.points.length;
                const inward = centerY > meanY ? 1 : -1;

                return {
                    path: {
                        points: seam.points.slice(1, -1).map(point =>
                            crown.at(new THREE.Vector2(
                                point.x, point.y + inward * 0.012
                            ))
                        ),
                        parameters: [0, 0.5, 1],
                        closed: false
                    },
                    halfWidthAt: () => 0.006,
                    displacementAt: (u, t) =>
                        -0.0016 * (1 - u * u) * Math.sin(Math.PI * t),
                    regionAt: u => Math.abs(u) < 0.5
                        ? "worn-seam" : "worn-shoulder"
                };
            });

            assembly.top = shapeSurfaceRelief(
                assembly.top, assembly.top.patches.top[0],
                features, { overlap: "minimum", maxDeviation: 0.0008 }
            );
            wornIndex = index;
        }

        const result = weldLayered(assembly);
        assert.equal(topologyOf(result).openBoundaries().length, 0);
        assert.equal(topologyOf(result).connectedComponents().length, 1);
        assert.ok(result.regions.top.length > 0);
        assert.ok(result.regions.inner.length > 0);
        assert.ok(result.regions["end-grain"].length > 0);

        centers.push(sampled.outer.points.reduce(
            (sum, point) => sum + point.y, 0
        ) / sampled.outer.points.length);
        boards.push(result);
    }

    assert.notEqual(wornIndex, -1);
    assert.ok(boards[wornIndex].regions["worn-seam"].length > 0);
    assert.ok(boards[wornIndex].regions["worn-shoulder"].length > 0);

    for (const seam of layout.interfaces) {
        const first = layout.parts[seam.firstPart].outer.points;
        const second = layout.parts[seam.secondPart].outer.points;

        for (const point of seam.points) {
            assert.ok(first.some(vertex => vertex.equals(point)));
            assert.ok(second.some(vertex => vertex.equals(point)));
        }
    }

    // Gap is model assembly clearance, never a hidden mutation of the
    // common source stations defining the mating edges.
    const order = centers.map((_, i) => i)
        .sort((a, b) => centers[a] - centers[b]);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true });

    for (const [rank, index] of order.entries()) {
        const separated = transformGeometry(
            boards[index], new THREE.Matrix4().makeTranslation(
                0, rank * 0.0025, 0
            )
        );
        const mesh = surfaceMesh({
            name: `TablePlank${index + 1}`,
            geometry: separated,
            materials: material,
            tint: new THREE.Color().setScalar(0.95 + rank * 0.01)
        });
        try {
            assert.equal(getControlOutline(mesh.geometry).quadCount,
                separated.geometry.quads.length);
            assert.equal(mesh.geometry.getAttribute("color").count,
                mesh.geometry.getAttribute("position").count);
            assert.ok(mesh.geometry.getAttribute("uv").count > 0);
        } finally {
            mesh.geometry.dispose();
        }
    }

    material.dispose();
});
