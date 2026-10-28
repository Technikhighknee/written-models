import * as THREE from "three";
import type { Profile2 } from "../definitions/geometry";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

export interface PlanarCut2 {
    id: string;
    points: readonly THREE.Vector2Like[];
}

export interface ContourPartition {
    parts: readonly Profile2[];
    interfaces: readonly {
        firstPart: number;
        secondPart: number;
        cutId: string;
        points: readonly THREE.Vector2[];
        stations: readonly number[];
    }[];
}

function fail(
    reason: "invalid-input" | "degenerate-geometry" |
        "invalid-topology" | "unsupported-topology" | "self-intersection",
    message: string
): never {
    throw new GeometryOperationError("partitionContour", reason, message);
}

function cross(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): number {
    return (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x);
}

function signedArea(points: readonly THREE.Vector2[]): number {
    return THREE.ShapeUtils.area(points);
}

function onSegment(
    point: THREE.Vector2,
    a: THREE.Vector2,
    b: THREE.Vector2,
    tolerance: number
): number | null {
    const direction = b.clone().sub(a);
    const squared = direction.lengthSq();

    if (!(squared > tolerance * tolerance)) return null;

    const t = point.clone().sub(a).dot(direction) / squared;
    const projected = a.clone().addScaledVector(direction, t);

    return t >= -tolerance / Math.sqrt(squared) &&
        t <= 1 + tolerance / Math.sqrt(squared) &&
        projected.distanceTo(point) <= tolerance
        ? Math.max(0, Math.min(1, t))
        : null;
}

function properIntersection(
    a: THREE.Vector2,
    b: THREE.Vector2,
    c: THREE.Vector2,
    d: THREE.Vector2,
    tolerance: number
): boolean {
    const ab = a.distanceTo(b);
    const cd = c.distanceTo(d);
    const threshold = tolerance * Math.max(ab, cd);

    const ac = cross(a, b, c);
    const ad = cross(a, b, d);
    const ca = cross(c, d, a);
    const cb = cross(c, d, b);

    return ((ac > threshold && ad < -threshold) ||
            (ac < -threshold && ad > threshold)) &&
        ((ca > threshold && cb < -threshold) ||
            (ca < -threshold && cb > threshold));
}

function intersects(
    a: THREE.Vector2,
    b: THREE.Vector2,
    c: THREE.Vector2,
    d: THREE.Vector2,
    tolerance: number
): boolean {
    return properIntersection(a, b, c, d, tolerance) ||
        onSegment(a, c, d, tolerance) !== null ||
        onSegment(b, c, d, tolerance) !== null ||
        onSegment(c, a, b, tolerance) !== null ||
        onSegment(d, a, b, tolerance) !== null;
}

function validateSimple(
    points: readonly THREE.Vector2[],
    tolerance: number
): void {
    if (points.length < 3) {
        fail("degenerate-geometry", "Partition part has fewer than three corners");
    }

    for (let i = 0; i < points.length; i++) {
        if (points[i]!.distanceTo(points[(i + 1) % points.length]!) <= tolerance) {
            fail("degenerate-geometry", "Collapsed partition boundary edge");
        }

        for (let j = i + 1; j < points.length; j++) {
            if (points[i]!.distanceTo(points[j]!) <= tolerance &&
                i !== j) {
                fail("self-intersection", "Repeated partition boundary point");
            }
        }

        for (let j = i + 1; j < points.length; j++) {
            if (j === i + 1 || (i === 0 && j === points.length - 1)) {
                continue;
            }

            if (intersects(
                points[i]!,
                points[(i + 1) % points.length]!,
                points[j]!,
                points[(j + 1) % points.length]!,
                tolerance
            )) {
                fail("self-intersection", "Partition boundary crosses itself");
            }
        }
    }
}

function convex(
    points: readonly THREE.Vector2[],
    tolerance: number
): void {
    const orientation = Math.sign(signedArea(points));
    const extent = new THREE.Box2().setFromPoints([...points])
        .getSize(new THREE.Vector2()).length();

    if (!orientation || Math.abs(signedArea(points)) <= tolerance * extent) {
        fail("degenerate-geometry", "Source outline has no positive area");
    }

    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        const c = points[(i + 2) % points.length]!;

        if (cross(a, b, c) * orientation < -tolerance * extent) {
            fail("unsupported-topology", "Source outline must be convex");
        }
    }
}

function boundaryContact(
    point: THREE.Vector2,
    boundary: readonly THREE.Vector2[],
    tolerance: number
): boolean {
    return boundary.some((a, i) =>
        onSegment(point, a, boundary[(i + 1) % boundary.length]!, tolerance) !== null
    );
}

function inside(
    point: THREE.Vector2,
    polygon: readonly THREE.Vector2[],
    tolerance: number
): boolean {
    if (boundaryContact(point, polygon, tolerance)) return false;

    let insidePolygon = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j]!;
        const b = polygon[i]!;

        if ((a.y > point.y) !== (b.y > point.y) &&
            point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
            insidePolygon = !insidePolygon;
        }
    }

    return insidePolygon;
}

