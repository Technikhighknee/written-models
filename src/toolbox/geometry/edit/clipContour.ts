import * as THREE from "three";

import type { Profile2 } from "../definitions/geometry";
import { GeometryOperationError } from "../kernel/GeometryOperationError";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { triangulateProfile } from "../build/triangulateProfile";
import type { HalfPlane } from "../../shapes/operations/clipConvexPolygon";

function fail(
    reason: "invalid-input" | "degenerate-geometry" | "self-intersection" |
        "invalid-topology" | "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("clipContour", reason, message);
}

function area(loop: readonly THREE.Vector2[]): number {
    return THREE.ShapeUtils.area(loop);
}

function cross(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): number {
    return (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x);
}

function onEdge(
    p: THREE.Vector2,
    a: THREE.Vector2,
    b: THREE.Vector2,
    tolerance: number
): boolean {
    const length = a.distanceTo(b);
    return length > tolerance &&
        Math.abs(cross(a, b, p)) <= tolerance * length &&
        p.dot(b.clone().sub(a)) >=
            a.dot(b.clone().sub(a)) - tolerance * length &&
        p.dot(b.clone().sub(a)) <=
            b.dot(b.clone().sub(a)) + tolerance * length;
}

function edgesMeet(
    a: THREE.Vector2, b: THREE.Vector2,
    c: THREE.Vector2, d: THREE.Vector2,
    tolerance: number
): boolean {
    const ab = a.distanceTo(b);
    const cd = c.distanceTo(d);
    const threshold = tolerance * Math.max(ab, cd);
    const ac = cross(a, b, c);
    const ad = cross(a, b, d);
    const ca = cross(c, d, a);
    const cb = cross(c, d, b);

    return (ac > threshold && ad < -threshold ||
            ac < -threshold && ad > threshold) &&
           (ca > threshold && cb < -threshold ||
            ca < -threshold && cb > threshold) ||
        onEdge(a, c, d, tolerance) ||
        onEdge(b, c, d, tolerance) ||
        onEdge(c, a, b, tolerance) ||
        onEdge(d, a, b, tolerance);
}

function strictlyInside(
    point: THREE.Vector2,
    polygon: readonly THREE.Vector2[],
    tolerance: number
): boolean {
    let inside = false;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        if (onEdge(point, a, b, tolerance)) return false;
        if ((a.y > point.y) !== (b.y > point.y) &&
            point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
            inside = !inside;
        }
    }
    return inside;
}

function validateLoop(
    loop: readonly THREE.Vector2[],
    tolerance: number
): void {
    if (loop.length < 3 || Math.abs(area(loop)) <= tolerance * tolerance) {
        fail("degenerate-geometry", "Contour has no valid area");
    }

    for (let i = 0; i < loop.length; i++) {
        const a = loop[i]!;
        const b = loop[(i + 1) % loop.length]!;
        if (a.distanceTo(b) <= tolerance) {
            fail("degenerate-geometry", "Collapsed contour edge");
        }
        for (let j = i + 1; j < loop.length; j++) {
            if (j === i + 1 || i === 0 && j === loop.length - 1) continue;
            if (edgesMeet(
                a, b, loop[j]!, loop[(j + 1) % loop.length]!, tolerance
            )) {
                fail("self-intersection", "Contour crosses or touches itself");
            }
        }
    }
}

