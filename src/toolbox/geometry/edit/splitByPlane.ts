import * as THREE from "three";

import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";
import type { SampledBoundary } from "../definitions/geometry";
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
import { triangulateProfile } from "../build/triangulateProfile";
import { capSectionEnd } from "../build/finishBoundaries";

export interface Plane3 {
    point: THREE.Vector3Like;
    normal: THREE.Vector3Like;
}

export interface SplitOptions {
    cap: boolean;
    cutRegion: string;
    precision?: GeometryPrecision;
}

export interface PartitionInterface {
    firstPart: number;
    first: BoundaryRef;
    secondPart: number;
    second: BoundaryRef;
    source: SampledBoundary;
}

export interface PartitionResult {
    parts: readonly GeometryResult[];
    sideOfPart: readonly ("negative" | "positive")[];
    interfaces: readonly PartitionInterface[];
}

type Side = "negative" | "positive";
type Face = QuadFace | TriangleFace;
type PieceFace = {
    ids: number[];
    uvs: THREE.Vector2[];
    surface: string;
    smoothingGroup?: string;
};

interface Piece {
    side: Side;
    geometry: GeometryResult;
    sourceIds: number[];
    cuts: { ids: number[]; signature: string }[];
}

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "unsupported-topology" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("splitByPlane", reason, message);
}

function key(a: number, b: number): string {
    return Math.min(a, b) + ":" + Math.max(a, b);
}

function loopSignature(ids: readonly number[]): string {
    return ids.map((from, index) =>
        key(from, ids[(index + 1) % ids.length]!)
    ).sort().join("|");
}

function faceOf(mesh: MeshData, ref: {kind: "quad" | "triangle"; index: number}): Face {
    return ref.kind === "quad"
        ? mesh.quads[ref.index]!
        : mesh.triangles![ref.index]!;
}

function asResult(
    faces: readonly PieceFace[],
    positions: readonly THREE.Vector3[],
    side: Side,
    indices: readonly number[]
): Piece[] {
    if (faces.length === 0) return [];
    const quads: QuadFace[] = [];
    const triangles: TriangleFace[] = [];
    for (const face of faces) {
        const common = {
            surface: face.surface,
            ...(face.smoothingGroup === undefined ? {} :
                {smoothingGroup: face.smoothingGroup})
        };
        if (face.ids.length === 4) {
            quads.push({
                ...common,
                corners: face.ids as QuadFace["corners"],
                uvs: face.uvs as QuadFace["uvs"]
            });
        } else if (face.ids.length === 3) {
            triangles.push({
                ...common,
                corners: face.ids as TriangleFace["corners"],
                uvs: face.uvs as TriangleFace["uvs"]
            });
        } else {
            fail("invalid-topology", "Unexpected clipped face corner count");
        }
    }
    const entire = geometryResult({
        vertices: positions.map(v => v.clone()),
        quads,
        triangles
    });
    const connected = topologyOf(entire).connectedComponents();
    const parts: Piece[] = [];

    for (const component of connected) {
        const remap = new Map<number, number>();
        const sourceIds: number[] = [];
        const vertices: THREE.Vector3[] = [];
        const localQuads: QuadFace[] = [];
        const localTriangles: TriangleFace[] = [];
        const mapVertex = (id: number): number => {
            let mapped = remap.get(id);
            if (mapped === undefined) {
                mapped = vertices.length;
                remap.set(id, mapped);
                sourceIds.push(indices[id]!);
                vertices.push(positions[id]!.clone());
            }
            return mapped;
        };
        for (const ref of component) {
            const face = faceOf(entire.geometry, ref);
            const translated = {
                surface: face.surface,
                ...(face.smoothingGroup === undefined ? {} :
                    {smoothingGroup: face.smoothingGroup})
            };
            if (ref.kind === "quad") {
                localQuads.push({
                    ...translated,
                    corners: face.corners.map(mapVertex) as QuadFace["corners"],
                    uvs: face.uvs.map(uv => uv.clone()) as QuadFace["uvs"]
                });
            } else {
                localTriangles.push({
                    ...translated,
                    corners: face.corners.map(mapVertex) as TriangleFace["corners"],
                    uvs: face.uvs.map(uv => uv.clone()) as TriangleFace["uvs"]
                });
            }
        }
        parts.push({
            side,
            geometry: geometryResult({
                vertices, quads: localQuads, triangles: localTriangles
            }),
            sourceIds,
            cuts: []
        });
    }
    return parts;
}

