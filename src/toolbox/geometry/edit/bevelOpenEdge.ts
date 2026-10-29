import * as THREE from "three";

import type { QuadFace, TriangleFace } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    geometryResult,
    GeometryOperationError,
    type BoundaryRef,
    type EdgeRef,
    type FaceRef,
    type GeometryResult,
    type SurfacePatchRef
} from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { patchChartMatches, transferBoundary } from "../kernel/selectionLifecycle";
import { topologyOf } from "../kernel/topology";
import { triangulateProfile } from "../build/triangulateProfile";

type ScalarField = (t: number) => number;
type Face = QuadFace | TriangleFace;

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "unsupported-topology" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("bevelEdges", reason, message);
}

function faceKey(ref: FaceRef): string {
    return ref.kind + ":" + ref.index;
}

function getFace(source: GeometryResult, ref: FaceRef): Face {
    return ref.kind === "quad"
        ? source.geometry.quads[ref.index]!
        : source.geometry.triangles![ref.index]!;
}

function faceNormal(
    points: readonly THREE.Vector3[], face: Face, tolerance: number
): THREE.Vector3 {
    const corners = face.corners.map(id => points[id]!);
    const normal = corners[1]!.clone().sub(corners[0]!)
        .cross(corners[2]!.clone().sub(corners[0]!));
    const length = normal.length();
    if (!(length > tolerance * tolerance)) {
        fail("degenerate-geometry", "Selected face has no normal");
    }
    normal.divideScalar(length);
    if (corners.some(point =>
        Math.abs(point.clone().sub(corners[0]!).dot(normal)) > tolerance
    )) fail("unsupported-topology", "Selected faces must be planar");
    for (let i = 0; i < corners.length; i++) {
        const before = corners[(i + corners.length - 1) % corners.length]!;
        const current = corners[i]!;
        const after = corners[(i + 1) % corners.length]!;
        if (after.clone().sub(current)
            .cross(before.clone().sub(current)).dot(normal) <=
            tolerance * tolerance) {
            fail("unsupported-topology", "Selected face must be convex");
        }
    }
    return normal;
}

interface InsetSide {
    ref: FaceRef;
    face: Face;
    normal: THREE.Vector3;
    from: number;
    to: number;
    start: number;
    end: number;
    firstUV: THREE.Vector2;
    lastUV: THREE.Vector2;
}

/**
 * Terminated edge chamfer. Both adjacent faces are rebuilt as actual
 * concave planar polygons. End triangles taper the bevel to the original
 * endpoints without creating vertices along unrelated shared edges.
 *
 * This domain requires one convex planar face on each side of a manifold
 * edge and a convex dihedral. It does not fabricate multi-edge corner joins.
 */