function normalized(
    profile: Profile2,
    tolerance: number
): THREE.Vector2[][] {
    if (!profile?.outer?.closed ||
        !Array.isArray(profile.outer.points) ||
        profile.holes?.some(hole => !hole.closed ||
            !Array.isArray(hole.points))) {
        fail("invalid-input", "Expected closed profile contours");
    }

    const loops = [profile.outer, ...(profile.holes ?? [])].map(contour =>
        contour.points.map(point => {
            if (!point || ![point.x, point.y].every(Number.isFinite)) {
                fail("invalid-input", "Non-finite contour coordinate");
            }
            return new THREE.Vector2(point.x, point.y);
        })
    );

    for (const loop of loops) validateLoop(loop, tolerance);
    for (let i = 0; i < loops.length; i++) {
        for (let j = i + 1; j < loops.length; j++) {
            const a = loops[i]!;
            const b = loops[j]!;
            if (a.some((from, k) => b.some((other, n) =>
                edgesMeet(
                    from, a[(k + 1) % a.length]!,
                    other, b[(n + 1) % b.length]!, tolerance
                )
            ))) {
                fail("unsupported-topology", "Profile loops intersect or touch");
            }
        }
    }

    const outer = loops[0]!;
    for (let i = 1; i < loops.length; i++) {
        const hole = loops[i]!;
        if (!strictlyInside(hole[0]!, outer, tolerance) ||
            loops.slice(1).some((other, index) =>
                index !== i - 1 &&
                (strictlyInside(hole[0]!, other, tolerance) ||
                    strictlyInside(other[0]!, hole, tolerance))
            )) {
            fail("unsupported-topology", "Holes must be separate and inside the outer contour");
        }
    }

    return loops.map((loop, i) =>
        area(loop) * (i === 0 ? 1 : -1) > 0
            ? loop : [...loop].reverse()
    );
}

