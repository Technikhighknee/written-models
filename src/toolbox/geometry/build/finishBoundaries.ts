import * as THREE from "three";
import type { TriangleFace, QuadFace, MeshData } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    geometryResult,
    GeometryOperationError,
    type BoundaryRef,
    type GeometryResult,
    type SurfacePatchRef
} from "../kernel/GeometryResult";
import { topologyOf } from "../kernel/topology";
import { triangulateProfile } from "./triangulateProfile";
import {
    assertAffineTransform,
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

export interface CapOptions {
    region: string;
    /** Rigid chart frame: local XY is the cap plane, local Z its normal. */
    uvFrame: THREE.Matrix4;
    tessellation: "quad-if-planar" | "triangulate";
    precision?: GeometryPrecision;
}

export interface TipOptions {
    region: string;
    uvFrame: THREE.Matrix4;
    precision?: GeometryPrecision;
}

function fail(
    operation: string,
    reason: "invalid-input" | "invalid-topology" | "degenerate-geometry" |
        "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError(operation, reason, message);
}

function edgeKey(a: number, b: number): string {
    return Math.min(a, b) + ":" + Math.max(a, b);
}

function loopEdges(vertices: readonly number[]): Set<string> {
    return new Set(vertices.map((a, i) =>
        edgeKey(a, vertices[(i + 1) % vertices.length]!)
    ));
}

function sameLoop(a: BoundaryRef, b: BoundaryRef): boolean {
    if (!a.closed || !b.closed || a.vertices.length !== b.vertices.length) {
        return false;
    }

    const edges = loopEdges(a.vertices);
    return b.vertices.every((vertex, i) =>
        edges.has(edgeKey(vertex, b.vertices[(i + 1) % b.vertices.length]!))
    );
}

function validateOpenLoop(
    source: GeometryResult,
    boundary: BoundaryRef,
    operation: string
): void {
    assertSelectionOwner(source, boundary);

    const ids = boundary.vertices;
    const topology = topologyOf(source);

    if (!boundary.closed || ids.length < 3 ||
        new Set(ids).size !== ids.length ||
        ids.some(id => !Number.isInteger(id) ||
            id < 0 || id >= source.geometry.vertices.length)) {
        fail(operation, "invalid-input", "Expected a complete closed boundary");
    }

    if (!topology.openBoundaries().some(loop => sameLoop(loop, boundary))) {
        fail(operation, "invalid-topology", "Boundary is not an open mesh rim");
    }
}

function projectLoop(
    source: GeometryResult,
    boundary: BoundaryRef,
    inverse: THREE.Matrix4,
    tolerance: number,
    operation: string
): THREE.Vector2[] {
    const projected = boundary.vertices.map(id =>
        source.geometry.vertices[id]!.clone().applyMatrix4(inverse)
    );

    if (projected.some(point => Math.abs(point.z) > tolerance)) {
        fail(operation, "degenerate-geometry", "End boundary is not planar");
    }

    return projected.map(point => new THREE.Vector2(point.x, point.y));
}

function chartInverse(
    frame: THREE.Matrix4,
    precision: GeometryPrecision,
    operation: string
): THREE.Matrix4 {
    assertAffineTransform(frame, operation, precision);

    const e = frame.elements;
    const x = new THREE.Vector3(e[0], e[1], e[2]);
    const y = new THREE.Vector3(e[4], e[5], e[6]);
    const z = new THREE.Vector3(e[8], e[9], e[10]);

    if ([x, y, z].some(axis =>
        Math.abs(axis.length() - 1) > precision.angle
    ) || Math.abs(x.dot(y)) > precision.angle ||
        Math.abs(x.dot(z)) > precision.angle ||
        Math.abs(y.dot(z)) > precision.angle) {
        fail(operation, "invalid-input", "UV frame must be rigid");
    }

    return frame.clone().invert();
}

function area(points: readonly THREE.Vector2[]): number {
    return THREE.ShapeUtils.area(points);
}

function convex(points: readonly THREE.Vector2[], tolerance: number): boolean {
    const sign = Math.sign(area(points));
    if (!sign) return false;

    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        const c = points[(i + 2) % points.length]!;
        const cross = (b.x - a.x) * (c.y - b.y) -
            (b.y - a.y) * (c.x - b.x);

        if (cross * sign <= tolerance * tolerance) return false;
    }

    return true;
}

