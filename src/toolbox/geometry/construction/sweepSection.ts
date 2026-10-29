import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import type { GeometryResult } from "../kernel/GeometryResult";
import { sweepSection as sweepPath } from "../build/sweepSection";
import { cleanClosedContour } from "../../shapes/operations/cleanClosedContour";

export interface SweepSectionOptions {
    /** Control points of an open Catmull–Rom spine, in metres. */
    path: readonly THREE.Vector3Like[];
    /** Physical section coordinates in the initial perpendicular plane. */
    section: readonly THREE.Vector2Like[];
    referenceAxis: THREE.Vector3Like;
    segments?: number;
    endFlare?: number;
}

/** Sweep a closed section along a smooth open spine with transported frames. */
export function sweepSectionResult({
    path,
    section,
    referenceAxis,
    segments = 24,
    endFlare = 0
}: SweepSectionOptions): GeometryResult {
    if (
        path.length < 2 ||
        section.length < 3 ||
        !Number.isInteger(segments) || segments < 2 ||
        !Number.isFinite(endFlare) || endFlare < 0 || endFlare > 1 ||
        [...path, ...section].some(point =>
            !Number.isFinite(point.x) || !Number.isFinite(point.y)
        ) ||
        path.some(point => !Number.isFinite(point.z)) ||
        ![referenceAxis.x, referenceAxis.y, referenceAxis.z].every(
            Number.isFinite
        )
    ) {
        throw new RangeError("Invalid swept section");
    }

    const control = path.map(point =>
        new THREE.Vector3(point.x, point.y, point.z)
    );
    const curve = new THREE.CatmullRomCurve3(
        control, false, "centripetal"
    );
    const fixed = new THREE.Vector3(
        referenceAxis.x, referenceAxis.y, referenceAxis.z
    ).normalize();

    if (fixed.lengthSq() < 0.5) {
        throw new RangeError("Sweep reference axis is zero");
    }

    const unique = cleanClosedContour(section);
    const tangent = curve.getTangent(0).normalize();
    const u = fixed.clone().addScaledVector(
        tangent, -fixed.dot(tangent)
    );

    if (u.lengthSq() < 1e-12) {
        const fallback = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 1)
        ].sort((a, b) =>
            Math.abs(a.dot(tangent)) - Math.abs(b.dot(tangent))
        )[0]!;

        u.copy(fallback).addScaledVector(
            tangent, -fallback.dot(tangent)
        );
    }

    u.normalize();
    const v = new THREE.Vector3().crossVectors(tangent, u).normalize();
    const startingFrame = new THREE.Matrix4()
        .makeBasis(u, v, tangent)
        .setPosition(curve.getPoint(0));

    const stations = Array.from(
        { length: segments + 1 },
        (_, index) => index / segments
    );

    const result = sweepPath({
        path: {
            at: t => curve.getPoint(t),
            tangent: t => curve.getTangent(t)
        },
        sectionAt: t => {
            const nearEnd = Math.max(
                Math.max(0, 1 - t * 7) ** 2,
                Math.max(0, 1 - (1 - t) * 7) ** 2
            );
            const flare = 1 + endFlare * nearEnd;

            return {
                outer: {
                    points: unique.map(point =>
                        new THREE.Vector2(
                            point.x * flare,
                            point.y * flare
                        )
                    ),
                    closed: true
                }
            };
        },
        startingFrame,
        stations,
        wall: {
            outerRegion: "side",
            smoothingGroupAt: () => "swept-section"
        }
    });

    return result;
}

/** Compatibility convenience for consumers that need only authored faces. */
export function sweepSection(options: SweepSectionOptions): MeshData {
    return sweepSectionResult(options).geometry;
}
