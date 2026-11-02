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

test("beveled iron bands soften both visible rims without smoothing the wood contact", async () => {
    const { toBufferGeometry, getControlVertexIds } = await sourceModule(
        "toolbox/geometry/mesh/toBufferGeometry.ts"
    );

    for (const bevel of [0, 0.0026]) {
        const band = forgedBand(stock, {
            y: 0.1,
            width: 0.04,
            thickness: 0.004,
            radialSegments: 48,
            bevel
        });

        const groups = new Set(
            band.geometry.quads.map(face => face.smoothingGroup)
        );
        assert.deepEqual(groups, new Set(bevel === 0
            ? ["iron-section-0", "iron-section-1",
                "iron-section-2", "iron-section-3"]
            : ["iron-outer", "iron-inner"]
        ));

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

            if (bevel === 0) {
                assert.ok(at(1).some(n => n.z > 0.99 && Math.abs(n.y) < 1e-4),
                    "unbeveled wall remains sharp");
                assert.ok(at(2).some(n => n.y < -0.99),
                    "unbeveled underside remains planar");
            } else {
                // Profile indices in the reversed six-corner section:
                // 2 = upper outer rim, 4 = lower outer rim, 5 = inner bottom.
                assert.ok(at(2).some(n => n.z > 0.3 && n.y > 0.1),
                    "upper rim blends into the visible iron wall");
                assert.ok(at(4).some(n => n.z > 0.3 && n.y < -0.1),
                    "lower rim blends into the visible iron wall");
                assert.ok(at(5).some(n => n.y < -0.99),
                    "the narrow underside keeps its downward-facing normal");
                assert.ok(at(5).some(n => n.z < -0.9),
                    "the inside contact face remains distinct");
            }
        } finally {
            rendered.dispose();
        }
    }
});