function edgeKey(a: number, b: number): string {
    return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

/**
 * Clip a closed, possibly concave profile with holes against a half-plane.
 * Each disconnected kept component is returned as its own Profile2,
 * including holes that stay fully enclosed after the cut.
 *
 * The operation triangulates the domain once, intersects each shared edge
 * once, cancels internal triangle edges and traces the actual resulting
 * boundary loops. Touch-only/zero-area junctions are not silently welded.
 */
export function clipContour(
    profile: Profile2,
    {normal, offset}: HalfPlane,
    precision?: GeometryPrecision
): Profile2[] {
    const policy = resolvePrecision(precision);
    if (!normal || normal.length !== 2 ||
        !normal.every(Number.isFinite) ||
        !Number.isFinite(offset) ||
        Math.hypot(normal[0], normal[1]) <= policy.absoluteLength) {
        fail("invalid-input", "Invalid contour clipping plane");
    }

    if (!profile?.outer?.points?.length) {
        fail("invalid-input", "Missing contour outline");
    }

    const sourcePoints = [
        ...profile.outer.points,
        ...(profile.holes ?? []).flatMap(hole => hole.points)
    ];
    if (!sourcePoints.every(point =>
        point && Number.isFinite(point.x) && Number.isFinite(point.y))) {
        fail("invalid-input", "Non-finite contour coordinate");
    }

    const extent = new THREE.Box2().setFromPoints(
        sourcePoints.map(p => new THREE.Vector2(p.x, p.y))
    ).getSize(new THREE.Vector2()).length();
    const tolerance = lengthTolerance(policy, extent);
    const loops = normalized(profile, tolerance);
    const vertices = loops.flat().map(point => point.clone());
    const [nx, ny] = normal;
    const normalLength = Math.hypot(nx, ny);
    const signed = (point: THREE.Vector2) =>
        (point.x * nx + point.y * ny - offset) / normalLength;
    const distances = vertices.map(signed);

    if (distances.every(distance => distance >= -tolerance)) {
        return [{
            outer: {closed: true, points: loops[0]!.map(p => p.clone())},
            ...(loops.length > 1 ? {
                holes: loops.slice(1).map(loop => ({
                    closed: true, points: loop.map(p => p.clone())
                }))
            } : {})
        }];
    }
    if (distances.every(distance => distance <= -tolerance)) return [];

    const triangles = triangulateProfile(loops, policy);
    const intersections = new Map<string, number>();
    const boundary = new Map<string, [number, number]>();

    function intersect(a: number, b: number): number {
        const key = edgeKey(a, b);
        const cached = intersections.get(key);
        if (cached !== undefined) return cached;

        const from = vertices[a]!;
        const to = vertices[b]!;
        const da = distances[a]!;
        const db = distances[b]!;
        const t = Math.max(0, Math.min(1, da / (da - db)));
        const point = from.clone().lerp(to, t);
        const id = vertices.push(point) - 1;
        distances.push(signed(point));
        intersections.set(key, id);
        return id;
    }

    function clipTriangle(corners: readonly number[]): number[] {
        const kept: number[] = [];
        let previous = corners.at(-1)!;
        let previousIn = distances[previous]! >= -tolerance;
        for (const current of corners) {
            const inside = distances[current]! >= -tolerance;
            if (previousIn !== inside) {
                const on = Math.abs(distances[previous]!) <= tolerance
                    ? previous : Math.abs(distances[current]!) <= tolerance
                        ? current : intersect(previous, current);
                kept.push(on);
            }
            if (inside) kept.push(current);
            previous = current;
            previousIn = inside;
        }
        return kept.filter((id, i) => id !== kept[(i + kept.length - 1) % kept.length]);
    }

    for (const triangle of triangles) {
        const corners = cross(
            vertices[triangle[0]]!,
            vertices[triangle[1]]!,
            vertices[triangle[2]]!
        ) > 0 ? triangle : [triangle[0], triangle[2], triangle[1]];
        const clipped = clipTriangle(corners);
        if (clipped.length < 3) continue;

        const polygon = clipped.map(id => vertices[id]!);
        if (area(polygon) <= tolerance * tolerance) continue;

        for (let i = 0; i < clipped.length; i++) {
            const from = clipped[i]!;
            const to = clipped[(i + 1) % clipped.length]!;
            const key = edgeKey(from, to);
            const opposite = boundary.get(key);
            if (opposite) {
                if (opposite[0] !== to || opposite[1] !== from) {
                    fail("invalid-topology", "Clipped faces overlap with matching winding");
                }
                boundary.delete(key);
            } else {
                boundary.set(key, [from, to]);
            }
        }
    }

    if (boundary.size === 0) return [];
    const next = new Map<number, number>();
    const incoming = new Set<number>();
    for (const [from, to] of boundary.values()) {
        if (next.has(from) || incoming.has(to)) {
            fail("unsupported-topology", "Clipping produced a point-touching boundary junction");
        }
        next.set(from, to);
        incoming.add(to);
    }
    if (next.size !== incoming.size ||
        [...next.keys()].some(id => !incoming.has(id))) {
        fail("invalid-topology", "Clipped boundary is not closed");
    }

    const rings: THREE.Vector2[][] = [];
    while (next.size) {
        const first = next.keys().next().value as number;
        const ids: number[] = [];
        let at = first;
        do {
            const to = next.get(at);
            if (to === undefined) {
                fail("invalid-topology", "Unclosed clipped contour");
            }
            ids.push(at);
            next.delete(at);
            at = to;
        } while (at !== first);

        const ring = ids.map(id => vertices[id]!.clone());
        if (ring.length < 3 || Math.abs(area(ring)) <= tolerance * tolerance) {
            fail("unsupported-topology", "Clipping produced a collapsed boundary loop");
        }
        rings.push(ring);
    }

    const outers = rings.filter(loop => area(loop) > 0);
    const holes = rings.filter(loop => area(loop) < 0);
    const result: {outer: THREE.Vector2[]; holes: THREE.Vector2[][]}[] =
        outers.map(outer => ({outer, holes: []}));

    for (const hole of holes) {
        const owners = result.filter(part =>
            strictlyInside(hole[0]!, part.outer, tolerance)
        ).sort((a, b) => area(a.outer) - area(b.outer));
        if (!owners.length) {
            fail("invalid-topology", "Clipped hole has no enclosing region");
        }
        owners[0]!.holes.push(hole);
    }

    return result.map(part => ({
        outer: {closed: true, points: part.outer},
        ...(part.holes.length ? {
            holes: part.holes.map(points => ({closed: true, points}))
        } : {})
    }));
}
