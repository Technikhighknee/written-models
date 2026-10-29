import * as THREE from "three";
import Module from "manifold-3d";

import type { MeshData, TriangleFace } from "../mesh/MeshData";
import {
    geometryResult,
    GeometryOperationError,
    type GeometryResult
} from "../kernel/GeometryResult";
import { topologyOf } from "../kernel/topology";
import { triangulateAuthoredFaces } from "../kernel/triangulation";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

export type SolidBooleanOperation = "union" | "intersection" | "difference";

type Kernel = Awaited<ReturnType<typeof Module>>;
let kernelPromise: Promise<Kernel> | undefined;

function kernel(): Promise<Kernel> {
    kernelPromise ??= Module().then(wasm => {
        wasm.setup();
        return wasm;
    }).catch(error => {
        kernelPromise = undefined;
        throw error;
    });
    return kernelPromise;
}

function fail(
    reason: "invalid-input" | "invalid-topology" |
        "degenerate-geometry" | "precision-loss" | "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("solidBoolean", reason, message);
}

function assertFloat32Triangle(
    a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3
): void {
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const quantized = [a, b, c].map(point => new THREE.Vector3(
        Math.fround(point.x), Math.fround(point.y), Math.fround(point.z)
    ));
    const rounded = quantized[1]!.clone().sub(quantized[0]!)
        .cross(quantized[2]!.clone().sub(quantized[0]!));
    if (quantized.some(v => ![v.x, v.y, v.z].every(Number.isFinite)) ||
        !(rounded.lengthSq() > 0) || !(normal.dot(rounded) > 0)) {
        fail("precision-loss", "Input triangle collapses or reverses in Float32");
    }
}

function validateSolid(source: GeometryResult): void {
    if (!source?.geometry || !source.id ||
        typeof source.id !== "symbol") {
        fail("invalid-input", "Expected an owned GeometryResult");
    }
    const topology = topologyOf(source);
    if (topology.openBoundaries().length ||
        !topology.connectedComponents().length) {
        fail("invalid-topology", "Boolean operands must be nonempty closed oriented solids");
    }
}

/**
 * Preserve each authored face's UV and smoothing assignment as a separate
 * Manifold triangle run. Property vertices are face-corner vertices; merge
 * vectors explicitly describe their shared physical construction vertex.
 * This preserves UV seams without accidentally welding touching solids.
 */
function inputMesh(
    source: GeometryResult,
    wasm: Kernel,
    ids: Map<number, {region: string; smoothingGroup?: string}>,
    prefix: string
): InstanceType<Kernel["Mesh"]> {
    const groups = new Map<string, {
        region: string; smoothingGroup?: string;
        triangles: ReturnType<typeof triangulateAuthoredFaces>;
    }>();
    const all = triangulateAuthoredFaces(source.geometry);
    for (const triangle of all) {
        const face = triangle.face.kind === "quad"
            ? source.geometry.quads[triangle.face.index]!
            : source.geometry.triangles![triangle.face.index]!;
        const tag = JSON.stringify([face.surface, face.smoothingGroup ?? null]);
        const group = groups.get(tag) ?? {
            region: face.surface,
            ...(face.smoothingGroup === undefined ? {} :
                {smoothingGroup: face.smoothingGroup}),
            triangles: []
        };
        group.triangles.push(triangle);
        groups.set(tag, group);
    }

    const startID = wasm.Manifold.reserveIDs(groups.size);
    const positions: number[] = [];
    const indices: number[] = [];
    const mergeFrom: number[] = [];
    const mergeTo: number[] = [];
    const runIndex = [0];
    const runOriginalID: number[] = [];
    const firstCorner = new Map<number, number>();

    let run = 0;
    for (const group of groups.values()) {
        const originalID = startID + run++;
        ids.set(originalID, {
            region: prefix + group.region,
            ...(group.smoothingGroup === undefined ? {} :
                {smoothingGroup: group.smoothingGroup})
        });
        runOriginalID.push(originalID);

        for (const triangle of group.triangles) {
            const face = triangle.face.kind === "quad"
                ? source.geometry.quads[triangle.face.index]!
                : source.geometry.triangles![triangle.face.index]!;
            const points = triangle.vertices.map(id =>
                source.geometry.vertices[id]!
            );
            assertFloat32Triangle(points[0]!, points[1]!, points[2]!);

            for (let k = 0; k < 3; k++) {
                const sourceId = triangle.vertices[k]!;
                const point = source.geometry.vertices[sourceId]!;
                const uv = face.uvs[triangle.faceCorners[k]!]!;
                const index = positions.length / 5;
                positions.push(point.x, point.y, point.z, uv.x, uv.y);
                indices.push(index);

                const existing = firstCorner.get(sourceId);
                if (existing === undefined) firstCorner.set(sourceId, index);
                else {
                    mergeFrom.push(index);
                    mergeTo.push(existing);
                }
            }
        }
        runIndex.push(indices.length);
    }

    return new wasm.Mesh({
        numProp: 5,
        vertProperties: new Float32Array(positions),
        triVerts: new Uint32Array(indices),
        runIndex: new Uint32Array(runIndex),
        runOriginalID: new Uint32Array(runOriginalID),
        mergeFromVert: new Uint32Array(mergeFrom),
        mergeToVert: new Uint32Array(mergeTo)
    });
}