function augment(
    polygon: readonly THREE.Vector2[],
    start: THREE.Vector2,
    end: THREE.Vector2,
    tolerance: number
): { points: THREE.Vector2[]; startIndex: number; endIndex: number } {
    const result: THREE.Vector2[] = [];
    let startIndex = -1;
    let endIndex = -1;

    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        const additions = [
            { point: a, t: 0 },
            ...[start, end].flatMap(point => {
                const t = onSegment(point, a, b, tolerance);
                return t === null || t <= 0 || t >= 1
                    ? [] : [{ point, t }];
            })
        ].sort((left, right) => left.t - right.t);

        for (const { point } of additions) {
            const id = result.length;
            result.push(point.clone());

            if (point.distanceTo(start) <= tolerance) startIndex = id;
            if (point.distanceTo(end) <= tolerance) endIndex = id;
        }
    }

    if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) {
        fail("invalid-input", "Both cut endpoints must lie on one part boundary");
    }

    return { points: result, startIndex, endIndex };
}

function traverse(
    points: readonly THREE.Vector2[],
    start: number,
    end: number
): THREE.Vector2[] {
    const result = [points[start]!.clone()];
    let index = start;

    while (index !== end) {
        index = (index + 1) % points.length;
        result.push(points[index]!.clone());
    }

    return result;
}

function cutInside(
    polygon: readonly THREE.Vector2[],
    cut: readonly THREE.Vector2[],
    tolerance: number
): boolean {
    for (let i = 0; i < cut.length - 1; i++) {
        const a = cut[i]!;
        const b = cut[i + 1]!;

        if (
            !inside(a.clone().lerp(b, 0.25), polygon, tolerance) ||
            !inside(a.clone().lerp(b, 0.5), polygon, tolerance) ||
            !inside(a.clone().lerp(b, 0.75), polygon, tolerance)
        ) {
            return false;
        }

        for (let j = 0; j < polygon.length; j++) {
            const c = polygon[j]!;
            const d = polygon[(j + 1) % polygon.length]!;

            if (!intersects(a, b, c, d, tolerance)) {
                continue;
            }

            const atStart = i === 0 &&
                onSegment(cut[0]!, c, d, tolerance) !== null;
            const atEnd = i === cut.length - 2 &&
                onSegment(cut.at(-1)!, c, d, tolerance) !== null;

            // An interface may touch the source perimeter only at its
            // two ends; all intermediate contacts would create a junction.
            if (
                properIntersection(a, b, c, d, tolerance) ||
                (onSegment(c, a, b, tolerance) !== null &&
                    c.distanceTo(cut[0]!) > tolerance &&
                    c.distanceTo(cut.at(-1)!) > tolerance) ||
                (onSegment(d, a, b, tolerance) !== null &&
                    d.distanceTo(cut[0]!) > tolerance &&
                    d.distanceTo(cut.at(-1)!) > tolerance) ||
                (onSegment(a, c, d, tolerance) !== null && !atStart) ||
                (onSegment(b, c, d, tolerance) !== null && !atEnd)
            ) {
                return false;
            }
        }
    }

    return true;
}

function ownsInterface(
    polygon: readonly THREE.Vector2[],
    points: readonly THREE.Vector2[],
    tolerance: number
): boolean {
    return points.slice(0, -1).every((from, index) => {
        const to = points[index + 1]!;

        return polygon.some((a, i) => {
            const b = polygon[(i + 1) % polygon.length]!;

            return a.distanceTo(from) <= tolerance &&
                b.distanceTo(to) <= tolerance ||
                a.distanceTo(to) <= tolerance &&
                b.distanceTo(from) <= tolerance;
        });
    });
}

/**
 * Partition a simple convex 2D outline by noncrossing polylines whose
 * endpoints lie on the original perimeter. Later pieces may be concave.
 * Cut stations are measured once and reused, in reverse, by both parts.
 *
 * Cutting across existing seams, holes and disconnected components
 * deliberately belong to the general partitioner.
 */
