import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftRings } from "./loftRings";
import { cleanClosedContour } from "../../shapes/operations/cleanClosedContour";

export interface SweepSectionOptions {
    /** Spine controls, in metres, ordered along the solid. */
    path: readonly THREE.Vector3Like[];
    /** Physical section coordinates along referenceAxis and its normal. */
    section: readonly THREE.Vector2Like[];
    /** Preferred section orientation at the path's start. */
    referenceAxis: THREE.Vector3Like;
    segments?: number;
    /** Extra section scale near both attachment points (not separate blobs). */
    endFlare?: number;
}

/**
 * Loft a closed 2D section along a Catmull-Rom path.
 *
 * A reference direction establishes the first section frame. Minimal
 * rotations then transport it along the spine without sudden flips when
 * the curve becomes parallel to the original reference direction.
 * All quads survive into the viewer's control mesh; the ends are capped.
 */
export function sweepSection({
    path, section, referenceAxis, segments = 24, endFlare = 0
}: SweepSectionOptions): MeshData {
    if (path.length < 2 || section.length < 3 ||
        !Number.isInteger(segments) || segments < 2 ||
        !Number.isFinite(endFlare) || endFlare < 0 || endFlare > 1 ||
        [...path, ...section].some(p =>
            !Number.isFinite(p.x) || !Number.isFinite(p.y)) ||
        path.some(p => !Number.isFinite(p.z)) ||
        ![referenceAxis.x, referenceAxis.y, referenceAxis.z].every(Number.isFinite)) {
        throw new RangeError("Invalid swept section");
    }
    const control = path.map(p => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(control, false, "centripetal");
    const fixed = new THREE.Vector3(
        referenceAxis.x, referenceAxis.y, referenceAxis.z
    ).normalize();
    if (fixed.lengthSq() < 0.5) {
        throw new RangeError("Sweep reference axis is zero");
    }
    const unique = cleanClosedContour(section);

    let previousTangent: THREE.Vector3 | undefined;
    let previousU: THREE.Vector3 | undefined;

    const rings = Array.from({length: segments + 1}, (_, i) => {
        const t = i / segments;
        const center = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        if (tangent.lengthSq() < 0.5) {
            throw new RangeError("Sweep has a collapsed path tangent");
        }

        let u: THREE.Vector3;
        if (previousU && previousTangent) {
            const rotation = new THREE.Quaternion().setFromUnitVectors(
                previousTangent, tangent
            );
            u = previousU.clone().applyQuaternion(rotation);
        } else {
            u = fixed.clone().addScaledVector(
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
        }

        u.addScaledVector(tangent, -u.dot(tangent)).normalize();
        previousU = u.clone();
        previousTangent = tangent;

        const v = new THREE.Vector3().crossVectors(tangent, u).normalize();
        const ends = Math.max(
            Math.max(0, 1 - t * 7) ** 2,
            Math.max(0, 1 - (1 - t) * 7) ** 2
        );
        const flare = 1 + endFlare * ends;
        return unique.map(p => center.clone()
            .addScaledVector(u, p.x * flare)
            .addScaledVector(v, p.y * flare));
    });
    return loftRings({rings, smoothingGroup: () => "swept-section"});
}
