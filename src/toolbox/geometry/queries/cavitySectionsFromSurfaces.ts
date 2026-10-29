import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import {
    GeometryOperationError,
    type FaceRef
} from "../kernel/GeometryResult";
import {
    assertAffineTransform,
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

export interface MeshRegionTarget {
    geometry: MeshData;
    localToWorld: THREE.Matrix4;
    regions: readonly string[];
}

export interface CavityRing {
    /** Section-local Y coordinate, in metres. */
    y: number;
    /** Section-local XZ polygon, ordered by longitudinal provenance. */
    outline: readonly THREE.Vector2[];
}

export interface CavitySectionsOptions {
    pieces: readonly MeshRegionTarget[];
    /** Rigid section-local XZ/Y to world, possibly reflected. */
    sectionFrame: THREE.Matrix4;
    heights: readonly number[];
    precision?: GeometryPrecision;
}

interface WallCell {
    low: readonly [number, number];
    high: readonly [number, number];
    bottom: number;
    top: number;
    piece: number;
    face: FaceRef;
}

class DisjointSet {
    private readonly parents: number[];

    constructor(size: number) {
        this.parents = Array.from({ length: size }, (_, i) => i);
    }

    find(value: number): number {
        const root = this.parents[value]!;
        if (root === value) return value;
        return this.parents[value] = this.find(root);
    }

    join(a: number, b: number): void {
        const ra = this.find(a);
        const rb = this.find(b);
        if (ra !== rb) this.parents[Math.max(ra, rb)] = Math.min(ra, rb);
    }
}

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "degenerate-geometry" | "unsupported-topology" |
        "self-intersection",
    message: string,
    context?: { face?: FaceRef; vertex?: number }
): never {
    throw new GeometryOperationError(
        "cavitySectionsFromSurfaces", reason, message, context
    );
}

function signedArea(points: readonly THREE.Vector2Like[]): number {
    const first = points[0]!;
    let twice = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const a = points[i]!;
        const b = points[i + 1]!;
        twice += (a.x - first.x) * (b.y - first.y) -
            (a.y - first.y) * (b.x - first.x);
    }
    return twice / 2;
}

function cross(
    a: THREE.Vector2Like,
    b: THREE.Vector2Like,
    c: THREE.Vector2Like
): number {
    return (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x);
}

function onSegment(
    a: THREE.Vector2,
    b: THREE.Vector2,
    p: THREE.Vector2,
    tolerance: number
): boolean {
    const length = a.distanceTo(b);
    return Math.abs(cross(a, b, p)) <= tolerance * length &&
        p.x >= Math.min(a.x, b.x) - tolerance &&
        p.x <= Math.max(a.x, b.x) + tolerance &&
        p.y >= Math.min(a.y, b.y) - tolerance &&
        p.y <= Math.max(a.y, b.y) + tolerance;
}

function segmentsCross(
    a: THREE.Vector2,
    b: THREE.Vector2,
    c: THREE.Vector2,
    d: THREE.Vector2,
    tolerance: number
): boolean {
    const ab = cross(a, b, c);
    const ac = cross(a, b, d);
    const cd = cross(c, d, a);
    const ce = cross(c, d, b);
    const threshold = tolerance * Math.max(
        a.distanceTo(b), c.distanceTo(d)
    );

    if (
        ((ab > threshold && ac < -threshold) ||
            (ab < -threshold && ac > threshold)) &&
        ((cd > threshold && ce < -threshold) ||
            (cd < -threshold && ce > threshold))
    ) return true;

    return (
        Math.abs(ab) <= threshold && onSegment(a, b, c, tolerance) ||
        Math.abs(ac) <= threshold && onSegment(a, b, d, tolerance) ||
        Math.abs(cd) <= threshold && onSegment(c, d, a, tolerance) ||
        Math.abs(ce) <= threshold && onSegment(c, d, b, tolerance)
    );
}

