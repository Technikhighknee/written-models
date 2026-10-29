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
import {
    patchChartMatches,
    transferBoundary
} from "../kernel/selectionLifecycle";
import { topologyOf } from "../kernel/topology";
import { triangulateProfile } from "../build/triangulateProfile";

type Face = QuadFace | TriangleFace;
type ScalarField = (t: number) => number;
type Side = { ref: FaceRef; face: Face; normal: THREE.Vector3; inward: THREE.Vector3 };
type EdgeSection = { first: Side; second: Side };
type Rail = Map<string, number>;

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
    const corners = face.corners.map(id => points[id]!);
    const normal = corners[1]!.clone().sub(corners[0]!)
        .cross(corners[2]!.clone().sub(corners[0]!));
    if (!(normal.length() > tolerance * tolerance)) {
        fail("degenerate-geometry", "Face normal collapsed");
    }
    normal.normalize();
    for (let i = 0; i < corners.length; i++) {
        const before = corners[(i + corners.length - 1) % corners.length]!;
        const current = corners[i]!;
        const after = corners[(i + 1) % corners.length]!;
        if (Math.abs(current.clone().sub(corners[0]!).dot(normal)) > tolerance ||
            after.clone().sub(current)
                .cross(before.clone().sub(current)).dot(normal) <=
                tolerance * tolerance) {
            fail("unsupported-topology", "Articulated bevel needs convex planar faces");
        }
    }
    return normal;
}

function strictlyInside(
    position: THREE.Vector3, source: readonly THREE.Vector3[],
    side: Side, tolerance: number
): boolean {
    return side.face.corners.every((from, i) => {
        const a = source[from]!;
        const b = source[side.face.corners[
            (i + 1) % side.face.corners.length
        ]!]!;
        const inward = side.normal.clone().cross(b.clone()
            .sub(a).normalize());
        return position.clone().sub(a).dot(inward) > tolerance;
    });
}

/**
 * Bevel an ordered, nonbranching run across different convex planar
 * faces. Every internal vertex has exactly three incident faces.
 * For each corner one bevel rail meets on the shared face's miter;
 * the other meets on the third unselected physical edge.
 *
 * No independently terminated chamfers or synthetic render-only
 * triangles are introduced at shared vertices.
 */
