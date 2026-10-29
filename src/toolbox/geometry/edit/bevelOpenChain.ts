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
import { lengthTolerance, resolvePrecision, type GeometryPrecision } from "../kernel/precision";
import { patchChartMatches, transferBoundary } from "../kernel/selectionLifecycle";
import { topologyOf } from "../kernel/topology";
import { triangulateProfile } from "../build/triangulateProfile";

type Face = QuadFace | TriangleFace;
type ScalarField = (t: number) => number;

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "unsupported-topology" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("bevelEdges", reason, message);
}

function key(ref: FaceRef): string {
    return ref.kind + ":" + ref.index;
}

function faceOf(source: GeometryResult, ref: FaceRef): Face {
    return ref.kind === "quad"
        ? source.geometry.quads[ref.index]!
        : source.geometry.triangles![ref.index]!;
}

function normalOf(points: readonly THREE.Vector3[], face: Face,
    tolerance: number): THREE.Vector3 {
    const vertices = face.corners.map(id => points[id]!);
    const result = vertices[1]!.clone().sub(vertices[0]!)
        .cross(vertices[2]!.clone().sub(vertices[0]!));
    if (!(result.length() > tolerance * tolerance)) {
        fail("degenerate-geometry", "Selected face has collapsed normal");
    }
    result.normalize();
    for (let i = 0; i < vertices.length; i++) {
        const previous = vertices[(i + vertices.length - 1) % vertices.length]!;
        const current = vertices[i]!;
        const next = vertices[(i + 1) % vertices.length]!;
        if (Math.abs(current.clone().sub(vertices[0]!).dot(result)) > tolerance ||
            next.clone().sub(current)
                .cross(previous.clone().sub(current)).dot(result) <=
                tolerance * tolerance) {
            fail("unsupported-topology", "Selected face must be planar and convex");
        }
    }
    return result;
}

function inside(point: THREE.Vector3, points: readonly THREE.Vector3[],
    face: Face, normal: THREE.Vector3, tolerance: number): boolean {
    return face.corners.every((id, i) => {
        const from = points[id]!;
        const to = points[face.corners[(i + 1) % face.corners.length]!]!;
        const direction = to.clone().sub(from).normalize();
        return point.clone().sub(from)
            .dot(normal.clone().cross(direction)) > tolerance;
    });
}

interface FaceSide {
    ref: FaceRef;
    face: Face;
    normal: THREE.Vector3;
    inward: THREE.Vector3;
}

interface Rail {
    cap: number;
    side: number;
}

/**
 * Reconstruct a connected, nonclosed run of consecutive edges around
 * one convex planar cap. Every edge has a separate planar side face,
 * and each intermediate vertex is exactly trihedral: the adjacent
 * side faces share an unselected third edge.
 *
 * Each inside corner uses ONE cap miter vertex and ONE side vertex
 * on that third edge. Adjacent chamfer panels share these exact
 * vertices, rather than inventing overlapping terminated bevels.
 */