/**
 * Split authored faces using one intersection position per undirected edge.
 * Each connected half-space component owns a new geometry snapshot.
 * Cutting surfaces retain their source UVs; planar caps use metres.
 */
export function splitByPlane(
    source: MeshData | GeometryResult,
    plane: Plane3,
    options: SplitOptions
): PartitionResult {
    const policy = resolvePrecision(options?.precision);
    if (
        !plane?.point || !plane?.normal ||
        ![plane.point.x, plane.point.y, plane.point.z,
            plane.normal.x, plane.normal.y, plane.normal.z].every(Number.isFinite) ||
        typeof options?.cap !== "boolean" ||
        !options.cutRegion?.trim()
    ) {
        fail("invalid-input", "Expected a finite plane and split options");
    }
    const normal = new THREE.Vector3().copy(plane.normal);
    if (normal.length() <= policy.absoluteLength) {
        fail("invalid-input", "Plane normal has zero length");
    }
    normal.normalize();
    const origin = new THREE.Vector3().copy(plane.point);
    const input = "geometry" in source ? source : geometryResult(source, policy);
    const mesh = input.geometry;
    const index = topologyOf(input);
    const open = index.openBoundaries();
    if (options.cap && open.length) {
        fail("unsupported-topology", "Capped plane splitting requires a closed manifold source");
    }

    const box = new THREE.Box3().setFromPoints(mesh.vertices);
    const tolerance = lengthTolerance(
        policy, box.getSize(new THREE.Vector3()).length()
    );
    const positions = mesh.vertices.map(point => {
        const distance = point.clone().sub(origin).dot(normal);
        return Math.abs(distance) <= tolerance
            ? point.clone().addScaledVector(normal, -distance)
            : point.clone();
    });
    const signed = positions.map(point => point.clone().sub(origin).dot(normal));
    const sharedIds = positions.map((_, id) => id);
    const intersections = new Map<string, number>();

    function intersection(a: number, b: number): number {
        if (Math.abs(signed[a]!) <= tolerance) return a;
        if (Math.abs(signed[b]!) <= tolerance) return b;
        const edge = key(a, b);
        const cached = intersections.get(edge);
        if (cached !== undefined) return cached;
        const t = signed[a]! / (signed[a]! - signed[b]!);
        const point = positions[a]!.clone().lerp(positions[b]!, t);
        point.addScaledVector(
            normal, -point.clone().sub(origin).dot(normal)
        );
        const id = positions.push(point) - 1;
        signed.push(0);
        sharedIds.push(id);
        intersections.set(edge, id);
        return id;
    }

    function clip(
        face: Face,
        side: Side
    ): {ids: number[]; uvs: THREE.Vector2[]} {
        const ids: number[] = [];
        const uvs: THREE.Vector2[] = [];
        const sign = side === "positive" ? 1 : -1;
        const corners = face.corners;
        let last = corners.length - 1;

        for (let i = 0; i < corners.length; i++) {
            const a = corners[last]!;
            const b = corners[i]!;
            const da = sign * signed[a]!;
            const db = sign * signed[b]!;
            const insideA = da >= -tolerance;
            const insideB = db >= -tolerance;
            if (insideA !== insideB) {
                const id = intersection(a, b);
                const t = id === a ? 0 : id === b ? 1 :
                    signed[a]! / (signed[a]! - signed[b]!);
                ids.push(id);
                uvs.push(face.uvs[last]!.clone()
                    .lerp(face.uvs[i]!, t));
            }
            if (insideB) {
                ids.push(b);
                uvs.push(face.uvs[i]!.clone());
            }
            last = i;
        }

        const cleanIds: number[] = [];
        const cleanUvs: THREE.Vector2[] = [];
        for (let i = 0; i < ids.length; i++) {
            if (ids[i] === cleanIds.at(-1)) continue;
            cleanIds.push(ids[i]!);
            cleanUvs.push(uvs[i]!);
        }
        if (cleanIds.length > 1 && cleanIds[0] === cleanIds.at(-1)) {
            cleanIds.pop();
            cleanUvs.pop();
        }
        return {ids: cleanIds, uvs: cleanUvs};
    }

    function polygons(face: Face, part: {ids: number[]; uvs: THREE.Vector2[]}): PieceFace[] {
        if (part.ids.length < 3) return [];
        const shared = {
            surface: face.surface,
            ...(face.smoothingGroup === undefined ? {} :
                {smoothingGroup: face.smoothingGroup})
        };
        if (part.ids.length <= 4) {
            return [{...shared, ...part}];
        }

        const vertices = part.ids.map(id => positions[id]!);
        const x = vertices[1]!.clone().sub(vertices[0]!).normalize();
        const direction = new THREE.Vector3().subVectors(vertices[2]!, vertices[0]!)
            .cross(vertices[1]!.clone().sub(vertices[0]!)).normalize();
        const y = new THREE.Vector3().crossVectors(direction, x).normalize();
        const projected = vertices.map(point => {
            const delta = point.clone().sub(vertices[0]!);
            return new THREE.Vector2(delta.dot(x), delta.dot(y));
        });
        const triangles = triangulateProfile([projected], policy);
        const normalOfFace = vertices[1]!.clone().sub(vertices[0]!)
            .cross(vertices[2]!.clone().sub(vertices[0]!));
        return triangles.map(ids => {
            const ordered = [...ids];
            const a = vertices[ordered[0]!]!;
            const b = vertices[ordered[1]!]!;
            const c = vertices[ordered[2]!]!;
            if (b.clone().sub(a).cross(c.clone().sub(a)).dot(normalOfFace) < 0) {
                ordered.reverse();
            }
            return {
                ...shared,
                ids: ordered.map(i => part.ids[i]!),
                uvs: ordered.map(i => part.uvs[i]!.clone())
            };
        });
    }

    const faces: Record<Side, PieceFace[]> = {
        negative: [], positive: []
    };
    for (const face of [...mesh.quads, ...(mesh.triangles ?? [])]) {
        const distances = face.corners.map(id => signed[id]!);
        if (distances.every(value => Math.abs(value) <= tolerance)) {
            const [a, b, c] = face.corners.map(id => positions[id]!);
            const winding = b!.clone().sub(a!)
                .cross(c!.clone().sub(a!)).dot(normal);
            if (Math.abs(winding) <= tolerance * tolerance) {
                fail("degenerate-geometry", "Coplanar source face is degenerate");
            }
            const side = winding > 0 ? "negative" : "positive";
            faces[side].push({
                ids: [...face.corners],
                uvs: face.uvs.map(uv => uv.clone()),
                surface: face.surface,
                ...(face.smoothingGroup === undefined ? {} :
                    {smoothingGroup: face.smoothingGroup})
            });
            continue;
        }

        for (const side of ["negative", "positive"] as const) {
            faces[side].push(...polygons(face, clip(face, side)));
        }
    }

    const parts = [
        ...asResult(faces.negative, positions, "negative", sharedIds),
        ...asResult(faces.positive, positions, "positive", sharedIds)
    ];

    const frameFor = (side: Side): THREE.Matrix4 => {
        const z = normal.clone().multiplyScalar(side === "negative" ? 1 : -1);
        const axis = Math.abs(z.x) < 0.8
            ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const x = axis.addScaledVector(z, -axis.dot(z)).normalize();
        const y = new THREE.Vector3().crossVectors(z, x).normalize();
        return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
    };

    function inside(
        point: THREE.Vector2, polygon: readonly THREE.Vector2[]
    ): boolean {
        let result = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const a = polygon[j]!;
            const b = polygon[i]!;
            if ((a.y > point.y) !== (b.y > point.y) &&
                point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
                result = !result;
            }
        }
        return result;
    }

    for (const part of parts) {
        const rims = topologyOf(part.geometry).openBoundaries();
        const cutRims = rims.filter(rim =>
            rim.vertices.every(id =>
                Math.abs(part.geometry.geometry.vertices[id]!
                    .clone().sub(origin).dot(normal)) <= tolerance
            )
        );
        if (options.cap && cutRims.length !== rims.length) {
            fail("invalid-topology", "The split left a nonplanar open rim");
        }
        if (!cutRims.length) continue;

        const frame = frameFor(part.side);
        const inverse = frame.clone().invert();
        const contours = cutRims.map(rim =>
            rim.vertices.map(id => {
                const point = part.geometry.geometry.vertices[id]!
                    .clone().applyMatrix4(inverse);
                return new THREE.Vector2(point.x, point.y);
            })
        );
        const entries = cutRims.map((rim, i) => ({
            ids: [...rim.vertices],
            global: rim.vertices.map(id => part.sourceIds[id]!),
            polygon: contours[i]!,
            area: THREE.ShapeUtils.area(contours[i]!)
        }));
        const outer = entries.filter(entry => entry.area < 0);
        const holes = entries.filter(entry => entry.area > 0);

        if (options.cap && !outer.length) {
            fail("invalid-topology", "Cut loops have inconsistent winding");
        }
        const grouped = new Map<(typeof entries)[number], (typeof entries)[number][]>();
        for (const entry of outer) grouped.set(entry, []);
        for (const hole of holes) {
            const owners = outer.filter(entry =>
                inside(hole.polygon[0]!, entry.polygon)
            ).sort((a, b) => Math.abs(a.area) - Math.abs(b.area));
            if (!owners.length) {
                fail("invalid-topology", "A cut hole has no outer boundary");
            }
            grouped.get(owners[0]!)!.push(hole);
        }

        if (options.cap) {
            for (const [parent, inner] of grouped) {
                const current = part.geometry;
                const ref = (entry: (typeof entries)[number]): BoundaryRef => ({
                    owner: current.id, closed: true, vertices: entry.ids
                });
                part.geometry = capSectionEnd(
                    current, ref(parent), inner.map(ref), {
                        region: options.cutRegion,
                        uvFrame: frame,
                        tessellation: "quad-if-planar",
                        precision: policy
                    }
                );
            }
            if (topologyOf(part.geometry).openBoundaries().length) {
                fail("invalid-topology", "Capped split still has open boundaries");
            }
        }

        part.cuts = entries.map(entry => ({
            ids: entry.ids, signature: loopSignature(entry.global)
        }));
        part.geometry = {
            ...part.geometry,
            boundaries: {
                ...part.geometry.boundaries,
                cut: entries.map(entry => ({
                    owner: part.geometry.id,
                    closed: true, vertices: [...entry.ids]
                }))
            }
        };
    }

    const result: PartitionResult = {
        parts: parts.map(part => part.geometry),
        sideOfPart: parts.map(part => part.side),
        interfaces: []
    };
    const interfaceList: PartitionInterface[] = [];
    const positive = new Map<string, {part: number; cut: Piece["cuts"][number]}>();
    parts.forEach((part, partIndex) => {
        if (part.side !== "positive") return;
        for (const cut of part.cuts) {
            if (positive.has(cut.signature)) {
                fail("unsupported-topology", "Ambiguous matching cut loops");
            }
            positive.set(cut.signature, {part: partIndex, cut});
        }
    });

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (part.side !== "negative") continue;
        for (const cut of part.cuts) {
            const peer = positive.get(cut.signature);
            if (!peer) {
                fail("invalid-topology", "Cut loop has no counterpart");
            }
            const firstIds = cut.ids;
            const points = firstIds.map(id =>
                part.geometry.geometry.vertices[id]!.clone()
            );
            const length: number[] = [0];
            for (let j = 1; j <= points.length; j++) {
                length.push(length.at(-1)! +
                    points[j % points.length]!.distanceTo(points[j - 1]!)
                );
            }
            const total = length.at(-1)!;
            interfaceList.push({
                firstPart: i,
                first: {
                    owner: part.geometry.id,
                    vertices: [...firstIds],
                    closed: true
                },
                secondPart: peer.part,
                second: {
                    owner: parts[peer.part]!.geometry.id,
                    vertices: [...peer.cut.ids],
                    closed: true
                },
                source: {
                    closed: true,
                    parameters: length.slice(0, -1).map(value => value / total),
                    points
                }
            });
            positive.delete(cut.signature);
        }
    }
    if (positive.size) {
        fail("invalid-topology", "Unmatched positive cut loop");
    }

    return {...result, interfaces: interfaceList};
}
