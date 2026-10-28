import * as THREE from "three";
import { loftSideQuads } from "../build/loftSideQuads";
import type { MeshData, TriangleFace } from "../mesh/MeshData";

type End = "open" | "flat" | { point: THREE.Vector3Like };

export interface LoftRingsOptions {
    /** Consecutive closed contours; same number/order of points per ring. */
    rings: readonly (readonly THREE.Vector3Like[])[];
    start?: End;
    end?: End;
    surface?: (side: number, interval: number) => string;
    smoothingGroup?: (side: number, interval: number) => string | undefined;
}

/**
 * Loft arbitrary closed cross-sections in 3D. The rings need not share an
 * axis or be circular: blades, grip transitions, tool handles and guards all
 * use the same construction faces.
 *
 * Side topology is genuine quads. Flat ends are triangulated polygons;
 * point tips are triangle fans, never zero-width quads.
 * UVs measure distance along the contour and spine
 * in world units (meters).
 *
 * Rings must have consistent winding, must not self-intersect, and may not
 * contain repeated consecutive points.
 */
export function loftRings({
    rings,
    start = "flat",
    end = "flat",
    surface = () => "side",
    smoothingGroup = () => undefined
}: LoftRingsOptions): MeshData {
    const sides = rings[0]?.length ?? 0;
    const { vertices, quads, centers } = loftSideQuads({
        rings,
        uvMode: "perimeter",
        surface,
        smoothingGroup,
        minimumEdgeLength: 1e-10,
        minimumTravel: 1e-10
    });

    const triangles: TriangleFace[] = [];

    function finish(row: number, cap: End, reverse: boolean): void {
        if (cap === "open") return;
        const center = typeof cap === "string"
            ? centers[row]!.clone()
            : new THREE.Vector3(cap.point.x, cap.point.y, cap.point.z);
        if (![center.x, center.y, center.z].every(Number.isFinite)) {
            throw new RangeError("Invalid loft end point");
        }

        const offset = row * sides;
        const axisU = vertices[offset + 1]!.clone()
            .sub(vertices[offset]!).normalize();
        const ringNormal = new THREE.Vector3();

        for (let side = 0; side < sides; side++) {
            const a = vertices[offset + side]!.clone().sub(centers[row]!);
            const b = vertices[offset + (side + 1) % sides]!
                .clone().sub(centers[row]!);
            ringNormal.add(a.cross(b));
        }
        if (ringNormal.lengthSq() < 1e-20) {
            throw new RangeError("Loft end contour has no valid plane");
        }
        ringNormal.normalize();

        // End caps lie in their own section plane. The overall start-to-end
        // vector need not be parallel to either end of a curved loft.
        const axisV = new THREE.Vector3().crossVectors(ringNormal, axisU)
            .normalize();
        const outward = reverse
            ? centers[0]!.clone().sub(centers[1]!).normalize()
            : centers.at(-1)!.clone().sub(centers.at(-2)!).normalize();

        const uv = (index: number): THREE.Vector2 => {
            const relative = vertices[index]!.clone().sub(centers[row]!);
            return new THREE.Vector2(relative.dot(axisU), relative.dot(axisV));
        };

        const surface = reverse ? "cap-start" : "cap-end";
        const add = (a: number, b: number, c: number): void => {
            // Winding is taken from the actual 3D end orientation, not
            // assumed from a particular section axis or contour handedness.
            const va = vertices[a]!;
            const vb = vertices[b]!;
            const vc = vertices[c]!;
            const normal = vb.clone().sub(va).cross(vc.clone().sub(va));
            const corners: TriangleFace["corners"] = normal.dot(outward) < 0
                ? [a, c, b] : [a, b, c];
            triangles.push({
                corners,
                uvs: [uv(corners[0]), uv(corners[1]), uv(corners[2])],
                surface
            });
        };

        if (cap === "flat") {
            // Triangulate the genuine polygon, including concave contours.
            // A centroid fan would invent external faces on concave ends.
            const planar = Array.from({ length: sides }, (_, i) =>
                uv(offset + i)
            );
            const faces = THREE.ShapeUtils.triangulateShape(planar, []);
            for (const [a, b, c] of faces) {
                if (a === undefined || b === undefined || c === undefined) {
                    throw new Error("Invalid loft cap triangulation");
                }
                add(offset + a, offset + b, offset + c);
            }
        } else {
            const pointIndex = vertices.length;
            vertices.push(center);
            for (let side = 0; side < sides; side++) {
                add(pointIndex, offset + side, offset + (side + 1) % sides);
            }
        }
    }

    finish(0, start, true);
    finish(rings.length - 1, end, false);
    return { vertices, quads, triangles };
}