export function bevelOpenChain(
    source: GeometryResult,
    edges: readonly EdgeRef[],
    width: ScalarField,
    precision?: GeometryPrecision
): GeometryResult {
    const policy = resolvePrecision(precision);
    if (!source?.geometry || typeof width !== "function" ||
        !Array.isArray(edges) || edges.length < 2) {
        fail("invalid-input", "Expected an open multi-edge chain");
    }
    const topology = topologyOf(source);
    const oldOpen = topology.openBoundaries().length;
    const oldComponents = topology.connectedComponents().length;
    const original = source.geometry;
    const vertices = original.vertices.map(point => point.clone());
    const tolerance = lengthTolerance(policy,
        new THREE.Box3().setFromPoints(vertices)
            .getSize(new THREE.Vector3()).length());
    const chain = [edges[0]!.from];
    for (const edge of edges) {
        assertSelectionOwner(source, edge);
        if (!Number.isInteger(edge.from) || !Number.isInteger(edge.to) ||
            edge.from !== chain.at(-1) ||
            edge.from < 0 || edge.to < 0 ||
            edge.from >= vertices.length || edge.to >= vertices.length ||
            topology.edgeUses(edge.from, edge.to).length !== 2) {
            fail("invalid-topology", "The selected edges must form an ordered manifold chain");
        }
        chain.push(edge.to);
    }
    if (new Set(chain).size !== chain.length) {
        fail("unsupported-topology", "Chain repeats a corner or closes");
    }

    const uses = edges.map(e => topology.edgeUses(e.from, e.to));
    const common = uses[0]!.map(u => u.face).filter(ref =>
        uses.every(pair => pair.some(u => key(u.face) === key(ref))));
    if (common.length !== 1) {
        fail("unsupported-topology", "Open chain needs one common planar cap face");
    }
    const capRef = common[0]!;
    const cap = faceOf(source, capRef);
    const capNormal = normalOf(vertices, cap, tolerance);
    if (chain.some(id => !cap.corners.includes(id)) ||
        edges.length >= cap.corners.length) {
        fail("unsupported-topology", "Selected chain must cover part of one cap perimeter");
    }

    const sideFaces: FaceSide[] = [];
    const capInward: THREE.Vector3[] = [];
    const sideInward: THREE.Vector3[] = [];
    for (const pair of uses) {
        const capUse = pair.find(use => key(use.face) === key(capRef));
        const sideUse = pair.find(use => key(use.face) !== key(capRef));
        if (!capUse || !sideUse) {
            fail("invalid-topology", "An edge lacks its two incident faces");
        }
        const other = faceOf(source, sideUse.face);
        const otherNormal = normalOf(vertices, other, tolerance);
        const inCap = capNormal.clone().cross(
            vertices[capUse.to]!.clone().sub(vertices[capUse.from]!)
                .normalize()
        );
        const inSide = otherNormal.clone().cross(
            vertices[sideUse.to]!.clone().sub(vertices[sideUse.from]!)
                .normalize()
        );
        if (capNormal.dot(otherNormal) > 1 - policy.angle ||
            capNormal.dot(otherNormal) <= -1 + policy.angle ||
            inCap.dot(otherNormal) >= -Math.sin(policy.angle)) {
            fail("unsupported-topology", "Selected edge needs a convex dihedral");
        }
        sideFaces.push({
            ref: sideUse.face, face: other,
            normal: otherNormal, inward: inSide
        });
        capInward.push(inCap);
        sideInward.push(inSide);
    }
    if (new Set(sideFaces.map(s => key(s.ref))).size !== edges.length) {
        fail("unsupported-topology", "Adjacent bevel segments share a side face");
    }

    const travel = [0];
    for (let i = 0; i < edges.length; i++) {
        travel.push(travel.at(-1)! +
            vertices[chain[i]!]!.distanceTo(vertices[chain[i + 1]!]!));
    }
    const length = travel.at(-1)!;
    if (!(length > tolerance)) fail("degenerate-geometry", "Chain has no length");
    const widths = travel.map(distance => width(distance / length));
    if (widths.some(w => !Number.isFinite(w) || w <= tolerance)) {
        fail("invalid-input", "Bevel widths must be finite and positive");
    }

    // A terminal taper starts inside BOTH incident planar footprints.
    const terminals: Rail[] = [];
    const terminal = (index: number, start: boolean): Rail => {
        const from = chain[index]!;
        const to = chain[index + 1]!;
        const edgeLength = vertices[from]!.distanceTo(vertices[to]!);
        const tangent = vertices[to]!.clone().sub(vertices[from]!).normalize();
        const vertex = vertices[start ? from : to]!;
        const w = widths[start ? index : index + 1]!;
        let insetDistance = w;
        for (let attempt = 0; attempt < 32; attempt++) {
            const base = vertex.clone().addScaledVector(
                tangent, start ? insetDistance : -insetDistance
            );
            const capPoint = base.clone().addScaledVector(capInward[index]!, w);
            const sidePoint = base.clone().addScaledVector(sideInward[index]!, w);
            if (inside(capPoint, vertices, cap, capNormal, tolerance) &&
                inside(sidePoint, vertices, sideFaces[index]!.face,
                    sideFaces[index]!.normal, tolerance)) {
                return {
                    cap: vertices.push(capPoint) - 1,
                    side: vertices.push(sidePoint) - 1
                };
            }
            insetDistance *= 1.5;
            if (insetDistance >= edgeLength / 2) break;
        }
        fail("unsupported-topology", "No terminal taper fits the two faces");
    };

    terminals.push(terminal(0, true));
    const joins: Rail[] = [];
    for (let index = 1; index < edges.length; index++) {
        const corner = chain[index]!;
        const point = vertices[corner]!;
        const inwardA = capInward[index - 1]!;
        const inwardB = capInward[index]!;
        const denom = 1 + inwardA.dot(inwardB);
        const w = widths[index]!;
        if (!(denom > Math.sin(policy.angle))) {
            fail("unsupported-topology", "Cap corner has no valid offset intersection");
        }
        const capPoint = point.clone().addScaledVector(
            inwardA.clone().add(inwardB), w / denom
        );
        if (!inside(capPoint, vertices, cap, capNormal, tolerance)) {
            fail("unsupported-topology", "Cap corner miter leaves the source face");
        }

        const first = sideFaces[index - 1]!;
        const second = sideFaces[index]!;
        const neighbors = (side: FaceSide): number[] => {
            const i = side.face.corners.indexOf(corner);
            const before = side.face.corners[
                (i + side.face.corners.length - 1) % side.face.corners.length
            ]!;
            const after = side.face.corners[
                (i + 1) % side.face.corners.length
            ]!;
            return [before, after].filter(id =>
                id !== chain[index - 1] && id !== chain[index + 1]
            );
        };
        const other = neighbors(first).filter(id => neighbors(second)
            .includes(id));
        if (other.length !== 1) {
            fail("unsupported-topology", "Corner side faces lack one shared third edge");
        }
        const direction = vertices[other[0]!]!.clone().sub(point);
        const total = direction.length();
        direction.normalize();
        const projectedA = direction.dot(first.inward);
        const projectedB = direction.dot(second.inward);
        if (projectedA <= Math.sin(policy.angle) ||
            projectedB <= Math.sin(policy.angle)) {
            fail("unsupported-topology", "Corner third edge does not enter both side faces");
        }
        const distanceA = w / projectedA;
        const distanceB = w / projectedB;
        if (Math.abs(distanceA - distanceB) > tolerance * 8 ||
            distanceA >= total - tolerance) {
            fail("unsupported-topology", "Side corner offsets do not share a point");
        }

        // Only the three selected faces may meet at this source corner.
        const incident: string[] = [];
        original.quads.forEach((face, i) => {
            if (face.corners.includes(corner)) incident.push("quad:" + i);
        });
        (original.triangles ?? []).forEach((face, i) => {
            if (face.corners.includes(corner)) incident.push("triangle:" + i);
        });
        const expected = [key(capRef), key(first.ref), key(second.ref)];
        if (incident.length !== 3 ||
            incident.some(ref => !expected.includes(ref))) {
            fail("unsupported-topology", "Multi-edge junction is not trihedral");
        }
        joins.push({
            cap: vertices.push(capPoint) - 1,
            side: vertices.push(
                point.clone().addScaledVector(direction, distanceA)
            ) - 1
        });
    }
    terminals.push(terminal(edges.length - 1, false));

    const railAt = (segment: number, end: boolean): Rail => {
        if (!end) return segment === 0
            ? terminals[0]! : joins[segment - 1]!;
        return segment === edges.length - 1
            ? terminals[1]! : joins[segment]!;
    };

    for (let i = 0; i < edges.length; i++) {
        const direction = vertices[chain[i + 1]!]!.clone()
            .sub(vertices[chain[i]!]!).normalize();
        const start = railAt(i, false);
        const end = railAt(i, true);
        for (const side of ["cap", "side"] as const) {
            if (vertices[end[side]]!.clone()
                .sub(vertices[start[side]]!).dot(direction) <= tolerance) {
                fail("unsupported-topology", "Bevel width reverses an inner rail");
            }
        }
    }

    // The unselected part of a face boundary is unchanged. Replace
    // the chain's original corners with shared miter vertices and
    // insert terminal stations along the first/last selected edges.
    const replacements = new Map<string, Map<number, number>>();
    const insertions = new Map<string, Map<string, number>>();
    const record = (ref: FaceRef, originalId: number, replacement: number) => {
        const mapping = replacements.get(key(ref)) ?? new Map();
        mapping.set(originalId, replacement);
        replacements.set(key(ref), mapping);
    };
    const insert = (ref: FaceRef, from: number, to: number,
        id: number) => {
        const lookup = insertions.get(key(ref)) ?? new Map();
        const forward = from + ":" + to;
        const reverse = to + ":" + from;
        const oriented = faceOf(source, ref).corners.some((corner, i) =>
            corner === from &&
            faceOf(source, ref).corners[(i + 1) %
                faceOf(source, ref).corners.length] === to
        );
        lookup.set(oriented ? forward : reverse, id);
        insertions.set(key(ref), lookup);
    };

    for (let i = 1; i < chain.length - 1; i++) {
        record(capRef, chain[i]!, joins[i - 1]!.cap);
        record(sideFaces[i - 1]!.ref, chain[i]!, joins[i - 1]!.side);
        record(sideFaces[i]!.ref, chain[i]!, joins[i - 1]!.side);
    }
    for (let i = 0; i < edges.length; i++) {
        const a = chain[i]!;
        const b = chain[i + 1]!;
        const beginning = railAt(i, false);
        const ending = railAt(i, true);
        if (i === 0) {
            insert(capRef, a, b, beginning.cap);
            insert(sideFaces[i]!.ref, a, b, beginning.side);
        }
        if (i === edges.length - 1) {
            insert(capRef, a, b, ending.cap);
            insert(sideFaces[i]!.ref, a, b, ending.side);
        }
    }

    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    const faceMapping = new Map<string, FaceRef[]>();
    const selectedFaces = new Set([key(capRef), ...sideFaces.map(s => key(s.ref))]);

    const emit = (face: Face, ref: FaceRef): void => {
        if (!selectedFaces.has(key(ref))) {
            const data = {
                corners: [...face.corners],
                uvs: face.uvs.map(uv => uv.clone()),
                surface: face.surface,
                ...(face.smoothingGroup === undefined ? {} :
                    {smoothingGroup: face.smoothingGroup})
            };
            if (face.corners.length === 4) {
                faceMapping.set(key(ref), [{
                    kind: "quad", index: quads.push({
                        ...data, corners: data.corners as QuadFace["corners"],
                        uvs: data.uvs as QuadFace["uvs"]
                    }) - 1
                }]);
            } else {
                faceMapping.set(key(ref), [{
                    kind: "triangle", index: triangles.push({
                        ...data, corners: data.corners as TriangleFace["corners"],
                        uvs: data.uvs as TriangleFace["uvs"]
                    }) - 1
                }]);
            }
            return;
        }
        const normal = normalOf(original.vertices, face, tolerance);
        const originalPoints = face.corners.map(id => original.vertices[id]!);
        const bary = new THREE.Triangle(
            originalPoints[0]!, originalPoints[1]!, originalPoints[2]!
        );
        const uvAt = (position: THREE.Vector3): THREE.Vector2 => {
            const weights = bary.getBarycoord(position, new THREE.Vector3());
            if (!weights) fail("degenerate-geometry", "Face UV basis failed");
            return face.uvs[0]!.clone().multiplyScalar(weights.x)
                .addScaledVector(face.uvs[1]!, weights.y)
                .addScaledVector(face.uvs[2]!, weights.z);
        };
        if (face.corners.some((id, index) =>
            uvAt(original.vertices[id]!).distanceTo(face.uvs[index]!) >
                tolerance * 16
        )) {
            fail("unsupported-topology", "Selected face has nonlinear or seamed UVs");
        }
        const mapping = replacements.get(key(ref)) ?? new Map();
        const additional = insertions.get(key(ref)) ?? new Map();
        const loop: number[] = [];
        for (let i = 0; i < face.corners.length; i++) {
            const from = face.corners[i]!;
            const to = face.corners[(i + 1) % face.corners.length]!;
            loop.push(mapping.get(from) ?? from);
            const value = additional.get(from + ":" + to);
            if (value !== undefined) loop.push(value);
        }
        if (new Set(loop).size !== loop.length) {
            fail("invalid-topology", "Corner reconstruction repeated a face vertex");
        }
        const origin = originalPoints[0]!;
        const x = originalPoints[1]!.clone().sub(origin).normalize();
        const y = normal.clone().cross(x);
        const planar = loop.map(id => {
            const delta = vertices[id]!.clone().sub(origin);
            if (Math.abs(delta.dot(normal)) > tolerance) {
                fail("invalid-topology", "Reconstructed corner left its source plane");
            }
            return new THREE.Vector2(delta.dot(x), delta.dot(y));
        });
        const triangulated = triangulateProfile([planar], policy);
        const mapped: FaceRef[] = [];
        for (const triangle of triangulated) {
            const ordered = [...triangle];
            const ids = ordered.map(i => loop[i]!);
            const direction = vertices[ids[1]!]!.clone()
                .sub(vertices[ids[0]!]!)
                .cross(vertices[ids[2]!]!.clone().sub(vertices[ids[0]!]!));
            if (direction.dot(normal) < 0) {
                ordered.reverse();
                ids.reverse();
            }
            mapped.push({
                kind: "triangle",
                index: triangles.push({
                    corners: ids as TriangleFace["corners"],
                    uvs: ordered.map(i => uvAt(vertices[loop[i]!]!)) as
                        TriangleFace["uvs"],
                    surface: face.surface,
                    ...(face.smoothingGroup === undefined ? {} :
                        {smoothingGroup: face.smoothingGroup})
                }) - 1
            });
        }
        faceMapping.set(key(ref), mapped);
    };

    original.quads.forEach((face, index) =>
        emit(face, {kind: "quad", index}));
    (original.triangles ?? []).forEach((face, index) =>
        emit(face, {kind: "triangle", index}));

    const orient = (ids: number[], normal: THREE.Vector3): number[] => {
        const first = vertices[ids[0]!]!;
        const second = vertices[ids[1]!]!;
        const third = vertices[ids[2]!]!;
        return second.clone().sub(first)
            .cross(third.clone().sub(first)).dot(normal) > 0
            ? ids : ids.reverse();
    };
    const target = (index: number) => capNormal.clone()
        .add(sideFaces[index]!.normal);
    const upper = [terminals[0]!.cap, ...joins.map(v => v.cap),
        terminals[1]!.cap];
    const lower = [terminals[0]!.side, ...joins.map(v => v.side),
        terminals[1]!.side];

    for (let i = 0; i < edges.length; i++) {
        const first = railAt(i, false);
        const last = railAt(i, true);
        const ordered = orient([
            first.cap, first.side, last.side, last.cap
        ], target(i));
        const u0 = travel[i]!;
        const u1 = travel[i + 1]!;
        const coords = new Map([
            [first.cap, new THREE.Vector2(u0, 0)],
            [first.side, new THREE.Vector2(u0,
                vertices[first.cap]!.distanceTo(vertices[first.side]!))],
            [last.side, new THREE.Vector2(u1,
                vertices[last.cap]!.distanceTo(vertices[last.side]!))],
            [last.cap, new THREE.Vector2(u1, 0)]
        ]);
        quads.push({
            corners: ordered as QuadFace["corners"],
            uvs: ordered.map(id => coords.get(id)!.clone()) as
                QuadFace["uvs"],
            surface: "bevel"
        });
    }
    const tips: [number, Rail, number, number][] = [
        [chain[0]!, terminals[0]!, 0, 0],
        [chain.at(-1)!, terminals[1]!, edges.length - 1, edges.length]
    ];
    for (const [tip, rail, index, station] of tips) {
        const ordered = orient([tip, rail.side, rail.cap], target(index));
        const coords = new Map([
            [tip, new THREE.Vector2(travel[station]!, 0)],
            [rail.cap, new THREE.Vector2(travel[station]!, widths[station]!)],
            [rail.side, new THREE.Vector2(travel[station]!,
                widths[station]! * 2)]
        ]);
        triangles.push({
            corners: ordered as TriangleFace["corners"],
            uvs: ordered.map(id => coords.get(id)!.clone()) as
                TriangleFace["uvs"],
            surface: "bevel"
        });
    }

    const result = geometryResult({vertices, quads, triangles}, policy);
    const after = topologyOf(result);
    if (after.openBoundaries().length !== oldOpen ||
        after.connectedComponents().length !== oldComponents) {
        fail("invalid-topology", "Connected bevel chain opened or disconnected the mesh");
    }

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(source.boundaries)) {
        const preserved = refs.flatMap(ref =>
            transferBoundary(source, result, ref, id => id));
        if (preserved.length) boundaries[name] = preserved;
    }
    (boundaries["bevel-upper"] ??= []).push({
        owner: result.id, vertices: upper, closed: false
    });
    (boundaries["bevel-lower"] ??= []).push({
        owner: result.id, vertices: lower, closed: false
    });
    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(source.patches ?? {})) {
        for (const patch of refs) {
            assertSelectionOwner(source, patch);
            const mapped = patch.faces.flatMap(ref =>
                faceMapping.get(key(ref)) ?? []);
            if (!mapped.length) continue;
            const candidate: SurfacePatchRef = {
                owner: result.id, faces: mapped, chart: patch.chart
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
