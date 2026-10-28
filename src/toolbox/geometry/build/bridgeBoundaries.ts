import * as THREE from "three";
import type { Contour3 } from "../definitions/geometry";
import type { MeshData, TriangleFace } from "../mesh/MeshData";
import {
    geometryResult,
    GeometryOperationError,
    type BoundaryRef,
    type GeometryResult
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { topologyOf } from "../kernel/topology";
import { stitchPolylines } from "../topology/stitchPolylines";

export interface BridgeOptions {
    region?: string;
    reverseWinding?: boolean;
    /** Open paths use [0, 1]; closed loops use [0, 1) with seam at 0. */
    fromStations: readonly number[];
    toStations: readonly number[];
    precision?: GeometryPrecision;
}

function failure(
    reason: "invalid-input" | "invalid-topology" | "degenerate-geometry" |
        "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("bridgeBoundaries", reason, message);
}

function contourPoints(
    contour: Contour3,
    precision: GeometryPrecision
): THREE.Vector3[] {
    const points = contour.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    if (points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) {
        failure("invalid-input", "Non-finite bridge contour position");
    }

    const extent = new THREE.Box3().setFromPoints(points)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(precision, extent);
    const edges = contour.closed ? points.length : points.length - 1;

    for (let i = 0; i < edges; i++) {
        if (points[i]!.distanceTo(points[(i + 1) % points.length]!) <= tolerance) {
            failure("degenerate-geometry", "Collapsed bridge contour edge");
        }
    }

    return points;
}

function cumulativeDistances(points: readonly THREE.Vector3[], closed: boolean): number[] {
    const distances = [0];
    const count = closed ? points.length : points.length - 1;

    for (let i = 0; i < count; i++) {
        const next = points[(i + 1) % points.length]!;
        distances.push(distances[i]! + points[i]!.distanceTo(next));
    }

    return distances;
}

function oriented(
    vertices: readonly number[],
    closed: boolean,
    reverse: boolean
): number[] {
    if (!reverse) return [...vertices];
    if (!closed) return [...vertices].reverse();

    // A closed loop retains its authored seam when its winding is reversed.
    return [vertices[0]!, ...vertices.slice(1).reverse()];
}

/**
 * Connect two already sampled, corresponding contours without splitting or
 * approximating their edges. Equal-density strips are deliberately triangles
 * too: the general bridge never claims that a transition is an authored quad.
 *
 * The output contains only the bridge surface. Its selected from/to edges
 * can later be welded to their source parts by an explicit join operation.
 */
export function bridgeBoundaries(
    from: Contour3,
    to: Contour3,
    options: BridgeOptions
): GeometryResult {
    const precision = resolvePrecision(options.precision);

    if (
        from.closed !== to.closed ||
        !options.region?.trim() && options.region !== undefined
    ) {
        failure("invalid-input", "Bridge requires matching contour closure and region");
    }

    const first = contourPoints(from, precision);
    const second = contourPoints(to, precision);
    const closed = from.closed;
    const firstIds = first.map((_, i) => i);
    const secondIds = second.map((_, i) => first.length + i);
    const vertices = [...first, ...second];

    if (
        first.length < (closed ? 3 : 2) ||
        second.length < (closed ? 3 : 2)
    ) {
        failure("invalid-input", "Bridge contour has insufficient stations");
    }

    const extent = new THREE.Box3().setFromPoints(vertices)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(precision, extent);

    // A coincident point shared by independent contours would require an
    // explicit topology transition, not two arbitrarily overlaid vertices.
    for (const a of first) {
        for (const b of second) {
            if (a.distanceTo(b) <= tolerance) {
                failure("unsupported-topology", "Bridge contours touch or overlap");
            }
        }
    }

    let connections: ReturnType<typeof stitchPolylines>;

    try {
        connections = stitchPolylines(firstIds, secondIds, {
            firstStations: options.fromStations,
            secondStations: options.toStations,
            closed
        });
    } catch (error) {
        if (error instanceof RangeError) {
            failure("invalid-input", error.message);
        }
        throw error;
    }

    const firstDistances = cumulativeDistances(first, closed);
    const secondDistances = cumulativeDistances(second, closed);
    const separation = first[0]!.distanceTo(second[0]!);
    const region = options.region ?? "bridge";
    const triangles: TriangleFace[] = [];

    // The stitcher's ordered advances also provide unwrapped physical UVs.
    // The first point at the closing seam is reused as a vertex, but gets
    // its full-perimeter U value in the final faces.
    let a = 0;
    let b = 0;
    for (const face of connections) {
        const nextFirst = firstIds[(a + 1) % firstIds.length]!;
        const advancesFirst = face[2] === nextFirst;

        const references = advancesFirst
            ? [
                [firstIds[a % firstIds.length]!, firstDistances[a]!, 0],
                [secondIds[b % secondIds.length]!, secondDistances[b]!, separation],
                [nextFirst, firstDistances[a + 1]!, 0]
            ]
            : [
                [firstIds[a % firstIds.length]!, firstDistances[a]!, 0],
                [secondIds[b % secondIds.length]!, secondDistances[b]!, separation],
                [secondIds[(b + 1) % secondIds.length]!, secondDistances[b + 1]!, separation]
            ];

        triangles.push({
            corners: (
                options.reverseWinding
                    ? references.map(p => p[0]).reverse()
                    : references.map(p => p[0])
            ) as TriangleFace["corners"],
            uvs: (
                options.reverseWinding
                    ? references.map(p => new THREE.Vector2(p[1], p[2])).reverse()
                    : references.map(p => new THREE.Vector2(p[1], p[2]))
            ) as TriangleFace["uvs"],
            surface: region
        });

        if (advancesFirst) a++;
        else b++;
    }

    if (
        a !== first.length - (closed ? 0 : 1) ||
        b !== second.length - (closed ? 0 : 1)
    ) {
        failure("invalid-topology", "Bridge did not consume both contours");
    }

    const mesh: MeshData = { vertices, quads: [], triangles };
    let result: GeometryResult;

    try {
        result = geometryResult(mesh, precision);
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                "bridgeBoundaries", error.reason, error.message, error.context
            );
        }
        throw error;
    }

    const topology = topologyOf(result);
    const edges = topology.openBoundaries();

    if (edges.length !== (closed ? 2 : 1)) {
        failure("invalid-topology", "Unexpected bridge boundary topology");
    }

    const fromBoundary: BoundaryRef = {
        owner: result.id,
        vertices: oriented(firstIds, closed, !options.reverseWinding),
        closed
    };
    const toBoundary: BoundaryRef = {
        owner: result.id,
        vertices: oriented(secondIds, closed, !!options.reverseWinding),
        closed
    };

    for (const boundary of [fromBoundary, toBoundary]) {
        for (let i = 0; i < boundary.vertices.length - (closed ? 0 : 1); i++) {
            const fromId = boundary.vertices[i]!;
            const toId = boundary.vertices[(i + 1) % boundary.vertices.length]!;
            const use = topology.edgeUses(fromId, toId);

            if (
                use.length !== 1 ||
                use[0]!.from !== fromId ||
                use[0]!.to !== toId
            ) {
                failure("invalid-topology", "Bridge has incorrect boundary winding");
            }
        }
    }

    return {
        ...result,
        boundaries: { from: [fromBoundary], to: [toBoundary] }
    };
}
