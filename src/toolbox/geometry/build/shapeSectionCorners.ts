import * as THREE from "three";
import type { Contour2 } from "../definitions/geometry";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

export interface CornerTransition {
    /** Vertex of the original, ordered closed contour. */
    corner: number;
    /** Physical lengths trimmed from the incoming and outgoing edges. */
    before: number;
    after: number;
    /** A flat bevel or a circular, edge-tangent corner. */
    kind: "chamfer" | "round";
    /** Circular arc segments; only valid for a round corner. */
    segments?: number;
}

export type SectionEdgeOrigin =
    | { kind: "source"; edge: number }
    | { kind: "transition"; corner: number; segment: number };

export interface ShapedSectionContour {
    contour: Contour2;
    /** One semantic origin for each edge in contour.points order. */
    edges: readonly SectionEdgeOrigin[];
}

function fail(
    reason: "invalid-input" | "degenerate-geometry" |
        "self-intersection" | "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("shapeSectionCorners", reason, message);
}

function cross(
    a: THREE.Vector2,
    b: THREE.Vector2,
    c: THREE.Vector2
): number {
    return (b.x - a.x) * (c.y - a.y) -
        (b.y - a.y) * (c.x - a.x);
}

function intersect(
    a: THREE.Vector2,
    b: THREE.Vector2,
    c: THREE.Vector2,
    d: THREE.Vector2,
    tolerance: number
): boolean {
    const ab = b.clone().sub(a);
    const cd = d.clone().sub(c);
    const t = tolerance * Math.max(ab.length(), cd.length());
    const orient = (p: THREE.Vector2, q: THREE.Vector2, r: THREE.Vector2) =>
        cross(p, q, r);

    const abC = orient(a, b, c);
    const abD = orient(a, b, d);
    const cdA = orient(c, d, a);
    const cdB = orient(c, d, b);

    if (
        ((abC > t && abD < -t) || (abC < -t && abD > t)) &&
        ((cdA > t && cdB < -t) || (cdA < -t && cdB > t))
    ) return true;

    const onEdge = (
        point: THREE.Vector2,
        first: THREE.Vector2,
        vector: THREE.Vector2
    ) => {
        const squared = vector.lengthSq();
        if (squared <= tolerance * tolerance) return false;

        const fraction = point.clone().sub(first).dot(vector) / squared;
        return fraction >= -tolerance / Math.sqrt(squared) &&
            fraction <= 1 + tolerance / Math.sqrt(squared) &&
            point.distanceTo(
                first.clone().addScaledVector(vector, fraction)
            ) <= tolerance;
    };

    return onEdge(a, c, cd) || onEdge(b, c, cd) ||
        onEdge(c, a, ab) || onEdge(d, a, ab);
}

function validateSimple(
    points: readonly THREE.Vector2[],
    tolerance: number
): number {
    if (points.length < 3) {
        fail("degenerate-geometry", "Closed section needs three corners");
    }

    const area = THREE.ShapeUtils.area(points);
    const extent = new THREE.Box2().setFromPoints([...points])
        .getSize(new THREE.Vector2()).length();

    if (!(Math.abs(area) > extent * tolerance)) {
        fail("degenerate-geometry", "Section has no measurable area");
    }

    for (let i = 0; i < points.length; i++) {
        if (points[i]!.distanceTo(points[(i + 1) % points.length]!) <= tolerance) {
            fail("degenerate-geometry", "Section contains a collapsed edge");
        }

        for (let j = i + 1; j < points.length; j++) {
            if (points[i]!.distanceTo(points[j]!) <= tolerance) {
                fail("self-intersection", "Section repeats a boundary vertex");
            }

            if (j === i + 1 ||
                (i === 0 && j === points.length - 1)) continue;

            if (intersect(
                points[i]!, points[(i + 1) % points.length]!,
                points[j]!, points[(j + 1) % points.length]!,
                tolerance
            )) {
                fail("self-intersection", "Section boundary intersects itself");
            }
        }
    }

    return Math.sign(area);
}

/**
 * Shape selected convex corners in a planar section, before lofting or
 * extrusion. All dimensions are in section-plane metres.
 *
 * Only selected corners are replaced; untouched authored corners remain
 * exact. Every generated edge retains either its original edge index
 * or the corner and segment of its transition. A round corner follows
 * an actual tangent circular arc, not a cosmetic smoothing flag.
 *
 * Neighboring parts must shape shared interfaces from the same authored
 * contour before construction. This is not a post-hoc mesh bevel.
 */
