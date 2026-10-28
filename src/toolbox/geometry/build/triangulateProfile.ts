import * as THREE from "three";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    triangleQuality,
    type GeometryPrecision
} from "../kernel/precision";

export type PlanarTriangle = [number, number, number];

interface BoundarySegment {
    from: number;
    to: number;
    interior: number[];
}

function fail(
    reason: "invalid-input" | "invalid-topology" | "degenerate-geometry" |
        "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("triangulateProfile", reason, message);
}

function edgeKey(a: number, b: number): string {
    return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

/**
 * Triangulate planar contours without losing authored collinear corners.
 * Collinear boundary stations are temporarily omitted from the triangulator,
 * then restored ONLY along their original boundary edges. Interior
 * diagonals are never subdivided by unrelated contour vertices.
 */
export function triangulateProfile(
    contours: readonly (readonly THREE.Vector2Like[])[],
    precision?: GeometryPrecision
): PlanarTriangle[] {
    const policy = resolvePrecision(precision);

    if (
        contours.length === 0 ||
        contours.some(contour => contour.length < 3) ||
        contours.flat().some(point =>
            !point || ![point.x, point.y].every(Number.isFinite)
        )
    ) {
        fail("invalid-input", "Invalid planar profile contours");
    }

    const flat = contours.flat().map(point => new THREE.Vector2(point.x, point.y));
    const extent = new THREE.Box2().setFromPoints(flat)
        .getSize(new THREE.Vector2()).length();
    const tolerance = lengthTolerance(policy, extent);

    const reduced: THREE.Vector2[][] = [];
    const reducedIds: number[] = [];
    const segments: BoundarySegment[] = [];
    const boundaryEdges = new Set<string>();
    let offset = 0;

    for (const contour of contours) {
        const points = contour.map(point =>
            new THREE.Vector2(point.x, point.y)
        );
        const count = points.length;
        const keep: number[] = [];

        for (let i = 0; i < count; i++) {
            const prev = points[(i + count - 1) % count]!;
            const point = points[i]!;
            const next = points[(i + 1) % count]!;
            const before = point.clone().sub(prev);
            const after = next.clone().sub(point);
            const lengthBefore = before.length();
            const lengthAfter = after.length();

            if (lengthBefore <= tolerance || lengthAfter <= tolerance) {
                fail("degenerate-geometry", "Collapsed authored contour edge");
            }

            const cross = before.x * after.y - before.y * after.x;
            const forward = before.dot(after);
            const straight = forward > 0 &&
                Math.abs(cross) <= Math.sin(policy.angle) *
                    lengthBefore * lengthAfter;

            if (!straight) keep.push(i);
        }

        if (keep.length < 3) {
            fail("degenerate-geometry", "Planar contour has no valid area");
        }

        reduced.push(keep.map(index => points[index]!.clone()));
        reducedIds.push(...keep.map(index => offset + index));

        for (let i = 0; i < count; i++) {
            boundaryEdges.add(edgeKey(
                offset + i,
                offset + (i + 1) % count
            ));
        }

        for (let i = 0; i < keep.length; i++) {
            const start = keep[i]!;
            const end = keep[(i + 1) % keep.length]!;
            const interior: number[] = [];
            let cursor = (start + 1) % count;

            while (cursor !== end) {
                interior.push(offset + cursor);
                cursor = (cursor + 1) % count;
            }

            if (interior.length) {
                segments.push({
                    from: offset + start,
                    to: offset + end,
                    interior
                });
            }
        }

        offset += count;
    }

    const raw = THREE.ShapeUtils.triangulateShape(
        reduced[0]!,
        reduced.slice(1)
    );
    const triangles: PlanarTriangle[] = raw.map(face => {
        const [a, b, c] = face;

        if (a === undefined || b === undefined || c === undefined) {
            fail("invalid-topology", "Incomplete planar triangulation");
        }

        return [reducedIds[a]!, reducedIds[b]!, reducedIds[c]!];
    });

    if (!triangles.length) {
        fail("unsupported-topology", "Cannot triangulate planar profile");
    }

    for (const segment of segments) {
        const matching: {
            faceIndex: number;
            edge: number;
        }[] = [];

        for (let index = 0; index < triangles.length; index++) {
            const triangle = triangles[index]!;

            for (let edge = 0; edge < 3; edge++) {
                const a = triangle[edge]!;
                const b = triangle[(edge + 1) % 3]!;

                if (edgeKey(a, b) === edgeKey(segment.from, segment.to)) {
                    matching.push({ faceIndex: index, edge });
                }
            }
        }

        if (matching.length !== 1) {
            fail(
                "invalid-topology",
                "Authored contour boundary is not a single triangulation edge"
            );
        }

        const { faceIndex, edge } = matching[0]!;
        const triangle = triangles[faceIndex]!;
        const from = triangle[edge]!;
        const to = triangle[(edge + 1) % 3]!;
        const opposite = triangle[(edge + 2) % 3]!;
        const interior = from === segment.from
            ? segment.interior
            : [...segment.interior].reverse();
        const chain = [from, ...interior, to];
        const replacements: PlanarTriangle[] = [];

        for (let j = 0; j < chain.length - 1; j++) {
            replacements.push([
                chain[j]!,
                chain[j + 1]!,
                opposite
            ]);
        }

        triangles.splice(faceIndex, 1, ...replacements);
    }

    const edgeUses = new Map<string, [number, number][]>();

    for (const triangle of triangles) {
        const [a, b, c] = triangle;

        if (!triangleQuality(
            new THREE.Vector3(flat[a]!.x, flat[a]!.y, 0),
            new THREE.Vector3(flat[b]!.x, flat[b]!.y, 0),
            new THREE.Vector3(flat[c]!.x, flat[c]!.y, 0),
            policy
        )) {
            fail("degenerate-geometry", "Collapsed planar cap triangle");
        }

        for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
            const key = edgeKey(from, to);
            const uses = edgeUses.get(key) ?? [];
            uses.push([from, to]);
            edgeUses.set(key, uses);
        }
    }

    for (const edge of boundaryEdges) {
        if (edgeUses.get(edge)?.length !== 1) {
            fail("invalid-topology", "An authored cap boundary was not preserved");
        }
    }

    for (const [key, uses] of edgeUses) {
        if (boundaryEdges.has(key)) continue;

        if (
            uses.length !== 2 ||
            uses[0]![0] !== uses[1]![1] ||
            uses[0]![1] !== uses[1]![0]
        ) {
            fail("invalid-topology", `Cap contains a mismatched internal edge: ${key}`);
        }
    }

    return triangles;
}
