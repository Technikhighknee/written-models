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
import { bevelOpenEdge } from "./bevelOpenEdge";
import { bevelOpenChain } from "./bevelOpenChain";
import { bevelArticulatedChain } from "./bevelArticulatedChain";

export type ScalarField = (t: number) => number;

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "unsupported-topology" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("bevelEdges", reason, message);
}

function edgeKey(a: number, b: number): string {
    return Math.min(a, b) + ":" + Math.max(a, b);
}

function faceKey(face: FaceRef): string {
    return face.kind + ":" + face.index;
}

/**
 * Bevel one open edge, a consecutive two/three-edge chain around
 * one planar convex cap with trihedral corners, or disjoint convex
 * 3/4-edge prismatic cap rings. Ambiguous junctions are unsupported.
 *
 * All selected vertices are offset consistently once, with a matching
 * inset top rim and lowered side rim. The cap, side faces, and actual
 * chamfer quads share those new construction vertices; no T-junctions
 * or arbitrary face-center stitching are introduced.
 */
export function bevelEdges(
    source: GeometryResult,
    edges: readonly EdgeRef[],
    width: ScalarField,
    precision?: GeometryPrecision
): GeometryResult {
    const policy = resolvePrecision(precision);
    if (!source?.geometry || !Array.isArray(edges) ||
        typeof width !== "function" || !edges.length) {
        fail("invalid-input", "Expected owned selected edges and a width field");
    }
    if (edges.length === 1) {
        return bevelOpenEdge(source, edges[0]!, width, policy);
    }
    if (edges.length >= 2 && edges.at(-1)!.to !== edges[0]!.from &&
        edges.every((edge, i) => i === 0 ||
            edges[i - 1]!.to === edge.from)) {
        const topology = topologyOf(source);
        const shared = topology.edgeUses(edges[0]!.from, edges[0]!.to)
            .map(use => use.face).filter(ref =>
                edges.every(edge => topology.edgeUses(edge.from, edge.to)
                    .some(use => faceKey(use.face) === faceKey(ref))));
        if (shared.length === 1 && edges.length <= 3) {
            return bevelOpenChain(source, edges, width, policy);
        }
        return bevelArticulatedChain(source, edges, width, policy);
    }
    if (edges.length > 4) {
        const loops: EdgeRef[][] = [];
        const used = new Set<number>();
        let current: EdgeRef[] = [];
        for (const edge of edges) {
            assertSelectionOwner(source, edge);
            if (current.length &&
                current.at(-1)!.to !== edge.from) {
                fail("invalid-topology", "Separate beveled loops must each be ordered");
            }
            if (used.has(edge.from)) {
                fail("unsupported-topology", "Bevel loops share a corner");
            }
            used.add(edge.from);
            current.push(edge);
            if (edge.to === current[0]!.from) {
                if (current.length !== 3 && current.length !== 4) {
                    fail("unsupported-topology", "Selected ring requires three or four edges");
                }
                loops.push(current);
                current = [];
            }
        }
        if (current.length || loops.length < 2) {
            fail("unsupported-topology", "Unclosed or ambiguous multi-ring bevel");
        }
        // Each independent ring is reconstructed against the latest
        // geometry snapshot. Existing vertex IDs remain stable; new
        // result owners and all surviving named chains are reissued.
        let result = source;
        for (const loop of loops) {
            result = bevelEdges(result, loop.map(edge => ({
                ...edge, owner: result.id
            })), width, policy);
        }
        return result;
    }
    if (edges.length !== 3 && edges.length !== 4) {
        fail("unsupported-topology", "Open multi-edge bevel junction is not supported");
    }
    const topology = topologyOf(source);
    topology.openBoundaries();
    const vertices = source.geometry.vertices.map(point => point.clone());
    const tolerance = lengthTolerance(
        policy,
        new THREE.Box3().setFromPoints(vertices)
            .getSize(new THREE.Vector3()).length()
    );

    const loop: number[] = [];
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i]!;
        assertSelectionOwner(source, edge);
        if (!Number.isInteger(edge.from) || !Number.isInteger(edge.to) ||
            edge.from < 0 || edge.to < 0 ||
            edge.from >= vertices.length || edge.to >= vertices.length ||
            edge.from === edge.to ||
            edge.to !== edges[(i + 1) % edges.length]!.from ||
            topology.edgeUses(edge.from, edge.to).length !== 2) {
            fail("invalid-topology", "Bevel requires a continuous manifold rim");
        }
        loop.push(edge.from);
    }
    if (new Set(loop).size !== loop.length) {
        fail("invalid-topology", "Bevel rim repeats a vertex");
    }

    const faceUses = edges.map(edge => topology.edgeUses(edge.from, edge.to));
    const common = faceUses[0]!.map(use => use.face).filter(ref =>
        faceUses.every(uses => uses.some(use =>
            faceKey(use.face) === faceKey(ref)
        ))
    );
    if (common.length !== 1) {
        fail("unsupported-topology", "Selected rim must enclose one authored cap face");
    }
    const capRef = common[0]!;
    const cap = capRef.kind === "quad"
        ? source.geometry.quads[capRef.index]!
        : source.geometry.triangles?.[capRef.index];
    if (!cap || cap.corners.length !== loop.length ||
        !cap.corners.every((id, i) => id === loop[i] ||
            id === loop[(i + loop.length - 1) % loop.length])) {
        // Ordering is checked below, independently of the caller's seam.
        if (!cap || !loop.every(id => cap.corners.includes(id))) {
            fail("unsupported-topology", "Rim does not match an entire cap face");
        }
    }

    const first = vertices[cap.corners[0]!]!;
    const second = vertices[cap.corners[1]!]!;
    const third = vertices[cap.corners[2]!]!;
    const normal = new THREE.Vector3().subVectors(second, first)
        .cross(new THREE.Vector3().subVectors(third, first)).normalize();
    if (cap.corners.some(id =>
        Math.abs(vertices[id]!.clone().sub(first).dot(normal)) > tolerance
    )) {
        fail("unsupported-topology", "Bevel cap must be planar");
    }

    // The cap's own directed boundary defines the outward normals of the
    // chamfer faces, regardless of which direction the caller listed.
    const ring = [...cap.corners];
    if (ring.some((a, i) => !edges.some(edge =>
        edgeKey(edge.from, edge.to) === edgeKey(a, ring[(i + 1) % ring.length]!)
    ))) {
        fail("invalid-topology", "Rim is not a single matching cap boundary");
    }

    const lengths = loop.map((id, i) => vertices[id]!.distanceTo(
        vertices[loop[(i + 1) % loop.length]!]!
    ));
    const perimeter = lengths.reduce((total, length) => total + length, 0);
    if (!(perimeter > tolerance * loop.length)) {
        fail("degenerate-geometry", "Collapsed beveled rim");
    }
    const widths = new Map<number, number>();
    let travelled = 0;
    for (let i = 0; i < loop.length; i++) {
        const value = width(travelled / perimeter);
        if (!Number.isFinite(value) || value <= tolerance) {
            fail("invalid-input", "Bevel width must be finite and positive");
        }
        widths.set(loop[i]!, value);
        travelled += lengths[i]!;
    }

    const sideFaces = new Map<string, {index: number; top: [number, number]}>();
    const bottoms = new Map<number, number>();
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const other = topology.edgeUses(a, b).find(use =>
            faceKey(use.face) !== faceKey(capRef)
        );
        if (!other || other.face.kind !== "quad") {
            fail("unsupported-topology", "Rim must meet one authored quad side per edge");
        }
        const side = source.geometry.quads[other.face.index]!;
        if (!side.corners.includes(a) || !side.corners.includes(b)) {
            fail("invalid-topology", "Side and cap do not share their physical edge");
        }
        const neighbor = (vertex: number): number => {
            const j = side.corners.indexOf(vertex);
            const before = side.corners[(j + 3) % 4]!;
            const after = side.corners[(j + 1) % 4]!;
            return before === (vertex === a ? b : a) ? after : before;
        };
        for (const vertex of [a, b]) {
            const bottom = neighbor(vertex);
            const delta = vertices[bottom]!.clone().sub(vertices[vertex]!);
            const depth = -delta.dot(normal);
            if (!(depth > widths.get(vertex)! + tolerance) ||
                delta.addScaledVector(normal, depth).length() > tolerance) {
                fail("unsupported-topology", "Sides must extend beyond bevel width along cap normal");
            }
            const old = bottoms.get(vertex);
            if (old !== undefined && old !== bottom) {
                fail("unsupported-topology", "Adjacent sides lack shared vertical corner edges");
            }
            bottoms.set(vertex, bottom);
        }
        sideFaces.set(edgeKey(a, b), {
            index: other.face.index, top: [a, b]
        });
    }
    if (new Set([...sideFaces.values()].map(face => face.index)).size !==
        ring.length) {
        fail("unsupported-topology", "Ambiguous cap-side corner junction");
    }

    // An inward offset of a convex polygon is the intersection of its
    // adjacent offset lines. Every inset point must be strictly interior.
    const inset = new Map<number, number>();
    const lowered = new Map<number, number>();
    for (let i = 0; i < ring.length; i++) {
        const id = ring[i]!;
        const previous = vertices[ring[(i + ring.length - 1) % ring.length]!]!;
        const current = vertices[id]!;
        const next = vertices[ring[(i + 1) % ring.length]!]!;
        const incoming = current.clone().sub(previous).normalize();
        const outgoing = next.clone().sub(current).normalize();
        const turn = new THREE.Vector3().crossVectors(
            incoming, outgoing
        ).dot(normal);
        if (turn <= Math.sin(policy.angle)) {
            fail("unsupported-topology", "Bevel needs a strictly convex cap");
        }
        const inwardA = new THREE.Vector3().crossVectors(normal, incoming);
        const inwardB = new THREE.Vector3().crossVectors(normal, outgoing);
        const denom = 1 + inwardA.dot(inwardB);
        if (!(denom > Math.sin(policy.angle))) {
            fail("unsupported-topology", "Cap corner has an ambiguous inset");
        }
        const value = widths.get(id)!;
        const point = current.clone().addScaledVector(
            inwardA.add(inwardB), value / denom
        );
        // Every other edge must contain the new cap vertex in its strict
        // inner half-plane; this also rejects excessive bevel widths.
        for (let j = 0; j < ring.length; j++) {
            const from = vertices[ring[j]!]!;
            const to = vertices[ring[(j + 1) % ring.length]!]!;
            const inward = new THREE.Vector3().crossVectors(
                normal, to.clone().sub(from).normalize()
            );
            if (point.clone().sub(from).dot(inward) <= tolerance) {
                fail("unsupported-topology", "Bevel inset overlaps or leaves its cap");
            }
        }
        inset.set(id, vertices.push(point) - 1);
        lowered.set(id, vertices.push(
            current.clone().addScaledVector(normal, -value)
        ) - 1);
    }

    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const original = vertices[b]!.clone().sub(vertices[a]!);
        const shortened = vertices[inset.get(b)!]!.clone()
            .sub(vertices[inset.get(a)!]!);
        if (shortened.dot(original) <=
            tolerance * original.length()) {
            fail("unsupported-topology", "Bevel inset collapses or reverses an edge");
        }
    }

    // A face-local affine UV map is the only valid unambiguous projection
    // for a cap that will have its vertices moved.
    const triangle = new THREE.Triangle(first, second, third);
    const affineUV = (point: THREE.Vector3): THREE.Vector2 => {
        const bary = triangle.getBarycoord(point, new THREE.Vector3());
        if (!bary) fail("degenerate-geometry", "Cap UV basis collapsed");
        return cap.uvs[0]!.clone().multiplyScalar(bary.x)
            .addScaledVector(cap.uvs[1]!, bary.y)
            .addScaledVector(cap.uvs[2]!, bary.z);
    };
    if (cap.corners.some((id, i) =>
        affineUV(vertices[id]!).distanceTo(cap.uvs[i]!) > tolerance * 16
    )) {
        fail("unsupported-topology", "Cap has no affine texture UV mapping");
    }

    const quads: QuadFace[] = source.geometry.quads.map(face => ({
        ...face,
        corners: [...face.corners] as QuadFace["corners"],
        uvs: face.uvs.map(uv => uv.clone()) as QuadFace["uvs"]
    }));
    const triangles: TriangleFace[] = (source.geometry.triangles ?? [])
        .map(face => ({
            ...face,
            corners: [...face.corners] as TriangleFace["corners"],
            uvs: face.uvs.map(uv => uv.clone()) as TriangleFace["uvs"]
        }));

    const selectedCap = capRef.kind === "quad"
        ? quads[capRef.index]! : triangles[capRef.index]!;
    selectedCap.corners = selectedCap.corners.map(id => inset.get(id)!) as
        typeof selectedCap.corners;
    selectedCap.uvs = selectedCap.corners.map(id => affineUV(vertices[id]!)) as
        typeof selectedCap.uvs;

    for (const item of sideFaces.values()) {
        const side = quads[item.index]!;
        const old = source.geometry.quads[item.index]!;
        const original = [...side.corners];
        side.corners = original.map(id => lowered.get(id) ?? id) as
            QuadFace["corners"];
        side.uvs = original.map((id, i) => {
            if (!lowered.has(id)) return old.uvs[i]!.clone();
            const neighbors = [
                original[(i + 3) % 4]!,
                original[(i + 1) % 4]!
            ];
            const other = neighbors.find(candidate =>
                !ring.includes(candidate)
            );
            if (other === undefined) {
                fail("unsupported-topology", "Side has no lower UV anchor");
            }
            const lower = original.indexOf(other);
            const depth = vertices[id]!.distanceTo(vertices[other]!);
            return old.uvs[i]!.clone().lerp(
                old.uvs[lower]!, widths.get(id)! / depth
            );
        }) as QuadFace["uvs"];
    }

    const topIds = ring.map(id => inset.get(id)!);
    const bottomIds = ring.map(id => lowered.get(id)!);
    const along = [0];
    for (let i = 0; i < ring.length; i++) {
        along.push(along.at(-1)! +
            vertices[topIds[i]!]!.distanceTo(
                vertices[topIds[(i + 1) % ring.length]!]!
            ));
    }
    for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        quads.push({
            corners: [topIds[j]!, topIds[i]!, bottomIds[i]!, bottomIds[j]!],
            uvs: [
                new THREE.Vector2(along[i + 1]!, 0),
                new THREE.Vector2(along[i]!, 0),
                new THREE.Vector2(along[i]!, vertices[topIds[i]!]!
                    .distanceTo(vertices[bottomIds[i]!]!)),
                new THREE.Vector2(along[i + 1]!,
                    vertices[topIds[j]!]!.distanceTo(vertices[bottomIds[j]!]!))
            ],
            surface: "bevel"
        });
    }

    const result = geometryResult({vertices, quads, triangles}, policy);
    if (topologyOf(result).openBoundaries().length !==
        topology.openBoundaries().length) {
        fail("invalid-topology", "Bevel changed the source's manifold boundaries");
    }
    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, chains] of Object.entries(source.boundaries)) {
        const retained = chains.flatMap(chain =>
            transferBoundary(source, result, chain, id => id)
        );
        if (retained.length) boundaries[name] = retained;
    }
    (boundaries["bevel-upper"] ??= []).push({
        owner: result.id, vertices: topIds, closed: true
    });
    (boundaries["bevel-lower"] ??= []).push({
        owner: result.id, vertices: bottomIds, closed: true
    });

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, entries] of Object.entries(source.patches ?? {})) {
        for (const patch of entries) {
            assertSelectionOwner(source, patch);
            const candidate: SurfacePatchRef = {
                owner: result.id,
                chart: patch.chart,
                faces: patch.faces.map(face => ({...face}))
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
