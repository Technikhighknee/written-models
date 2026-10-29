import * as THREE from "three";
import type { Profile2 } from "../definitions/geometry";
import { triangulateProfile } from "../build/triangulateProfile";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

export type FootprintTriangle = readonly [
    THREE.Vector2Like,
    THREE.Vector2Like,
    THREE.Vector2Like
];

function cross(
    a: THREE.Vector2Like,
    b: THREE.Vector2Like,
    c: THREE.Vector2Like
): number {
    return (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x);
}

function triangleArea(points: FootprintTriangle): number {
    return Math.abs(cross(points[0], points[1], points[2])) * 0.5;
}

function signedArea(points: readonly THREE.Vector2Like[]): number {
    const origin = points[0]!;
    let twice = 0;
    for (let i = 1; i < points.length - 1; i++) {
        twice += cross(origin, points[i]!, points[i + 1]!);
    }
    return twice * 0.5;
}

/** Exact convex clipping; shared triangle edges have zero overlap area. */
function commonArea(
    first: FootprintTriangle,
    second: FootprintTriangle
): number {
    let polygon = first.map(p => new THREE.Vector2(p.x, p.y));
    const winding = Math.sign(cross(second[0], second[1], second[2]));

    for (let edge = 0; edge < 3; edge++) {
        const a = second[edge]!;
        const b = second[(edge + 1) % 3]!;
        const clipped: THREE.Vector2[] = [];

        for (let i = 0; i < polygon.length; i++) {
            const from = polygon[i]!;
            const to = polygon[(i + 1) % polygon.length]!;
            const d0 = winding * cross(a, b, from);
            const d1 = winding * cross(a, b, to);
            const inside0 = d0 >= 0;
            const inside1 = d1 >= 0;

            if (inside0 !== inside1) {
                const t = d0 / (d0 - d1);
                clipped.push(from.clone().lerp(to, t));
            }
            if (inside1) clipped.push(to.clone());
        }
        polygon = clipped;
        if (polygon.length < 3) return 0;
    }

    return Math.abs(signedArea(polygon));
}

/**
 * Verify coverage of the entire filled profile, not just its contour points.
 * Clipping every section triangle against the real support triangles catches
 * boundary crossings, concave notches and fully enclosed support holes.
 */
export function finiteFootprintContains(
    support: readonly FootprintTriangle[],
    section: Profile2,
    precision?: GeometryPrecision
): boolean {
    const policy = resolvePrecision(precision);
    const contours = [
        section?.outer,
        ...(section?.holes ?? [])
    ];

    if (
        !Array.isArray(support) || !support.length ||
        !section?.outer?.closed ||
        contours.some(contour =>
            !contour?.closed || !Array.isArray(contour.points) ||
            contour.points.length < 3 ||
            contour.points.some(point =>
                !point || ![point.x, point.y].every(Number.isFinite))
        ) ||
        support.some(triangle =>
            !Array.isArray(triangle) || triangle.length !== 3 ||
            triangle.some(point =>
                !point || ![point.x, point.y].every(Number.isFinite))
        )
    ) {
        throw new GeometryOperationError(
            "finiteFootprintContains", "invalid-input",
            "Expected finite support triangles and a closed planar section"
        );
    }

    const points = contours.map(contour => contour!.points.map(p =>
        new THREE.Vector2(p.x, p.y)
    ));
    const originals = support.flat().map(point =>
        new THREE.Vector2(point.x, point.y)
    );
    const bounds = new THREE.Box2().setFromPoints([
        ...originals, ...points.flat()
    ]);
    const extent = bounds.getSize(new THREE.Vector2()).length();
    const tolerance = lengthTolerance(policy, extent);

    if (support.some(triangle =>
        !(triangleArea(triangle) > tolerance * tolerance)
    )) {
        throw new GeometryOperationError(
            "finiteFootprintContains", "degenerate-geometry",
            "Support contains collapsed triangles"
        );
    }

    const sectionTriangles = triangulateProfile(points, policy);
    const flattened = points.flat();

    for (const ids of sectionTriangles) {
        const triangle = ids.map(id => flattened[id]!) as
            [THREE.Vector2, THREE.Vector2, THREE.Vector2];
        const area = triangleArea(triangle);
        let covered = 0;

        for (const face of support) {
            covered += commonArea(triangle, face);
        }

        const localScale = Math.max(
            triangle[0].distanceTo(triangle[1]),
            triangle[1].distanceTo(triangle[2]),
            triangle[2].distanceTo(triangle[0])
        );
        const allowed = tolerance * localScale * 4;

        if (covered < area - allowed || covered > area + allowed) {
            return false;
        }
    }

    return true;
}