function validateRing(
    points: readonly THREE.Vector2[],
    tolerance: number
): void {
    if (points.length < 3 ||
        points.some((point, index) =>
            point.distanceTo(points[(index + 1) % points.length]!) <= tolerance)
    ) {
        fail("degenerate-geometry", "Cavity ring has a collapsed edge");
    }
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        for (let j = i + 2; j < points.length; j++) {
            if (i === 0 && j === points.length - 1) continue;
            if (segmentsCross(
                a, b, points[j]!,
                points[(j + 1) % points.length]!, tolerance
            )) {
                fail("self-intersection", "Cavity ring crosses or touches itself");
            }
        }
    }
    const area = signedArea(points);
    if (Math.abs(area) <= tolerance * tolerance) {
        fail("degenerate-geometry", "Cavity ring has no area");
    }
}

function validateInterpolation(
    lower: readonly THREE.Vector2[],
    upper: readonly THREE.Vector2[],
    tolerance: number
): void {
    const at = (index: number, t: number): THREE.Vector2 =>
        lower[index]!.clone().lerp(upper[index]!, t);

    const quadratic = (f0: number, middle: number, f1: number): number[] => {
        // A quadratic is determined exactly by three samples.
        const a = 2 * (f0 + f1 - 2 * middle);
        const b = f1 - f0 - a;
        const c = f0;
        const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
        const epsilon = Number.EPSILON * Math.max(scale, 1e-30) * 16;
        if (Math.abs(a) <= epsilon) {
            return Math.abs(b) <= epsilon ? [] : [-c / b];
        }

        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return [];
        const root = Math.sqrt(discriminant);
        return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
    };

    const area0 = signedArea(lower);
    const area1 = signedArea(upper);
    const areaMid = signedArea(lower.map((point, i) =>
        point.clone().lerp(upper[i]!, 0.5)
    ));
    const coefficient = 2 * (area0 + area1 - 2 * areaMid);
    const slope = area1 - area0 - coefficient;
    const candidate = Math.abs(coefficient) > Number.EPSILON
        ? THREE.MathUtils.clamp(-slope / (2 * coefficient), 0, 1)
        : 0;
    const areaAt = (t: number): number =>
        area0 + slope * t + coefficient * t * t;
    if (areaAt(candidate) <= tolerance * tolerance) {
        fail("invalid-topology", "Cavity interpolation reverses its winding");
    }

    for (let i = 0; i < lower.length; i++) {
        const next = (i + 1) % lower.length;
        const d0 = lower[i]!.clone().sub(lower[next]!);
        const motion = upper[i]!.clone().sub(upper[next]!).sub(d0);
        const lengthSq = motion.lengthSq();
        const t = lengthSq > 0
            ? THREE.MathUtils.clamp(-d0.dot(motion) / lengthSq, 0, 1)
            : 0;
        if (d0.addScaledVector(motion, t).length() <= tolerance) {
            fail("degenerate-geometry",
                "Cavity edge collapses between authored heights");
        }
    }

    for (let i = 0; i < lower.length; i++) {
        const nextI = (i + 1) % lower.length;
        for (let j = i + 2; j < lower.length; j++) {
            if (i === 0 && j === lower.length - 1) continue;
            const nextJ = (j + 1) % lower.length;
            const orientations = [
                [i, nextI, j], [i, nextI, nextJ],
                [j, nextJ, i], [j, nextJ, nextI]
            ];
            const critical = [0, 1];

            for (const [a, b, c] of orientations) {
                const value = (t: number): number =>
                    cross(at(a!, t), at(b!, t), at(c!, t));
                for (const root of quadratic(
                    value(0), value(0.5), value(1)
                )) {
                    if (root > 0 && root < 1) critical.push(root);
                }
            }

            critical.sort((a, b) => a - b);
            const check = (t: number): void => {
                if (segmentsCross(
                    at(i, t), at(nextI, t),
                    at(j, t), at(nextJ, t), tolerance
                )) {
                    fail("self-intersection",
                        "Cavity interpolation creates a crossing between heights");
                }
            };

            critical.forEach(check);
            for (let k = 1; k < critical.length; k++) {
                check((critical[k - 1]! + critical[k]!) / 2);
            }
        }
    }
}

/**
 * Extract finite section loops from separately authored longitudinal
 * wall strips. Every selected quad must have two horizontal row edges
 * and two longitudinal edges, with a single well-defined height span.
 * Ambiguous triangulations must be reconstructed as authored strips
 * before extraction; inventing correspondence would change the cavity.
 */
