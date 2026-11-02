import * as THREE from "three";

import { sweepSection } from "../../toolbox/geometry/build/sweepSection";
import { polygonalRadiusOutside } from "../../toolbox/geometry/build/polygonalRadiusOutside";
import { polarPoint } from "../../toolbox/geometry/build/samplePolarStripSections";
import { linearProfile } from "../../toolbox/shapes/profiles/linearProfile";
import type { GeometryResult } from "../../toolbox/geometry/kernel/GeometryResult";

interface ForgedBandOptions {
    y: number;
    width: number;
    thickness: number;
    clearance?: number;
    /** How far the inside of the hoop seats into the wooden staves. */
    seatDepth?: number;
    radialSegments?: number;
    angleOffset?: number;
    bevel?: number;
    arc?: { startAngle: number; sweepAngle: number };
}

/**
 * A cooper's forged hoop or overlapping strap. The ironwork chooses its
 * radii and bevel; the geometry toolbox supplies a transported sweep.
 */
export function forgedBand(
    profile: readonly THREE.Vector2Like[],
    {
        y, width, thickness, clearance = 0, seatDepth = 0,
        radialSegments = 48,
        angleOffset = 0, bevel = 0, arc
    }: ForgedBandOptions
): GeometryResult {
    if (
        profile.length < 2 ||
        profile.some((p, i) =>
            !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
            p.x <= 0 || (i > 0 && p.y <= profile[i - 1]!.y)
        ) ||
        ![y, width, thickness, clearance, seatDepth, angleOffset, bevel]
            .every(Number.isFinite) ||
        width <= 0 || thickness <= 0 || clearance < 0 ||
        seatDepth < 0 || seatDepth >= thickness ||
        profile.some(p => p.x <= seatDepth) ||
        bevel < 0 || bevel >= Math.min(width / 2, thickness) ||
        !Number.isInteger(radialSegments) || radialSegments < 3 ||
        y - width / 2 < profile[0]!.y ||
        y + width / 2 > profile.at(-1)!.y ||
        (arc && (!Number.isFinite(arc.startAngle) ||
            !Number.isFinite(arc.sweepAngle) ||
            arc.sweepAngle <= 0 || arc.sweepAngle >= 2 * Math.PI))
    ) {
        throw new RangeError("Invalid forged band");
    }

    const sweepAngle = arc?.sweepAngle ?? 2 * Math.PI;
    const startAngle = arc?.startAngle ?? angleOffset;
    const angularStep = sweepAngle / radialSegments;
    const radiusAt = linearProfile(profile.map(p => ({
        x: p.y, y: p.x
    })));
    // A positive radial clearance leaves a visible dark gap below the hoop:
    // its inner and underside faces show between the iron and the staves.
    // Seating the inner wall into the timber hides that contact instead.
    // The visible outer wall stays outside the wood.
    const clearanceRadius = (height: number) =>
        polygonalRadiusOutside(radiusAt(height), angularStep, clearance) -
        seatDepth;
    const centerRadius = clearanceRadius(y);
    const centerAt = (t: number) => polarPoint(
        centerRadius, y, startAngle + t * sweepAngle
    );
    const tangentAt = (t: number) => {
        const angle = startAngle + t * sweepAngle;
        return new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
    };

    const radial = new THREE.Vector3(
        Math.sin(startAngle), 0, Math.cos(startAngle)
    );
    const down = new THREE.Vector3(0, -1, 0);
    const startingFrame = new THREE.Matrix4()
        .makeBasis(radial, down, tangentAt(0))
        .setPosition(centerAt(0));

    const lower = y - width / 2;
    const upper = y + width / 2;
    const section = [
        { height: lower, offset: 0 },
        { height: lower, offset: thickness - bevel },
        ...(bevel > 0 ? [{ height: lower + bevel, offset: thickness }] : []),
        ...(bevel > 0 ? [{ height: upper - bevel, offset: thickness }] : []),
        { height: upper, offset: thickness - bevel },
        { height: upper, offset: 0 }
    ];

    // A zero-bevel rectangle must retain its four separate corners.
    // The contour is authored from lower inside -> lower outside ->
    // upper outside -> upper inside: clockwise in the sweep's (radial,
    // down) frame. loftSideQuads expects a counter-clockwise outline
    // for outward-facing wall normals. Reverse the section rather than
    // disabling culling or flipping the shared sweep for other callers.
    const outline = section.map(corner => new THREE.Vector2(
        clearanceRadius(corner.height) - centerRadius + corner.offset,
        y - corner.height
    )).reverse();

    const closed = !arc;
    const stations = Array.from(
        { length: radialSegments + (closed ? 0 : 1) },
        (_, i) => i / radialSegments
    );

    return sweepSection({
        path: {
            at: centerAt,
            tangent: tangentAt
        },
        sectionAt: () => ({
            outer: { points: outline, closed: true }
        }),
        startingFrame,
        stations,
        closedPath: closed,
        ...(!closed ? { ends: "cap" as const } : {}),
        wall: {
            outerRegion: "iron",
            // Beveled bands soften the visible upper/lower transitions,
            // but the contact face against the wood must retain its edge.
            // Unbeveled rectangles keep their genuinely sharp corners.
            smoothingGroupAt: ({edge}) => bevel === 0
                ? `iron-section-${edge}`
                : edge === outline.length - 1
                    ? "iron-inner"
                    : "iron-outer"
        }
    });
}