export function shapeSectionCorners(
    contour: Contour2,
    transitions: readonly CornerTransition[],
    precision?: GeometryPrecision
): ShapedSectionContour {
    const policy = resolvePrecision(precision);

    if (!contour?.closed || !Array.isArray(contour.points) ||
        !Array.isArray(transitions) ||
        contour.points.some(point => !point ||
            ![point.x, point.y].every(Number.isFinite))) {
        fail("invalid-input", "Expected a finite, closed planar section");
    }

    const source = contour.points.map(point =>
        new THREE.Vector2(point.x, point.y)
    );
    const extent = new THREE.Box2().setFromPoints(source)
        .getSize(new THREE.Vector2()).length();
    const tolerance = lengthTolerance(policy, extent);
    const winding = validateSimple(source, tolerance);
    const selected = new Map<number, CornerTransition>();
    const before = Array(source.length).fill(0) as number[];
    const after = Array(source.length).fill(0) as number[];

    for (const treatment of transitions) {
        if (
            !treatment ||
            !Number.isInteger(treatment.corner) ||
            treatment.corner < 0 ||
            treatment.corner >= source.length ||
            selected.has(treatment.corner) ||
            !Number.isFinite(treatment.before) ||
            !Number.isFinite(treatment.after) ||
            treatment.before <= tolerance ||
            treatment.after <= tolerance ||
            !["chamfer", "round"].includes(treatment.kind) ||
            (treatment.kind === "round" &&
                (!Number.isInteger(treatment.segments) ||
                    treatment.segments! < 2 || treatment.segments! > 64)) ||
            (treatment.kind === "chamfer" &&
                treatment.segments !== undefined &&
                treatment.segments !== 1)
        ) {
            fail("invalid-input", "Invalid or duplicate corner transition");
        }

        if (
            treatment.kind === "round" &&
            Math.abs(treatment.before - treatment.after) > tolerance
        ) {
            fail(
                "invalid-input",
                "Tangent circular rounds need equal incoming and outgoing cuts"
            );
        }

        selected.set(treatment.corner, treatment);
        before[treatment.corner] = treatment.before;
        after[treatment.corner] = treatment.after;
    }

    for (let i = 0; i < source.length; i++) {
        const available = source[i]!.distanceTo(
            source[(i + 1) % source.length]!
        );

        if (after[i]! + before[(i + 1) % source.length]! >=
            available - tolerance) {
            fail(
                "unsupported-topology",
                "Corner transitions overlap or consume their connecting edge"
            );
        }
    }

    const points: THREE.Vector2[] = [];

    for (let i = 0; i < source.length; i++) {
        const treatment = selected.get(i);

        if (!treatment) {
            points.push(source[i]!.clone());
        } else {
            const previous = source[(i + source.length - 1) % source.length]!;
            const corner = source[i]!;
            const next = source[(i + 1) % source.length]!;
            const inward = previous.clone().sub(corner).normalize();
            const outward = next.clone().sub(corner).normalize();
            const turn = cross(previous, corner, next);
            const sine = Math.abs(turn) /
                (previous.distanceTo(corner) * corner.distanceTo(next));

            if (turn * winding <= tolerance * extent ||
                sine <= Math.sin(policy.angle)) {
                fail(
                    "unsupported-topology",
                    "Corner transitions require a strictly convex turn"
                );
            }

            const entry = corner.clone().addScaledVector(
                inward, treatment.before
            );
            const exit = corner.clone().addScaledVector(
                outward, treatment.after
            );
            const count = treatment.kind === "round"
                ? treatment.segments! : 1;
            const samples = [entry];

            if (treatment.kind === "round") {
                const cosine = THREE.MathUtils.clamp(
                    inward.dot(outward), -1, 1
                );
                const half = Math.acos(cosine) / 2;
                const bisector = inward.clone().add(outward);

                if (bisector.length() <= Math.sin(policy.angle)) {
                    fail("unsupported-topology", "Round has no interior bisector");
                }

                const center = corner.clone().add(
                    bisector.normalize().multiplyScalar(
                        treatment.before / Math.cos(half)
                    )
                );
                const first = entry.clone().sub(center);
                const last = exit.clone().sub(center);
                const radius = first.length();
                const angle = Math.atan2(
                    first.x * last.y - first.y * last.x,
                    first.dot(last)
                );
                const start = Math.atan2(first.y, first.x);

                if (!(radius > tolerance) || angle * winding <= 0) {
                    fail("unsupported-topology", "Invalid circular corner arc");
                }

                for (let step = 1; step < count; step++) {
                    const theta = start + angle * step / count;
                    samples.push(new THREE.Vector2(
                        center.x + radius * Math.cos(theta),
                        center.y + radius * Math.sin(theta)
                    ));
                }
            }

            samples.push(exit);

            for (let j = 0; j < samples.length; j++) {
                points.push(samples[j]!);


            }
        }

    }

    // One origin per emitted edge, in the exact contour traversal order.
    const orderedEdges: SectionEdgeOrigin[] = [];
    for (let i = 0; i < source.length; i++) {
        const treatment = selected.get(i);
        const segments = treatment?.kind === "round"
            ? treatment.segments! : treatment ? 1 : 0;

        if (segments) {
            orderedEdges.push(...Array.from(
                { length: segments }, (_, j) => ({
                    kind: "transition" as const,
                    corner: i,
                    segment: j
                })
            ));
        }
        orderedEdges.push({ kind: "source", edge: i });
    }

    const resultingWinding = validateSimple(points, tolerance);

    if (resultingWinding !== winding) {
        fail("unsupported-topology", "Corner shaping inverted the section");
    }

    return {
        contour: { points, closed: true },
        edges: orderedEdges
    };
}