export function bevelArticulatedChain(
    source: GeometryResult,
    edges: readonly EdgeRef[],
    width: ScalarField,
    precision?: GeometryPrecision
): GeometryResult {
    const policy = resolvePrecision(precision);
    if (!source?.geometry || !Array.isArray(edges) ||
        edges.length < 2 || typeof width !== "function") {
        fail("invalid-input", "Expected ordered manifold edge chain");
    }
    const topology = topologyOf(source);
    const oldBoundaries = topology.openBoundaries().length;
    const oldComponents = topology.connectedComponents().length;
    const original = source.geometry;
    const positions = original.vertices.map(v => v.clone());
    const tolerance = lengthTolerance(policy,
        new THREE.Box3().setFromPoints(positions)
            .getSize(new THREE.Vector3()).length());

    const chain = [edges[0]!.from];
    for (const edge of edges) {
        assertSelectionOwner(source, edge);
        if (!Number.isInteger(edge.from) ||
            !Number.isInteger(edge.to) ||
            edge.from !== chain.at(-1) ||
            edge.from < 0 || edge.to < 0 ||
            edge.from >= positions.length ||
            edge.to >= positions.length ||
            topology.edgeUses(edge.from, edge.to).length !== 2) {
            fail("invalid-topology", "Selected edges must be an ordered manifold chain");
        }
        chain.push(edge.to);
    }
    if (new Set(chain).size !== chain.length) {
        fail("unsupported-topology", "Chain is closed or branches at a vertex");
    }

    const sections: EdgeSection[] = edges.map(edge => {
        const length = positions[edge.to]!.distanceTo(positions[edge.from]!);
        if (!(length > tolerance)) {
            fail("degenerate-geometry", "Selected edge has collapsed length");
        }
        const sides = topology.edgeUses(edge.from, edge.to).map(use => {
            const face = faceOf(source, use.face);
            const normal = normalOf(positions, face, tolerance);
            const direction = positions[use.to]!.clone()
                .sub(positions[use.from]!).normalize();
            return {
                ref: use.face, face, normal,
                inward: normal.clone().cross(direction).normalize()
            };
        });
        if (sides.length !== 2) {
            fail("unsupported-topology", "Selected edge must have two faces");
        }
        const [first, second] = sides;
        const angle = first!.normal.dot(second!.normal);
        if (angle >= 1 - policy.angle ||
            angle <= -1 + policy.angle ||
            first!.inward.dot(second!.normal) >= -Math.sin(policy.angle)) {
            fail("unsupported-topology", "Selected edge has no convex dihedral");
        }
        return {first: first!, second: second!};
    });

    const lengths = [0];
    for (const edge of edges) {
        lengths.push(lengths.at(-1)! +
            positions[edge.from]!.distanceTo(positions[edge.to]!));
    }
    const length = lengths.at(-1)!;
    if (!(length > tolerance)) fail("degenerate-geometry", "Collapsed chain length");
    const widths = lengths.map(value => width(value / length));
    if (widths.some(value => !Number.isFinite(value) ||
        value <= tolerance)) {
        fail("invalid-input", "Widths must be finite and positive");
    }

    const rail = (section: EdgeSection, points: {
        first: THREE.Vector3; second: THREE.Vector3
    }): Rail => new Map([
        [key(section.first.ref), positions.push(points.first) - 1],
        [key(section.second.ref), positions.push(points.second) - 1]
    ]);

    function terminal(index: number, first: boolean): Rail {
        const edge = edges[index]!;
        const section = sections[index]!;
        const a = positions[edge.from]!;
        const b = positions[edge.to]!;
        const tangent = b.clone().sub(a).normalize();
        const corner = first ? a : b;
        const width = widths[first ? index : index + 1]!;
        const distance = a.distanceTo(b);
        let advance = width;
        for (let step = 0; step < 32; step++) {
            const center = corner.clone().addScaledVector(
                tangent, first ? advance : -advance
            );
            const pointA = center.clone()
                .addScaledVector(section.first.inward, width);
            const pointB = center.clone()
                .addScaledVector(section.second.inward, width);
            if (strictlyInside(pointA, original.vertices,
                section.first, tolerance) &&
                strictlyInside(pointB, original.vertices,
                    section.second, tolerance)) {
                return rail(section, {
                    first: pointA, second: pointB
                });
            }
            advance *= 1.5;
            if (advance >= distance / 2) break;
        }
        fail("unsupported-topology", "No valid terminal taper fits adjacent faces");
    }

    const corners: Rail[] = [];
    const incidentFaces = new Map<number, Set<string>>();
    for (const [index, face] of original.quads.entries()) {
        for (const id of face.corners) {
            const current = incidentFaces.get(id) ?? new Set();
            current.add("quad:" + index);
            incidentFaces.set(id, current);
        }
    }
    for (const [index, face] of (original.triangles ?? []).entries()) {
        for (const id of face.corners) {
            const current = incidentFaces.get(id) ?? new Set();
            current.add("triangle:" + index);
            incidentFaces.set(id, current);
        }
    }

    for (let index = 1; index < chain.length - 1; index++) {
        const corner = chain[index]!;
        const incoming = sections[index - 1]!;
        const outgoing = sections[index]!;
        const a = [incoming.first, incoming.second];
        const b = [outgoing.first, outgoing.second];
        const common = a.filter(side =>
            b.some(candidate => key(candidate.ref) === key(side.ref))
        );
        if (common.length !== 1) {
            fail("unsupported-topology", "Corner must share exactly one selected face");
        }
        const sharedA = common[0]!;
        const sharedB = b.find(side =>
            key(side.ref) === key(sharedA.ref))!;
        const otherA = a.find(side =>
            key(side.ref) !== key(sharedA.ref))!;
        const otherB = b.find(side =>
            key(side.ref) !== key(sharedA.ref))!;
        if (new Set([key(sharedA.ref), key(otherA.ref),
            key(otherB.ref)]).size !== 3 ||
            incidentFaces.get(corner)?.size !== 3) {
            fail("unsupported-topology", "Selected junction must be trihedral");
        }

        const point = positions[corner]!;
        const miterDenom = 1 + sharedA.inward.dot(sharedB.inward);
        if (!(miterDenom > Math.sin(policy.angle))) {
            fail("unsupported-topology", "Shared-face miter is singular");
        }
        const width = widths[index]!;
        const sharedPoint = point.clone().addScaledVector(
            sharedA.inward.clone().add(sharedB.inward),
            width / miterDenom
        );
        if (!strictlyInside(sharedPoint, original.vertices,
            sharedA, tolerance)) {
            fail("unsupported-topology", "Miter lies outside the shared face");
        }

        // The two nonshared faces meet on the unselected third
        // physical edge. That one edge must carry their common offset.
        const neighbors = (side: Side): number[] => {
            const i = side.face.corners.indexOf(corner);
            if (i < 0) return [];
            return [
                side.face.corners[(i + side.face.corners.length - 1) %
                    side.face.corners.length]!,
                side.face.corners[(i + 1) % side.face.corners.length]!
            ].filter(id =>
                id !== chain[index - 1] && id !== chain[index + 1]);
        };
        const third = neighbors(otherA).filter(id =>
            neighbors(otherB).includes(id));
        if (third.length !== 1 ||
            topology.edgeUses(corner, third[0]!).length !== 2) {
            fail("unsupported-topology", "No single common third corner edge");
        }
        const ray = positions[third[0]!]!.clone().sub(point);
        const available = ray.length();
        ray.normalize();
        const da = ray.dot(otherA.inward);
        const db = ray.dot(otherB.inward);
        if (da <= Math.sin(policy.angle) ||
            db <= Math.sin(policy.angle)) {
            fail("unsupported-topology", "Corner third edge points outside its faces");
        }
        const shiftA = width / da;
        const shiftB = width / db;
        if (Math.abs(shiftA - shiftB) > tolerance * 8 ||
            shiftA >= available - tolerance) {
            fail("unsupported-topology", "Third-edge offset has no common station");
        }
        const thirdPoint = point.clone().addScaledVector(ray, shiftA);
        const sharedId = positions.push(sharedPoint) - 1;
        const thirdId = positions.push(thirdPoint) - 1;
        corners.push(new Map([
            [key(sharedA.ref), sharedId],
            [key(otherA.ref), thirdId],
            [key(otherB.ref), thirdId]
        ]));
    }

    const beginning = terminal(0, true);
    const ending = terminal(edges.length - 1, false);
    const at = (index: number, end: boolean): Rail =>
        !end
            ? index === 0 ? beginning : corners[index - 1]!
            : index === edges.length - 1 ? ending : corners[index]!;

    for (let i = 0; i < edges.length; i++) {
        const section = sections[i]!;
        const first = at(i, false);
        const last = at(i, true);
        for (const side of [section.first, section.second]) {
            const direction = positions[chain[i + 1]!]!
                .clone().sub(positions[chain[i]!]!).normalize();
            const from = positions[first.get(key(side.ref))!]!;
            const to = positions[last.get(key(side.ref))!]!;
            if (to.clone().sub(from).dot(direction) <= tolerance) {
                fail("unsupported-topology", "Bevel width reverses an edge rail");
            }
        }
    }

    const replacement = new Map<string, Map<number, number>>();
    const stations = new Map<string, Map<string, number>>();
    function replace(ref: FaceRef, vertex: number, id: number): void {
        const entries = replacement.get(key(ref)) ?? new Map<number, number>();
        if (entries.has(vertex) && entries.get(vertex) !== id) {
            fail("invalid-topology", "A face has conflicting corner replacements");
        }
        entries.set(vertex, id);
        replacement.set(key(ref), entries);
    }
    function station(ref: FaceRef, from: number, to: number, id: number): void {
        const entries = stations.get(key(ref)) ?? new Map<string, number>();
        const face = faceOf(source, ref);
        const directed = face.corners.some((v, i) =>
            v === from && face.corners[(i + 1) % face.corners.length] === to
        );
        if (!directed && !face.corners.some((v, i) =>
            v === to && face.corners[(i + 1) % face.corners.length] === from
        )) {
            fail("invalid-topology", "Terminal does not lie on its original face edge");
        }
        entries.set(directed ? from + ":" + to : to + ":" + from, id);
        stations.set(key(ref), entries);
    }

    for (let i = 1; i < chain.length - 1; i++) {
        for (const [face, id] of corners[i - 1]!) {
            const use = sections[i - 1]!;
            const next = sections[i]!;
            const ref = [use.first.ref, use.second.ref, next.first.ref,
                next.second.ref].find(ref => key(ref) === face);
            if (ref) replace(ref, chain[i]!, id);
        }
    }
    for (const side of [sections[0]!.first, sections[0]!.second]) {
        station(side.ref, chain[0]!, chain[1]!,
            beginning.get(key(side.ref))!);
    }
    for (const side of [sections.at(-1)!.first, sections.at(-1)!.second]) {
        station(side.ref, chain.at(-2)!, chain.at(-1)!,
            ending.get(key(side.ref))!);
    }

    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    const faceMapping = new Map<string, FaceRef[]>();
    const active = new Set([...sections.flatMap(section =>
        [key(section.first.ref), key(section.second.ref)]
    )]);
    const emit = (face: Face, ref: FaceRef): void => {
        if (!active.has(key(ref))) {
            const copy = {
                surface: face.surface,
                ...(face.smoothingGroup === undefined ? {} :
                    {smoothingGroup: face.smoothingGroup})
            };
            if (face.corners.length === 4) {
                faceMapping.set(key(ref), [{
                    kind: "quad", index: quads.push({
                        ...copy,
                        corners: [...face.corners] as QuadFace["corners"],
                        uvs: face.uvs.map(uv => uv.clone()) as QuadFace["uvs"]
                    }) - 1
                }]);
            } else {
                faceMapping.set(key(ref), [{
                    kind: "triangle", index: triangles.push({
                        ...copy,
                        corners: [...face.corners] as TriangleFace["corners"],
                        uvs: face.uvs.map(uv => uv.clone()) as TriangleFace["uvs"]
                    }) - 1
                }]);
            }
            return;
        }

        const normal = normalOf(original.vertices, face, tolerance);
        const originalPoints = face.corners.map(id => original.vertices[id]!);
        const affine = new THREE.Triangle(
            originalPoints[0]!, originalPoints[1]!, originalPoints[2]!
        );
        const uvAt = (point: THREE.Vector3): THREE.Vector2 => {
            const barycentric = affine.getBarycoord(point, new THREE.Vector3());
            if (!barycentric) fail("degenerate-geometry", "UV basis collapsed");
            return face.uvs[0]!.clone().multiplyScalar(barycentric.x)
                .addScaledVector(face.uvs[1]!, barycentric.y)
                .addScaledVector(face.uvs[2]!, barycentric.z);
        };
        if (face.corners.some((id, index) =>
            uvAt(original.vertices[id]!).distanceTo(face.uvs[index]!) >
                tolerance * 16
        )) {
            fail("unsupported-topology", "Selected face has nonlinear UVs");
        }

        const mapping = replacement.get(key(ref)) ?? new Map();
        const additional = stations.get(key(ref)) ?? new Map();
        const loop: number[] = [];
        for (let i = 0; i < face.corners.length; i++) {
            const from = face.corners[i]!;
            const to = face.corners[(i + 1) % face.corners.length]!;
            loop.push(mapping.get(from) ?? from);
            const extra = additional.get(from + ":" + to);
            if (extra !== undefined) loop.push(extra);
        }
        if (new Set(loop).size !== loop.length) {
            fail("invalid-topology", "Reconstructed face repeats a vertex");
        }
        const origin = originalPoints[0]!;
        const x = originalPoints[1]!.clone().sub(origin).normalize();
        const y = normal.clone().cross(x);
        const chart = loop.map(id => {
            const delta = positions[id]!.clone().sub(origin);
            if (Math.abs(delta.dot(normal)) > tolerance) {
                fail("invalid-topology", "Rebuilt face leaves its source plane");
            }
            return new THREE.Vector2(delta.dot(x), delta.dot(y));
        });
        const results: FaceRef[] = [];
        for (const triangle of triangulateProfile([chart], policy)) {
            const corners = [...triangle];
            const ids = corners.map(index => loop[index]!);
            const orientation = positions[ids[1]!]!
                .clone().sub(positions[ids[0]!]!)
                .cross(positions[ids[2]!]!.clone()
                    .sub(positions[ids[0]!]!));
            if (orientation.dot(normal) < 0) {
                ids.reverse();
                corners.reverse();
            }
            results.push({
                kind: "triangle",
                index: triangles.push({
                    corners: ids as TriangleFace["corners"],
                    uvs: corners.map(index => uvAt(positions[loop[index]!]!)) as
                        TriangleFace["uvs"],
                    surface: face.surface,
                    ...(face.smoothingGroup === undefined ? {} :
                        {smoothingGroup: face.smoothingGroup})
                }) - 1
            });
        }
        faceMapping.set(key(ref), results);
    };

    original.quads.forEach((face, index) =>
        emit(face, {kind: "quad", index}));
    (original.triangles ?? []).forEach((face, index) =>
        emit(face, {kind: "triangle", index}));

    const directed = (ids: number[], normal: THREE.Vector3): number[] => {
        const a = positions[ids[0]!]!;
        const b = positions[ids[1]!]!;
        const c = positions[ids[2]!]!;
        return b.clone().sub(a).cross(c.clone().sub(a)).dot(normal) > 0
            ? ids : ids.reverse();
    };
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = 0; i < edges.length; i++) {
        const section = sections[i]!;
        const first = at(i, false);
        const last = at(i, true);
        const a = key(section.first.ref);
        const b = key(section.second.ref);
        const firstA = first.get(a)!;
        const firstB = first.get(b)!;
        const lastA = last.get(a)!;
        const lastB = last.get(b)!;
        const desired = section.first.normal.clone()
            .add(section.second.normal);
        const corners = directed([firstA, firstB, lastB, lastA], desired);
        const coords = new Map([
            [firstA, new THREE.Vector2(lengths[i]!, 0)],
            [firstB, new THREE.Vector2(lengths[i]!,
                positions[firstA]!.distanceTo(positions[firstB]!))],
            [lastB, new THREE.Vector2(lengths[i + 1]!,
                positions[lastA]!.distanceTo(positions[lastB]!))],
            [lastA, new THREE.Vector2(lengths[i + 1]!, 0)]
        ]);
        quads.push({
            corners: corners as QuadFace["corners"],
            uvs: corners.map(id => coords.get(id)!.clone()) as QuadFace["uvs"],
            surface: "bevel"
        });
        if (!upper.length) {
            upper.push(firstA);
            lower.push(firstB);
        }
        if (upper.at(-1) === firstA &&
            lower.at(-1) === firstB) {
            upper.push(lastA);
            lower.push(lastB);
        } else if (upper.at(-1) === firstB &&
            lower.at(-1) === firstA) {
            // The rail's face label changes across an articulated
            // corner. Preserve the physical connected vertex chain.
            upper.push(lastB);
            lower.push(lastA);
        } else {
            fail("invalid-topology", "Bevel rail correspondence broke at a corner");
        }
    }

    for (const [vertex, station, index] of [
        [chain[0]!, beginning, 0],
        [chain.at(-1)!, ending, edges.length - 1]
    ] as const) {
        const section = sections[index]!;
        const a = station.get(key(section.first.ref))!;
        const b = station.get(key(section.second.ref))!;
        const corners = directed([
            vertex, a, b
        ], section.first.normal.clone().add(section.second.normal));
        triangles.push({
            corners: corners as TriangleFace["corners"],
            uvs: corners.map((_, j) => new THREE.Vector2(
                lengths[index]!, j * widths[index]!
            )) as TriangleFace["uvs"],
            surface: "bevel"
        });
    }

    const result = geometryResult({vertices: positions, quads, triangles}, policy);
    const outputTopology = topologyOf(result);
    if (outputTopology.openBoundaries().length !== oldBoundaries ||
        outputTopology.connectedComponents().length !== oldComponents) {
        fail("invalid-topology", "Articulated bevel broke source connectivity");
    }
    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(source.boundaries)) {
        const preserved = refs.flatMap(ref =>
            transferBoundary(source, result, ref, id => id));
        if (preserved.length) boundaries[name] = preserved;
    }
    // The two rails may change face labels at each articulated corner.
    // Keep each panel's exact edge selection when one continuous rail
    // cannot be identified without crossing a panel.
    (boundaries["bevel-rails"] ??= []).push(
        ...sections.flatMap((section, index) => {
            const start = at(index, false);
            const end = at(index, true);
            return [section.first, section.second].map(side => ({
                owner: result.id,
                vertices: [start.get(key(side.ref))!,
                    end.get(key(side.ref))!],
                closed: false
            }));
        })
    );
    (boundaries["bevel-upper"] ??= []).push({
        owner: result.id, vertices: upper, closed: false
    });
    (boundaries["bevel-lower"] ??= []).push({
        owner: result.id, vertices: lower, closed: false
    });

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, selections] of Object.entries(source.patches ?? {})) {
        for (const selection of selections) {
            assertSelectionOwner(source, selection);
            const faces = selection.faces.flatMap(ref =>
                faceMapping.get(key(ref)) ?? []);
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
        ...result,
        boundaries,
        ...(Object.keys(patches).length ? {patches} : {})
    };
}