function edgesOfFace(indices: readonly number[]): [number, number][] {
    return indices.map((a, i) => [a, indices[(i + 1) % indices.length]!]);
}

function orientFaces(
    source: GeometryResult,
    loops: readonly BoundaryRef[],
    triangles: number[][],
    operation: string
): void {
    const outer = loops[0]!.vertices;
    const uses = topologyOf(source).edgeUses(outer[0]!, outer[1]!);

    if (uses.length !== 1) {
        fail(operation, "invalid-topology", "Expected one adjacent wall face");
    }

    const [from, to] = [uses[0]!.from, uses[0]!.to];
    const boundaryFace = triangles.find(face =>
        edgesOfFace(face).some(([a, b]) => edgeKey(a, b) === edgeKey(from, to))
    );

    if (!boundaryFace) {
        fail(operation, "invalid-topology", "Cap does not meet the outer rim");
    }

    if (edgesOfFace(boundaryFace).some(([a, b]) => a === from && b === to)) {
        triangles.forEach(face => face.reverse());
    }

    const counts = new Map<string, [number, number][]>();

    for (const face of triangles) {
        for (const edge of edgesOfFace(face)) {
            const key = edgeKey(...edge);
            const uses = counts.get(key) ?? [];
            uses.push(edge);
            counts.set(key, uses);
        }
    }

    const expected = new Set(loops.flatMap(loop =>
        [...loopEdges(loop.vertices)]
    ));

    for (const loop of loops) {
        const ids = loop.vertices;

        for (let i = 0; i < ids.length; i++) {
            const a = ids[i]!;
            const b = ids[(i + 1) % ids.length]!;
            const use = topologyOf(source).edgeUses(a, b)[0]!;
            const actual = counts.get(edgeKey(a, b));

            if (actual?.length !== 1 ||
                actual[0]![0] !== use.to || actual[0]![1] !== use.from) {
                fail(operation, "invalid-topology", "Cap has a mismatched rim winding");
            }
        }
    }

    for (const [key, uses] of counts) {
        if (expected.has(key)) continue;

        if (uses.length !== 2 ||
            uses[0]![0] !== uses[1]![1] ||
            uses[0]![1] !== uses[1]![0]) {
            fail(
                operation,
                "invalid-topology",
                `Cap internal edge ${key} has incompatible uses: ${JSON.stringify(uses)}`
            );
        }
    }
}