function resultMesh(
    mesh: InstanceType<Kernel["Mesh"]>,
    sourceRegions: Map<number, {region: string; smoothingGroup?: string}>,
    precision: GeometryPrecision
): GeometryResult {
    const parents = Array.from({length: mesh.numVert}, (_, i) => i);
    function find(index: number): number {
        let root = index;
        while (parents[root] !== root) root = parents[root]!;
        while (parents[index] !== index) {
            const next = parents[index]!;
            parents[index] = root;
            index = next;
        }
        return root;
    }
    for (let i = 0; i < mesh.mergeFromVert.length; i++) {
        const from = mesh.mergeFromVert[i]!;
        const to = mesh.mergeToVert[i]!;
        if (from >= parents.length || to >= parents.length) {
            fail("invalid-topology", "Boolean kernel returned an invalid merge index");
        }
        parents[find(from)] = find(to);
    }

    const vertices: THREE.Vector3[] = [];
    const remapped = new Map<number, number>();
    const triangles: TriangleFace[] = [];
    const prop = mesh.vertProperties;
    const stride = mesh.numProp;
    if (stride < 5 || prop.length !== stride * mesh.numVert ||
        mesh.triVerts.length % 3 !== 0) {
        fail("invalid-topology", "Boolean kernel returned incomplete vertex properties");
    }

    const vertex = (propertyId: number): number => {
        if (propertyId >= mesh.numVert) {
            fail("invalid-topology", "Boolean kernel returned an invalid triangle index");
        }
        const root = find(propertyId);
        let target = remapped.get(root);
        if (target === undefined) {
            target = vertices.length;
            remapped.set(root, target);
            vertices.push(new THREE.Vector3(
                prop[propertyId * stride]!,
                prop[propertyId * stride + 1]!,
                prop[propertyId * stride + 2]!
            ));
        }
        return target;
    };

    if (mesh.runIndex.length !== mesh.runOriginalID.length + 1) {
        fail("invalid-topology", "Boolean kernel returned ambiguous surface runs");
    }
    for (let run = 0; run < mesh.runOriginalID.length; run++) {
        const original = sourceRegions.get(mesh.runOriginalID[run]!);
        if (!original) {
            fail("invalid-topology", "Boolean kernel returned a surface with unknown provenance");
        }
        const start = mesh.runIndex[run]!;
        const end = mesh.runIndex[run + 1]!;
        if (start > end || start % 3 || end % 3 ||
            end > mesh.triVerts.length) {
            fail("invalid-topology", "Boolean kernel returned an invalid triangle run");
        }

        for (let at = start; at < end; at += 3) {
            const ids = Array.from({length: 3}, (_, k) => mesh.triVerts[at + k]!);
            const corners = ids.map(vertex) as TriangleFace["corners"];
            const uvs = ids.map(id => new THREE.Vector2(
                prop[id * stride + 3]!, prop[id * stride + 4]!
            )) as TriangleFace["uvs"];
            triangles.push({
                corners, uvs,
                surface: original.region,
                ...(original.smoothingGroup === undefined ? {} :
                    {smoothingGroup: original.smoothingGroup})
            });
        }
    }
    const result = geometryResult({
        vertices, quads: [], triangles
    }, precision);
    if (triangles.length && topologyOf(result).openBoundaries().length) {
        fail("invalid-topology", "Boolean output has unpaired physical edges");
    }
    return result;
}

/**
 * Boolean two closed authored solids. Every output triangle is a real
 * control face; source surface regions and UVs survive through Manifold
 * property runs. Boolean output is newly triangulated, so previous face
 * and boundary selections intentionally do not survive as stale indices.
 *
 * Output region names are prefixed with "first:" and "second:"; cutter
 * faces in a difference use "cut:" to distinguish the interior surface.
 * Empty intersections return a valid empty GeometryResult.
 */
export async function solidBoolean(
    first: GeometryResult,
    second: GeometryResult,
    operation: SolidBooleanOperation,
    precision?: GeometryPrecision
): Promise<GeometryResult> {
    const policy = resolvePrecision(precision);
    if (!["union", "intersection", "difference"].includes(operation)) {
        fail("invalid-input", "Unknown boolean operation");
    }
    validateSolid(first);
    validateSolid(second);

    let left: InstanceType<Kernel["Manifold"]> | undefined;
    let right: InstanceType<Kernel["Manifold"]> | undefined;
    let output: InstanceType<Kernel["Manifold"]> | undefined;
    try {
        const wasm = await kernel();
        const regions = new Map<number, {
            region: string; smoothingGroup?: string
        }>();
        left = new wasm.Manifold(inputMesh(
            first, wasm, regions, "first:"
        ));
        right = new wasm.Manifold(inputMesh(
            second, wasm, regions,
            operation === "difference" ? "cut:" : "second:"
        ));
        output = operation === "union"
            ? left.add(right)
            : operation === "intersection"
                ? left.intersect(right)
                : left.subtract(right);

        if (output.isEmpty()) {
            // Empty intersection / difference is a valid result.
            return geometryResult({
                vertices: [], quads: [], triangles: []
            }, policy);
        }
        return resultMesh(output.getMesh(), regions, policy);
    } catch (error) {
        if (error instanceof GeometryOperationError) throw error;
        fail("invalid-topology",
            "Boolean kernel could not process these solids: " +
                (error instanceof Error ? error.message : String(error)));
    } finally {
        output?.delete();
        left?.delete();
        right?.delete();
    }
}