export function cavitySectionsFromSurfaces({
    pieces,
    sectionFrame,
    heights,
    precision
}: CavitySectionsOptions): readonly CavityRing[] {
    const policy = resolvePrecision(precision);
    if (
        !Array.isArray(pieces) || !pieces.length ||
        !Array.isArray(heights) || heights.length < 2 ||
        heights.some((y, i) =>
            !Number.isFinite(y) ||
            (i > 0 && y <= heights[i - 1]!)) ||
        !(sectionFrame instanceof THREE.Matrix4)
    ) {
        fail("invalid-input", "Expected pieces, a section frame and increasing heights");
    }

    assertAffineTransform(
        sectionFrame, "cavitySectionsFromSurfaces", policy
    );
    const elements = sectionFrame.elements;
    const axes = [
        new THREE.Vector3(elements[0], elements[1], elements[2]),
        new THREE.Vector3(elements[4], elements[5], elements[6]),
        new THREE.Vector3(elements[8], elements[9], elements[10])
    ];
    if (
        axes.some(axis => Math.abs(axis.length() - 1) > policy.angle) ||
        axes.some((axis, i) => axes.some((other, j) =>
            i < j && Math.abs(axis.dot(other)) > policy.angle))
    ) {
        fail("invalid-input", "Section frame must be rigid (reflection allowed)");
    }
    const inverse = sectionFrame.clone().invert();

    const vertices: THREE.Vector3[] = [];
    const inputs: { start: number; selected: number[]; piece: number }[] = [];
    for (const [index, piece] of pieces.entries()) {
        if (
            !(piece.localToWorld instanceof THREE.Matrix4) ||
            !Array.isArray(piece.regions) || !piece.regions.length ||
            piece.regions.some((name: string) =>
                typeof name !== "string" || !name.trim()) ||
            !piece.geometry ||
            !Array.isArray(piece.geometry.vertices) ||
            !Array.isArray(piece.geometry.quads)
        ) {
            fail("invalid-input", "Invalid cavity wall piece");
        }
        assertAffineTransform(
            piece.localToWorld, "cavitySectionsFromSurfaces", policy
        );
        const offset = vertices.length;
        const mapping = inverse.clone().multiply(piece.localToWorld);
        for (const point of piece.geometry.vertices) {
            if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
                fail("invalid-input", "Nonfinite source wall vertex");
            }
            const transformed = new THREE.Vector3(
                point.x, point.y, point.z
            ).applyMatrix4(mapping);
            if (!transformed.toArray().every(Number.isFinite)) {
                fail("invalid-input", "Nonfinite transformed wall vertex");
            }
            vertices.push(transformed);
        }
        const names = new Set<string>(piece.regions);
        const selected: number[] = [];
        for (let i = 0; i < piece.geometry.quads.length; i++) {
            if (names.has(piece.geometry.quads[i]!.surface)) {
                selected.push(i);
            }
        }
        if ((piece.geometry.triangles ?? []).some((face: NonNullable<MeshData["triangles"]>[number]) =>
            names.has(face.surface))) {
            fail("unsupported-topology",
                "Selected triangular walls have no unambiguous longitudinal quad correspondence");
        }
        inputs.push({ start: offset, selected, piece: index });
    }

    if (!vertices.length) {
        fail("invalid-input", "No wall vertices");
    }
    const extent = new THREE.Box3().setFromPoints(vertices)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);
    const columns = new DisjointSet(vertices.length);
    const cells: WallCell[] = [];
    const used = new Set<number>();

    for (const input of inputs) {
        const mesh: MeshData = pieces[input.piece]!.geometry;
        for (const index of input.selected) {
            const face: MeshData["quads"][number] = mesh.quads[index]!;
            if (!face || !Array.isArray(face.corners) ||
                face.corners.length !== 4) {
                fail("invalid-input", "Invalid wall face", {
                    face: { kind: "quad", index }
                });
            }
            const ids: number[] = face.corners.map((id: number) => input.start + id);
            if (ids.some(id =>
                !Number.isInteger(id) || id < input.start ||
                id >= input.start + mesh.vertices.length) ||
                new Set(ids).size !== 4
            ) {
                fail("invalid-input", "Invalid wall quad", {
                    face: { kind: "quad", index }
                });
            }

            const levels = ids.map(id => vertices[id]!.y);
            const bottom = Math.min(...levels);
            const top = Math.max(...levels);
            const low = ids.filter(id =>
                Math.abs(vertices[id]!.y - bottom) <= tolerance
            );
            const high = ids.filter(id =>
                Math.abs(vertices[id]!.y - top) <= tolerance
            );
            if (
                top - bottom <= tolerance ||
                low.length !== 2 || high.length !== 2
            ) {
                fail("unsupported-topology",
                    "Wall quad needs two horizontal rows and two longitudinal edges",
                    { face: { kind: "quad", index } });
            }

            const longEdges = [];
            for (let i = 0; i < 4; i++) {
                const a = ids[i]!;
                const b = ids[(i + 1) % 4]!;
                if (
                    Math.abs(vertices[a]!.y - vertices[b]!.y) > tolerance
                ) longEdges.push([a, b] as const);
            }
            if (longEdges.length !== 2 ||
                longEdges.some(edge =>
                    !low.some(id => edge.includes(id)) ||
                    !high.some(id => edge.includes(id)))) {
                fail("unsupported-topology",
                    "Wall needs two distinct authored longitudinal edges",
                    { face: { kind: "quad", index } });
            }

            // A nonplanar quad intersects a horizontal section in a
            // triangle-diagonal kink. Its changing station count is not
            // silently simplified into a false lofted ring.
            const pts = ids.map(id => vertices[id]!);
            const normal = new THREE.Vector3()
                .subVectors(pts[1]!, pts[0]!)
                .cross(new THREE.Vector3()
                    .subVectors(pts[2]!, pts[0]!));
            const normalLength = normal.length();
            if (!(normalLength > tolerance * tolerance) ||
                Math.abs(normal.dot(new THREE.Vector3()
                    .subVectors(pts[3]!, pts[0]!))) >
                    tolerance * normalLength) {
                fail("unsupported-topology",
                    "Nonplanar wall quad changes section stations",
                    { face: { kind: "quad", index } });
            }

            for (const [a, b] of longEdges) {
                columns.join(a, b);
                used.add(a);
                used.add(b);
            }
            cells.push({
                low: longEdges.map(([a, b]) =>
                    vertices[a]!.y < vertices[b]!.y ? a : b
                ) as [number, number],
                high: longEdges.map(([a, b]) =>
                    vertices[a]!.y > vertices[b]!.y ? a : b
                ) as [number, number],
                bottom, top, piece: input.piece,
                face: { kind: "quad", index }
            });
        }
    }

    if (!cells.length) {
        fail("invalid-input", "No selected longitudinal wall surfaces");
    }

    // Independent parts can share a seam without sharing vertex indices.
    // Merge their longitudinal provenance only at coincident row points.
    const authored = [...used].sort((a, b) => a - b);
    for (let i = 0; i < authored.length; i++) {
        const a = authored[i]!;
        for (let j = i + 1; j < authored.length; j++) {
            const b = authored[j]!;
            if (vertices[a]!.distanceTo(vertices[b]!) <= tolerance) {
                columns.join(a, b);
            }
        }
    }

    let reference: number[] | undefined;
    let referenceEdges: Set<string> | undefined;
    const rings: CavityRing[] = [];

    for (const y of heights) {
        const stations = new Map<number, THREE.Vector2>();
        const segments = new Map<string, WallCell[]>();
        const adjacency = new Map<number, Set<number>>();

        for (const cell of cells) {
            if (y < cell.bottom - tolerance ||
                y > cell.top + tolerance) continue;
            const a = cell.low.map((lower, index) => {
                const upper = cell.high[index]!;
                const t = (y - vertices[lower]!.y) /
                    (vertices[upper]!.y - vertices[lower]!.y);
                const point = vertices[lower]!.clone().lerp(
                    vertices[upper]!, THREE.MathUtils.clamp(t, 0, 1)
                );
                const key = columns.find(lower);
                const next = new THREE.Vector2(point.x, point.z);
                const existing = stations.get(key);
                if (existing && existing.distanceTo(next) > tolerance) {
                    fail("invalid-topology",
                        "A longitudinal station disagrees across adjacent wall pieces",
                        { face: cell.face });
                }
                stations.set(key, next);
                return key;
            });

            const first = a[0]!;
            const last = a[1]!;
            if (first === last ||
                stations.get(first)!.distanceTo(stations.get(last)!) <= tolerance) {
                fail("degenerate-geometry",
                    "Cavity row contains a collapsed segment", {
                        face: cell.face
                    });
            }

            const key = [first, last].sort((l, r) => l - r).join(":");
            const contributors = segments.get(key) ?? [];
            if (contributors.length) {
                const other = contributors[0]!;
                const legitimateRowJoin =
                    contributors.length === 1 &&
                    other.piece === cell.piece &&
                    (Math.abs(other.top - y) <= tolerance &&
                        Math.abs(cell.bottom - y) <= tolerance ||
                    Math.abs(other.bottom - y) <= tolerance &&
                        Math.abs(cell.top - y) <= tolerance);

                if (!legitimateRowJoin) {
                    fail("invalid-topology",
                        "Cavity row edge is doubled without adjacent longitudinal provenance",
                        { face: cell.face });
                }
            }
            contributors.push(cell);
            segments.set(key, contributors);
            (adjacency.get(first) ?? adjacency.set(first, new Set())
                .get(first)!).add(last);
            (adjacency.get(last) ?? adjacency.set(last, new Set())
                .get(last)!).add(first);
        }

        if (adjacency.size < 3 ||
            [...adjacency.values()].some(neighbors =>
                neighbors.size !== 2)) {
            fail("invalid-topology",
                "Cavity section must form exactly one nonbranching closed loop");
        }

        let order: number[];
        if (reference === undefined) {
            const seam = [...stations].sort((left, right) =>
                left[1].x - right[1].x ||
                left[1].y - right[1].y ||
                left[0] - right[0]
            )[0]![0];
            order = [seam];
            let previous = -1;
            let current = seam;

            while (true) {
                const next = [...adjacency.get(current)!]
                    .find(id => id !== previous);
                if (next === undefined) {
                    fail("invalid-topology", "Open cavity section");
                }
                if (next === seam) break;
                if (order.includes(next)) {
                    fail("invalid-topology",
                        "Cavity section revisits a station");
                }
                order.push(next);
                previous = current;
                current = next;
            }
            if (order.length !== adjacency.size) {
                fail("invalid-topology",
                    "Multiple disconnected cavity loops");
            }
            const initialArea = signedArea(
                order.map(id => stations.get(id)!)
            );
            if (Math.abs(initialArea) <= tolerance * tolerance) {
                fail("degenerate-geometry", "Cavity contour has no winding");
            }
            if (initialArea < 0) {
                order = [order[0]!, ...order.slice(1).reverse()];
            }
            reference = order;
            referenceEdges = new Set(order.map((id, i) =>
                [id, order[(i + 1) % order.length]!]
                    .sort((a, b) => a - b).join(":")
            ));
        } else {
            order = reference;
            if (adjacency.size !== order.length ||
                order.some(id => !adjacency.has(id)) ||
                segments.size !== referenceEdges!.size ||
                [...segments.keys()].some(key =>
                    !referenceEdges!.has(key))) {
                fail("invalid-topology",
                    "Cavity station correspondence changes between heights");
            }
        }

        const outline = order.map(id => stations.get(id)!);
        validateRing(outline, tolerance);
        if (signedArea(outline) <= tolerance * tolerance) {
            fail("invalid-topology", "Cavity winding reverses between heights");
        }
        rings.push({ y, outline });
    }

    // Interpolation is linear in every longitudinal station, but a
    // crossing can occur only briefly between valid endpoint rings.
    // Its orientation predicates are quadratic, so isolate their exact
    // event heights instead of trusting a single midpoint sample.
    for (let i = 1; i < rings.length; i++) {
        validateInterpolation(
            rings[i - 1]!.outline, rings[i]!.outline, tolerance
        );
    }

    return rings;
}