function appendFaces(
    source: GeometryResult,
    triangles: readonly number[][],
    uvs: ReadonlyMap<number, THREE.Vector2>,
    region: string,
    operation: string,
    consumed: readonly BoundaryRef[],
    apex?: THREE.Vector3,
    precision?: GeometryPrecision,
    capQuad?: readonly number[]
): GeometryResult {
    const vertices = source.geometry.vertices.map(point => point.clone());
    const apexId = apex === undefined ? undefined : vertices.push(apex) - 1;

    const faces: TriangleFace[] = triangles.map(face => {
        const corners = face.map(id =>
            id === -1 ? apexId! : id
        ) as TriangleFace["corners"];

        return {
            corners,
            uvs: corners.map(id =>
                (id === apexId && apex !== undefined
                    ? uvs.get(-1) : uvs.get(id))!.clone()
            ) as TriangleFace["uvs"],
            surface: region
        };
    });

    const mesh: MeshData = {
        vertices,
        quads: capQuad === undefined
            ? source.geometry.quads
            : [...source.geometry.quads, {
                corners: [...capQuad] as QuadFace["corners"],
                uvs: capQuad.map(id => uvs.get(id)!.clone()) as QuadFace["uvs"],
                surface: region
            }],
        triangles: [...(source.geometry.triangles ?? []), ...faces]
    };

    let result: GeometryResult;

    try {
        result = geometryResult(mesh, precision);
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                operation, error.reason, error.message, error.context
            );
        }
        throw error;
    }

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);

    for (const [name, entries] of Object.entries(source.boundaries)) {
        const survivors = entries.filter(boundary =>
            !consumed.some(used => sameLoop(boundary, used))
        );

        if (survivors.length) {
            boundaries[name] = survivors.map(boundary => ({
                owner: result.id,
                vertices: [...boundary.vertices],
                closed: boundary.closed
            }));
        }
    }

    let patches: Record<string, SurfacePatchRef[]> | undefined;
    if (source.patches) {
        patches = Object.create(null) as Record<string, SurfacePatchRef[]>;
        for (const [name, entries] of Object.entries(source.patches)) {
            patches[name] = entries.map(patch => ({
                owner: result.id,
                faces: patch.faces.map(face => ({ ...face })),
                chart: patch.chart
            }));
        }
    }

    return {
        ...result,
        boundaries,
        ...(patches === undefined ? {} : { patches })
    };
}

/**
 * Close a planar rim without adding boundary vertices. Any holes must
 * be complete, disjoint open rims of the same source geometry.
 */
export function capSectionEnd(
    source: GeometryResult,
    outer: BoundaryRef,
    holes: readonly BoundaryRef[],
    options: CapOptions
): GeometryResult {
    const operation = "capSectionEnd";
    const precision = resolvePrecision(options.precision);
    const loops = [outer, ...holes];

    if (!options.region?.trim() ||
        !["quad-if-planar", "triangulate"].includes(options.tessellation)) {
        fail(operation, "invalid-input", "Invalid cap options");
    }

    for (const boundary of loops) {
        validateOpenLoop(source, boundary, operation);
    }

    const allIds = loops.flatMap(loop => [...loop.vertices]);
    if (new Set(allIds).size !== allIds.length) {
        fail(operation, "invalid-topology", "Cap loops share boundary vertices");
    }

    const inverse = chartInverse(options.uvFrame, precision, operation);
    const extent = new THREE.Box3().setFromPoints(
        allIds.map(id => source.geometry.vertices[id]!)
    ).getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(precision, extent);
    const contours = loops.map(loop =>
        projectLoop(source, loop, inverse, tolerance, operation)
    );

    const outerArea = Math.abs(area(contours[0]!));
    const holeArea = contours.slice(1).reduce(
        (sum, points) => sum + Math.abs(area(points)), 0
    );
    const expectedArea = outerArea - holeArea;

    if (!(expectedArea > tolerance * tolerance) ||
        contours.some(points => Math.abs(area(points)) <= tolerance * tolerance) ||
        contours.slice(1).some(points =>
            area(points) * area(contours[0]!) >= 0
        )) {
        fail(operation, "degenerate-geometry", "Invalid planar cap loops");
    }

    const ids = allIds;
    const uv = new Map<number, THREE.Vector2>();
    contours.forEach((contour, index) => {
        contour.forEach((point, vertex) => {
            uv.set(loops[index]!.vertices[vertex]!, point);
        });
    });

    const isQuad = options.tessellation === "quad-if-planar" &&
        holes.length === 0 && outer.vertices.length === 4 &&
        convex(contours[0]!, tolerance);

    const triangles = isQuad
        ? [outer.vertices.slice()]
        : triangulateProfile(contours, precision).map(face =>
            face.map(index => ids[index]!)
        );

    if (triangles.length === 0) {
        fail(operation, "unsupported-topology", "Unable to triangulate cap");
    }

    const actualArea = triangles.reduce((sum, face) => {
        const points = face.map(id => uv.get(id)!);
        return sum + Math.abs(area(points));
    }, 0);

    if (Math.abs(actualArea - expectedArea) >
        Math.max(tolerance * tolerance, expectedArea * precision.relativeLength)) {
        fail(operation, "unsupported-topology", "Cap triangulation does not cover its footprint");
    }

    orientFaces(source, loops, triangles, operation);

    return appendFaces(
        source,
        isQuad ? [] : triangles,
        uv,
        options.region,
        operation,
        loops,
        undefined,
        precision,
        isQuad ? triangles[0] : undefined
    );
}