export function partitionContour(
    profile: Profile2,
    cuts: readonly PlanarCut2[],
    precision?: GeometryPrecision
): ContourPartition {
    const policy = resolvePrecision(precision);

    if (
        !profile?.outer?.closed ||
        (profile.holes?.length ?? 0) > 0 ||
        !Array.isArray(profile.outer.points) ||
        !Array.isArray(cuts)
    ) {
        fail("unsupported-topology", "Only simple closed, hole-free outlines are supported");
    }

    const source: THREE.Vector2[] = profile.outer.points.map(
        (point: THREE.Vector2Like) =>
        new THREE.Vector2(point.x, point.y)
    );

    if (source.some(point => ![point.x, point.y].every(Number.isFinite))) {
        fail("invalid-input", "Non-finite source outline coordinate");
    }

    const extent = new THREE.Box2().setFromPoints(source)
        .getSize(new THREE.Vector2()).length();
    const tolerance = lengthTolerance(policy, extent);
    validateSimple(source, tolerance);
    convex(source, tolerance);

    const winding = Math.sign(signedArea(source));
    const pieces: THREE.Vector2[][] = [source];
    const interfaces: ContourPartition["interfaces"][number][] = [];
    const seen = new Set<string>();

    for (const cut of cuts) {
        if (!cut?.id?.trim() || seen.has(cut.id) ||
            !Array.isArray(cut.points) || cut.points.length < 2) {
            fail("invalid-input", "A cut needs a unique ID and at least two points");
        }
        seen.add(cut.id);

        const points: THREE.Vector2[] = cut.points.map(
            (point: THREE.Vector2Like) => {
            if (!point || ![point.x, point.y].every(Number.isFinite)) {
                fail("invalid-input", "Non-finite cut coordinate");
            }

            return new THREE.Vector2(point.x, point.y);
        });

        if (points.some(point => ![point.x, point.y].every(Number.isFinite))) {
            fail("invalid-input", "Non-finite cut coordinate");
        }

        if (!boundaryContact(points[0]!, source, tolerance) ||
            !boundaryContact(points.at(-1)!, source, tolerance) ||
            points[0]!.distanceTo(points.at(-1)!) <= tolerance) {
            fail("invalid-input", "Cut endpoints must be distinct points on the source outline");
        }

        for (let i = 0; i < points.length - 1; i++) {
            if (points[i]!.distanceTo(points[i + 1]!) <= tolerance) {
                fail("degenerate-geometry", "Cut contains a collapsed segment");
            }

            for (let j = i + 2; j < points.length - 1; j++) {
                if (intersects(
                    points[i]!, points[i + 1]!,
                    points[j]!, points[j + 1]!, tolerance
                )) {
                    fail("self-intersection", "Cut intersects itself");
                }
            }
        }

        const eligible = pieces.flatMap((part, index) =>
            boundaryContact(points[0]!, part, tolerance) &&
            boundaryContact(points.at(-1)!, part, tolerance) &&
            cutInside(part, points, tolerance)
                ? [index] : []
        );

        if (eligible.length !== 1) {
            fail(
                "unsupported-topology",
                "Cut must divide exactly one part without crossing another interface"
            );
        }

        const index = eligible[0]!;
        const polygon = pieces[index]!;
        const augmented = augment(
            polygon, points[0]!, points.at(-1)!, tolerance
        );
        const fromStart = traverse(
            augmented.points, augmented.startIndex, augmented.endIndex
        );
        const fromEnd = traverse(
            augmented.points, augmented.endIndex, augmented.startIndex
        );
        const first = [
            ...fromStart, ...points.slice(1, -1).reverse().map(p => p.clone())
        ];
        const second = [
            ...fromEnd, ...points.slice(1, -1).map(p => p.clone())
        ];

        for (const part of [first, second]) {
            validateSimple(part, tolerance);

            if (Math.sign(signedArea(part)) !== winding ||
                Math.abs(signedArea(part)) <= tolerance * extent) {
                fail("degenerate-geometry", "Cut produces a collapsed or inverted part");
            }
        }

        const originalArea = Math.abs(signedArea(polygon));
        const combinedArea = Math.abs(signedArea(first)) +
            Math.abs(signedArea(second));

        if (Math.abs(originalArea - combinedArea) >
            Math.max(tolerance * extent, originalArea * policy.relativeLength)) {
            fail("invalid-topology", "Cut pieces do not cover the original part");
        }

        pieces[index] = first;
        const other = pieces.push(second) - 1;

        // A later cut may split the owner of an earlier seam. The seam
        // itself remains intact, so transfer its reference to the part
        // actually retaining all of its authored boundary edges.
        for (const previous of interfaces) {
            for (const side of ["firstPart", "secondPart"] as const) {
                if (previous[side] !== index) continue;

                const onFirst = ownsInterface(
                    first, previous.points, tolerance
                );
                const onSecond = ownsInterface(
                    second, previous.points, tolerance
                );

                if (onFirst === onSecond) {
                    fail(
                        "invalid-topology",
                        "A later cut detached an earlier shared interface"
                    );
                }

                previous[side] = onFirst ? index : other;
            }
        }

        const cumulative = [0];

        for (let i = 1; i < points.length; i++) {
            cumulative.push(cumulative.at(-1)! +
                points[i]!.distanceTo(points[i - 1]!));
        }

        const length = cumulative.at(-1)!;
        interfaces.push({
            firstPart: index,
            secondPart: other,
            cutId: cut.id,
            points: points.map(point => point.clone()),
            stations: cumulative.map(distance => distance / length)
        });
    }

    return {
        parts: pieces.map(points => ({
            outer: { points: points.map(p => p.clone()), closed: true }
        })),
        interfaces
    };
}
