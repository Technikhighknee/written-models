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
