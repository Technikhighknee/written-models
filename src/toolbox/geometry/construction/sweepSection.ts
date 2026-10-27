import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftRings } from "./loftRings";

export interface SweepSectionOptions {
    /** Spine controls, in metres, ordered along the solid. */
    path: readonly THREE.Vector3Like[];
    /** Physical section coordinates along referenceAxis and its normal. */
    section: readonly THREE.Vector2Like[];
    /** A direction kept perpendicular to the spine at every sample. */
    referenceAxis: THREE.Vector3Like;
    segments?: number;
    /** Extra section scale near both attachment points (not separate blobs). */
    endFlare?: number;
}

/**
 * Loft a closed 2D section along a Catmull-Rom path.
 *
 * Projection of referenceAxis into the normal plane provides a stable
 * section orientation for straps, handles, curved beams and bent piping.
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
    const outline = section.map(p => new THREE.Vector2(p.x, p.y));
    if (outline[0]!.distanceTo(outline.at(-1)!) < 1e-10) outline.pop();
    // Shapes returned by Shape.getPoints() often repeat segment endpoints;
    // filter without changing the model's intended contour winding.
    const unique = outline.filter((p, index) =>
        index === 0 || p.distanceTo(outline[index - 1]!) > 1e-10);
    if (unique.length < 3) throw new RangeError("Collapsed swept outline");

    const rings = Array.from({length: segments + 1}, (_, i) => {
        const t = i / segments;
        const center = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        const u = fixed.clone().addScaledVector(tangent,
            -fixed.dot(tangent)).normalize();
        if (u.lengthSq() < 0.5) {
            throw new RangeError("Reference axis is parallel to the path");
        }
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