/** Close a single planar rim, preserving all existing geometry vertices. */
export function capBoundary(
    source: GeometryResult,
    boundary: BoundaryRef,
    options: CapOptions
): GeometryResult {
    return capSectionEnd(source, boundary, [], options);
}

/**
 * Connect one convex open rim to an explicit apex using real triangles.
 * The apex must not lie in the rim plane or collapse any fan edge.
 */
export function tipBoundary(
    source: GeometryResult,
    boundary: BoundaryRef,
    point: THREE.Vector3Like,
    options: TipOptions
): GeometryResult {
    const operation = "tipBoundary";
    const precision = resolvePrecision(options.precision);

    validateOpenLoop(source, boundary, operation);
    if (!options.region?.trim() ||
        !point || ![point.x, point.y, point.z].every(Number.isFinite)) {
        fail(operation, "invalid-input", "Invalid tip options");
    }

    const inverse = chartInverse(options.uvFrame, precision, operation);
    const extent = new THREE.Box3().setFromPoints(
        boundary.vertices.map(id => source.geometry.vertices[id]!)
    ).getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(precision, extent);
    const projected = projectLoop(
        source, boundary, inverse, tolerance, operation
    );

    if (!convex(projected, tolerance)) {
        fail(operation, "unsupported-topology", "Tip rim must be convex");
    }

    const apex = new THREE.Vector3(point.x, point.y, point.z);
    const localApex = apex.clone().applyMatrix4(inverse);
    if (Math.abs(localApex.z) <= tolerance) {
        fail(operation, "degenerate-geometry", "Tip apex is coplanar");
    }

    const first = boundary.vertices;
    const adjacent = topologyOf(source).edgeUses(first[0]!, first[1]!)[0]!;
    const followsSide = adjacent.from === first[0] &&
        adjacent.to === first[1];
    const outward = (followsSide ? -1 : 1) * Math.sign(area(projected));

    if (localApex.z * outward <= tolerance) {
        fail(operation, "unsupported-topology", "Tip apex points into the source");
    }

    // A fan is only reliable when its apex projects into the
    // convex rim; otherwise the sides may overlap one another.
    const sign = Math.sign(area(projected));
    for (let i = 0; i < projected.length; i++) {
        const a = projected[i]!;
        const b = projected[(i + 1) % projected.length]!;
        const cross = (b.x - a.x) * (localApex.y - a.y) -
            (b.y - a.y) * (localApex.x - a.x);
        if (cross * sign <= tolerance * tolerance) {
            fail(operation, "unsupported-topology", "Tip apex projects outside rim");
        }
    }

    const id = boundary.vertices;
    const triangles = id.map((a, i) => [
        a, id[(i + 1) % id.length]!, -1
    ]);
    const use = topologyOf(source).edgeUses(id[0]!, id[1]!)[0]!;
    if (triangles[0]![0] === use.from &&
        triangles[0]![1] === use.to) {
        triangles.forEach(face => face.reverse());
    }

    const uvs = new Map<number, THREE.Vector2>();
    projected.forEach((uv, i) => uvs.set(id[i]!, uv));
    uvs.set(-1, new THREE.Vector2(localApex.x, localApex.y));

    return appendFaces(
        source, triangles, uvs, options.region, operation, [boundary],
        apex, precision
    );
}