export function bevelOpenEdge(
    source: GeometryResult,
    edge: EdgeRef,
    width: ScalarField,
    precision?: GeometryPrecision
): GeometryResult {
    const policy = resolvePrecision(precision);
    if (!edge || typeof width !== "function" || !source?.geometry) {
        fail("invalid-input", "Expected owned edge and width field");
    }
    assertSelectionOwner(source, edge);
    const topology = topologyOf(source);
    const openBefore = topology.openBoundaries().length;
    const componentsBefore = topology.connectedComponents().length;
    const original = source.geometry;
    const vertices = original.vertices.map(point => point.clone());
    const extent = new THREE.Box3().setFromPoints(vertices)
        .getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);
    if (![edge.from, edge.to].every(index =>
        Number.isInteger(index) && index >= 0 &&
        index < vertices.length
    ) || edge.from === edge.to) {
        fail("invalid-input", "Invalid edge endpoint indices");
    }
    const uses = [...topology.edgeUses(edge.from, edge.to)].sort(
        (a, b) => Number(b.from === edge.from) -
            Number(a.from === edge.from)
    );
    if (uses.length !== 2) {
        fail("unsupported-topology", "Open chamfer needs exactly two incident faces");
    }
    const a = vertices[edge.from]!;
    const b = vertices[edge.to]!;
    const fullLength = a.distanceTo(b);
    if (fullLength <= tolerance) {
        fail("degenerate-geometry", "Chamfer edge is collapsed");
    }
    const tangent = b.clone().sub(a).normalize();
    const wStart = width(0);
    const wEnd = width(1);
    if (![wStart, wEnd].every(value =>
        Number.isFinite(value) && value > tolerance)) {
        fail("invalid-input", "Chamfer width must be finite and positive");
    }
    // At an acute endpoint, moving into each adjacent face by the
    // requested width also requires moving farther along the edge.
    // Find the shortest terminal taper accepted by *both* footprints
    // before allocating construction vertices. This keeps every
    // unrelated boundary edge and its original stations untouched.
    const sideFrames = uses.map(use => {
        const face = getFace(source, use.face);
        const normal = faceNormal(vertices, face, tolerance);
        const direction = vertices[use.to]!.clone()
            .sub(vertices[use.from]!).normalize();
        return {
            face, normal,
            inward: normal.clone().cross(direction).normalize()
        };
    });
    const strictlyInside = (
        position: THREE.Vector3, face: Face, normal: THREE.Vector3
    ): boolean => face.corners.every((from, i) => {
        const a = vertices[from]!;
        const b = vertices[face.corners[(i + 1) % face.corners.length]!]!;
        const inward = normal.clone().cross(
            b.clone().sub(a).normalize()
        );
        return position.clone().sub(a).dot(inward) > tolerance;
    });
    const terminal = (width: number, start: boolean): number => {
        let length = width;
        for (let attempt = 0; attempt < 32; attempt++) {
            const base = (start ? a : b).clone()
                .addScaledVector(tangent, start ? length : -length);
            if (sideFrames.every(side =>
                strictlyInside(
                    base.clone().addScaledVector(side.inward, width),
                    side.face, side.normal
                )
            )) return length;
            length *= 1.5;
            if (length >= fullLength / 2) break;
        }
        fail("unsupported-topology", "No valid terminal taper fits both adjacent faces");
    };
    const taperStart = terminal(wStart, true);
    const taperEnd = terminal(wEnd, false);
    if (taperStart + taperEnd >= fullLength - tolerance) {
        fail("unsupported-topology", "Chamfer end transitions overlap");
    }

    const sides: InsetSide[] = uses.map((use, index) => {
        const {face, normal, inward: intoFace} = sideFrames[index]!;
        // Trim the selected edge with a diagonal terminal connection
        // from each endpoint to an interior point. The nonselected
        // perimeter remains entirely unchanged.
        const start = vertices.push(
            a.clone().addScaledVector(tangent, taperStart)
                .addScaledVector(intoFace, wStart)
        ) - 1;
        const end = vertices.push(
            b.clone().addScaledVector(tangent, -taperEnd)
                .addScaledVector(intoFace, wEnd)
        ) - 1;
        const polygon = face.corners.map(id => original.vertices[id]!);
        for (const id of [start, end]) {
            const point = vertices[id]!;
            for (let i = 0; i < polygon.length; i++) {
                const from = polygon[i]!;
                const to = polygon[(i + 1) % polygon.length]!;
                const inward = normal.clone().cross(
                    to.clone().sub(from).normalize()
                );
                if (point.clone().sub(from).dot(inward) <= tolerance) {
                    fail("unsupported-topology", "Bevel width leaves an adjacent face");
                }
            }
        }

        // All new face-corner UVs are evaluated using the face's own
        // affine texture chart; neighboring materials may have seams.
        const tri = new THREE.Triangle(...face.corners.slice(0, 3)
            .map(id => original.vertices[id]!) as [
                THREE.Vector3, THREE.Vector3, THREE.Vector3
            ]);
        const evaluate = (point: THREE.Vector3): THREE.Vector2 => {
            const bary = tri.getBarycoord(point, new THREE.Vector3());
            if (!bary) fail("degenerate-geometry", "Face UV projection failed");
            return face.uvs[0]!.clone().multiplyScalar(bary.x)
                .addScaledVector(face.uvs[1]!, bary.y)
                .addScaledVector(face.uvs[2]!, bary.z);
        };
        if (face.corners.some((id, i) =>
            evaluate(original.vertices[id]!)
                .distanceTo(face.uvs[i]!) > tolerance * 16
        )) {
            fail("unsupported-topology", "Selected face has nonaffine UVs");
        }
        return {
            ref: use.face,
            face,
            normal,
            from: use.from,
            to: use.to,
            start,
            end,
            firstUV: evaluate(vertices[start]!),
            lastUV: evaluate(vertices[end]!)
        };
    });

    const [first, second] = sides;
    if (first!.normal.dot(second!.normal) > 1 - policy.angle) {
        fail("unsupported-topology", "Coplanar edge does not need a chamfer");
    }
    if (first!.normal.dot(second!.normal) <= -1 + policy.angle) {
        fail("unsupported-topology", "Opposing faces have ambiguous bevel orientation");
    }
    const chamferNormal = vertices[first!.end]!.clone()
        .sub(vertices[first!.start]!)
        .cross(vertices[second!.start]!.clone()
            .sub(vertices[first!.start]!));
    if (chamferNormal.dot(
        first!.normal.clone().add(second!.normal)
    ) >= -tolerance) {
        fail("unsupported-topology", "Edge is concave or its chamfer reverses");
    }

    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    const references = new Map<string, FaceRef[]>();
    const selected = new Map(sides.map(side => [faceKey(side.ref), side]));

    const add = (face: Face, old: FaceRef): void => {
        const side = selected.get(faceKey(old));
        if (!side) {
            if (face.corners.length === 4) {
                references.set(faceKey(old), [{
                    kind: "quad",
                    index: quads.push({
                        corners: [...face.corners] as QuadFace["corners"],
                        uvs: face.uvs.map(uv => uv.clone()) as QuadFace["uvs"],
                        surface: face.surface,
                        ...(face.smoothingGroup === undefined ? {} :
                            {smoothingGroup: face.smoothingGroup})
                    }) - 1
                }]);
            } else {
                references.set(faceKey(old), [{
                    kind: "triangle",
                    index: triangles.push({
                        corners: [...face.corners] as TriangleFace["corners"],
                        uvs: face.uvs.map(uv => uv.clone()) as TriangleFace["uvs"],
                        surface: face.surface,
                        ...(face.smoothingGroup === undefined ? {} :
                            {smoothingGroup: face.smoothingGroup})
                    }) - 1
                }]);
            }
            return;
        }

        const loop: {id: number; uv: THREE.Vector2}[] = [];
        for (let i = 0; i < face.corners.length; i++) {
            const from = face.corners[i]!;
            const to = face.corners[(i + 1) % face.corners.length]!;
            loop.push({id: from, uv: face.uvs[i]!.clone()});
            if (from === side.from && to === side.to) {
                const fwd = side.from === edge.from;
                const ids = fwd
                    ? [side.start, side.end]
                    : [side.end, side.start];
                for (const id of ids) {
                    loop.push({
                        id,
                        uv: id === side.start
                            ? side.firstUV.clone() : side.lastUV.clone()
                    });
                }
            }
        }
        const basis = new THREE.Vector3().subVectors(
            vertices[face.corners[1]!]!,
            vertices[face.corners[0]!]!
        ).normalize();
        const across = side.normal.clone().cross(basis);
        const base = vertices[face.corners[0]!]!;
        const planar = loop.map(entry => {
            const delta = vertices[entry.id]!.clone().sub(base);
            return new THREE.Vector2(delta.dot(basis), delta.dot(across));
        });
        const split = triangulateProfile([planar], policy);
        const rewritten: FaceRef[] = [];
        for (const indices of split) {
            const ids = indices.map(i => loop[i]!.id);
            const normal = vertices[ids[1]!]!.clone()
                .sub(vertices[ids[0]!]!)
                .cross(vertices[ids[2]!]!.clone().sub(vertices[ids[0]!]!));
            if (normal.dot(side.normal) < 0) {
                ids.reverse();
                indices.reverse();
            }
            rewritten.push({
                kind: "triangle",
                index: triangles.push({
                    corners: ids as TriangleFace["corners"],
                    uvs: indices.map(i => loop[i]!.uv.clone()) as
                        TriangleFace["uvs"],
                    surface: face.surface,
                    ...(face.smoothingGroup === undefined ? {} :
                        {smoothingGroup: face.smoothingGroup})
                }) - 1
            });
        }
        references.set(faceKey(old), rewritten);
    };

    original.quads.forEach((face, index) =>
        add(face, {kind: "quad", index})
    );
    (original.triangles ?? []).forEach((face, index) =>
        add(face, {kind: "triangle", index})
    );

    const a0 = first!.start;
    const b0 = first!.end;
    const a1 = second!.start;
    const b1 = second!.end;
    const perimeterDistance = vertices[a0]!.distanceTo(vertices[b0]!);
    quads.push({
        corners: [a0, a1, b1, b0],
        uvs: [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0, vertices[a0]!.distanceTo(vertices[a1]!)),
            new THREE.Vector2(perimeterDistance,
                vertices[b0]!.distanceTo(vertices[b1]!)),
            new THREE.Vector2(perimeterDistance, 0)
        ],
        surface: "bevel"
    });
    triangles.push(
        {
            corners: [a0, edge.from, a1],
            uvs: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(taperStart, 0),
                new THREE.Vector2(0, vertices[a0]!.distanceTo(vertices[a1]!))
            ],
            surface: "bevel"
        },
        {
            corners: [edge.to, b0, b1],
            uvs: [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(taperEnd, 0),
                new THREE.Vector2(0, vertices[b0]!.distanceTo(vertices[b1]!))
            ],
            surface: "bevel"
        }
    );

    const result = geometryResult({vertices, quads, triangles}, policy);
    const topologyAfter = topologyOf(result);
    if (topologyAfter.openBoundaries().length !== openBefore ||
        topologyAfter.connectedComponents().length !== componentsBefore) {
        fail("invalid-topology", "Chamfer introduced unmatched geometry edges");
    }

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, chains] of Object.entries(source.boundaries)) {
        const retained = chains.flatMap(chain =>
            transferBoundary(source, result, chain, id => id)
        );
        if (retained.length) boundaries[name] = retained;
    }
    (boundaries["bevel-upper"] ??= []).push({
        owner: result.id, closed: false, vertices: [a0, b0]
    });
    (boundaries["bevel-lower"] ??= []).push({
        owner: result.id, closed: false, vertices: [a1, b1]
    });

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, selections] of Object.entries(source.patches ?? {})) {
        for (const selection of selections) {
            assertSelectionOwner(source, selection);
            const faces = selection.faces.flatMap(ref =>
                references.get(faceKey(ref)) ?? []
            );
            if (!faces.length) continue;
            const candidate: SurfacePatchRef = {
                owner: result.id, faces, chart: selection.chart
            };
            if (patchChartMatches(result, candidate, policy)) {
                (patches[name] ??= []).push(candidate);
            }
        }
    }
    return {
        ...result, boundaries,
        ...(Object.keys(patches).length ? {patches} : {})
    };
}
