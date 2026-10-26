import assert from "node:assert/strict";
import * as THREE from "three";
import { createServer } from "vite";

// Vite's SSR loader runs the actual TypeScript modules without requiring a
// separate test runner or adding dependencies to the project.
const server = await createServer({
    configFile: false,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom"
});

try {
    const { extrude } = await server.ssrLoadModule(
        "/src/toolbox/shapes/operations/extrude.ts"
    );
    const { getControlMesh } = await server.ssrLoadModule(
        "/src/toolbox/geometry/mesh/toBufferGeometry.ts"
    );
    const { getControlOutline } = await server.ssrLoadModule(
        "/src/toolbox/geometry/mesh/controlOutline.ts"
    );
    const { assignExtrudedTimberSurfaces } = await server.ssrLoadModule(
        "/src/toolbox/geometry/materials/assignExtrudedTimberSurfaces.ts"
    );

    function check(shape, options, label) {
        const geometry = extrude(shape, options);
        const mesh = getControlMesh(geometry);
        const outline = getControlOutline(geometry);
        assert.ok(mesh, `${label}: missing construction mesh`);
        assert.ok(outline, `${label}: missing control outline`);
        assert.equal(outline.quadCount, mesh.quads.length);
        assert.ok(mesh.quads.length > 0, `${label}: no side quads`);
        assert.ok(mesh.triangles.length > 0, `${label}: no cap triangles`);

        // A solid mesh must have two incident faces on EVERY edge.
        // This detects holes, T-junctions and forgotten cap boundaries.
        const edges = new Map();
        for (const face of [...mesh.quads, ...mesh.triangles]) {
            for (let i = 0; i < face.corners.length; i++) {
                const a = face.corners[i];
                const b = face.corners[(i + 1) % face.corners.length];
                assert.notEqual(a, b, `${label}: collapsed face edge`);
                const key = a < b ? `${a}:${b}` : `${b}:${a}`;
                const sign = a < b ? 1 : -1;
                const edge = edges.get(key) ?? { count: 0, direction: 0 };
                edge.count++;
                edge.direction += sign;
                edges.set(key, edge);
            }
        }
        for (const [key, edge] of edges) {
            assert.equal(edge.count, 2, `${label}: edge ${key} has ${edge.count} faces`);
            assert.equal(edge.direction, 0, `${label}: edge ${key} has inconsistent winding`);
        }

        const triangles = mesh.quads.length * 2 + mesh.triangles.length;
        assert.equal(geometry.index.count / 3, triangles);
        assert.equal(geometry.getAttribute("position").count > 0, true);
        for (const attributeName of ["position", "normal", "uv"]) {
            const attribute = geometry.getAttribute(attributeName);
            for (let i = 0; i < attribute.count; i++) {
                for (let j = 0; j < attribute.itemSize; j++) {
                    assert.ok(
                        Number.isFinite(attribute.getComponent(i, j)),
                        `${label}: invalid ${attributeName}`
                    );
                }
            }
        }

        const bounds = geometry.boundingBox;
        assert.ok(bounds, `${label}: missing bounds`);
        assert.ok(
            Math.abs(bounds.max.y - bounds.min.y - options.thickness) < 1e-5,
            `${label}: thickness differs from requested dimensions`
        );

        const oldQuadCount = outline.quadCount;
        assignExtrudedTimberSurfaces(geometry, { x: 1, y: 0, z: 0 });
        assert.equal(
            getControlOutline(geometry).quadCount,
            oldQuadCount,
            `${label}: material assignment lost construction faces`
        );
        geometry.dispose();
        console.log(`${label}: ${mesh.quads.length} quads, ${mesh.triangles.length} cap triangles`);
    }

    const rectangle = new THREE.Shape();
    rectangle.moveTo(-1, -0.5);
    rectangle.lineTo(-1, 0.5);
    rectangle.lineTo(1, 0.5);
    rectangle.lineTo(1, -0.5);
    rectangle.closePath();

    check(rectangle, { thickness: 0.14, curveSegments: 1 }, "rectangle");

    // Earcut can skip this perfectly valid intermediate outline station.
    // The cap must still meet BOTH shorter sidewall edges, without a T-junction.
    const collinear = new THREE.Shape();
    collinear.moveTo(-1, -0.5);
    collinear.lineTo(-1, 0);
    collinear.lineTo(-1, 0.5);
    collinear.lineTo(1, 0.5);
    collinear.lineTo(1, -0.5);
    collinear.closePath();
    check(collinear, { thickness: 0.14, curveSegments: 1 }, "collinear stations");
    check(rectangle, {
        thickness: 0.14,
        bevel: { size: 0.02, thickness: 0.01 },
        curveSegments: 1
    }, "bevelled rectangle");

    const rounded = new THREE.Shape();
    rounded.absarc(0, 0, 1, 0, 2 * Math.PI, false);
    rounded.closePath();
    check(rounded, {
        thickness: 0.04,
        bevel: { size: 0.004, thickness: 0.003 },
        curveSegments: 8
    }, "curved outline");

    const withHole = new THREE.Shape();
    withHole.moveTo(-1, -1);
    withHole.lineTo(-1, 1);
    withHole.lineTo(1, 1);
    withHole.lineTo(1, -1);
    withHole.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-0.3, -0.3);
    hole.lineTo(0.3, -0.3);
    hole.lineTo(0.3, 0.3);
    hole.lineTo(-0.3, 0.3);
    hole.closePath();
    withHole.holes.push(hole);
    check(withHole, { thickness: 0.08, curveSegments: 1 }, "hole");
    check(withHole, {
        thickness: 0.08,
        bevel: { size: 0.005, thickness: 0.004 },
        curveSegments: 1
    }, "bevelled hole");

    console.log("Extrusion topology checks passed.");
} finally {
    await server.close();
}
