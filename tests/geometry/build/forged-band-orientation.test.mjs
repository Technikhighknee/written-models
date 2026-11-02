import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { sourceModule } from "../../support/toolbox.mjs";

const { forgedBand } = await sourceModule("models/components/forgedBand.ts");

const stock = [
    new THREE.Vector2(0.1, 0),
    new THREE.Vector2(0.1, 0.2)
];

/**
 * Culling follows winding, not the material's DoubleSide setting. Assert
 * that the actual outside wall of the forged metal points away from the
 * ring axis, and its inside wall points toward it.
 */
function assertBandFacesOutward(options) {
    const result = forgedBand(stock, {
        y: 0.1,
        width: 0.04,
        thickness: 0.004,
        radialSegments: 24,
        ...options
    });
    const vertices = result.geometry.vertices;
    const radii = vertices.map(v => Math.hypot(v.x, v.z));
    const inner = Math.min(...radii);
    const outer = Math.max(...radii);
    let outsideFaces = 0;
    let insideFaces = 0;

    for (const face of result.geometry.quads) {
        if (face.surface !== "iron") continue;

        const points = face.corners.map(id => vertices[id]);
        const faceRadii = points.map(p => Math.hypot(p.x, p.z));
        const a = points[0];
        const b = points[1];
        const c = points[2];
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        const centre = points.reduce(
            (sum, p) => sum.add(p), new THREE.Vector3()
        ).multiplyScalar(1 / points.length);
        const radial = new THREE.Vector3(centre.x, 0, centre.z).normalize();
        const signed = normal.dot(radial);

        if (faceRadii.every(radius => Math.abs(radius - outer) < 1e-7)) {
            assert.ok(signed > 0.9, "outer iron wall must face outside");
            outsideFaces++;
        } else if (faceRadii.every(radius =>
            Math.abs(radius - inner) < 1e-7
        )) {
            assert.ok(signed < -0.9, "inner iron wall must face inside");
            insideFaces++;
        }
    }
    assert.equal(outsideFaces, 24);
    assert.equal(insideFaces, 24);
}

test("closed forged hoops face outward, not into the barrel", () => {
    assertBandFacesOutward();
});

test("open overlapping iron bands keep outward-facing walls", () => {
    assertBandFacesOutward({
        arc: { startAngle: 0.3, sweepAngle: 0.8 }
    });
});

test("iron bands shade smoothly around the hoop but not across their edges", async () => {
    const { toBufferGeometry, getControlVertexIds } = await sourceModule(
        "toolbox/geometry/mesh/toBufferGeometry.ts"
    );

    for (const bevel of [0, 0.00075]) {
        const band = forgedBand(stock, {
            y: 0.1,
            width: 0.04,
            thickness: 0.004,
            radialSegments: 48,
            bevel
        });
        const edgeCount = bevel > 0 ? 6 : 4;

        // One smoothing group per contour edge, shared along the complete
        // circumference. The bevel is never smoothed into a flat face.
        const groups = new Set(band.geometry.quads.map(face => face.smoothingGroup));
        assert.equal(groups.size, edgeCount);

        const rendered = toBufferGeometry(band, { iron: 0 });
        try {
            const ids = getControlVertexIds(rendered);
            assert.ok(ids);
            const normals = rendered.getAttribute("normal");
            const at = id => ids.flatMap((vertexId, index) =>
                vertexId === id
                    ? [new THREE.Vector3().fromBufferAttribute(normals, index)]
                    : []
            );

            // Starting at +Z, the first section's upper outer corner
            // carries separate top/bevel and radial-wall normals.
            const corner = bevel > 0 ? 2 : 1;
            const side = at(corner);
            assert.ok(side.some(n =>
                Math.abs(n.x) < 1e-4 &&
                Math.abs(n.y) < 1e-4 &&
                n.z > 0.99
            ), "outer wall must be smooth around the hoop");
            assert.ok(side.some(n => n.y > 0.5),
                "upper edge must keep a distinct cross-section normal");

            const lowerCorner = bevel > 0 ? 4 : 2;
            assert.ok(at(lowerCorner).some(n => n.y < -0.99),
                "underside must face downward, not share the outer wall normal");
        } finally {
            rendered.dispose();
        }
    }
});
