import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    GeometryOperationError,
    geometryResult,
    type BoundaryRef,
    type FaceRef,
    type GeometryResult,
    type SurfaceChart,
    type SurfacePatchRef
} from "../kernel/GeometryResult";
import { patchChartMatches, transferBoundary } from "../kernel/selectionLifecycle";
import {
    assertAffineTransform,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";

type GeometrySource = MeshData | GeometryResult;

function isResult(source: GeometrySource): source is GeometryResult {
    return "geometry" in source;
}

function copy(
    source: GeometrySource,
    precision?: GeometryPrecision
): GeometryResult {
    return geometryResult(
        isResult(source) ? source.geometry : source,
        precision
    );
}

function validated(
    geometry: MeshData,
    operation: string,
    precision?: GeometryPrecision
): GeometryResult {
    try {
        return geometryResult(geometry, precision);
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                operation, error.reason, error.message, error.context
            );
        }
        throw error;
    }
}

function remap(
    source: GeometrySource,
    snapshot: GeometryResult,
    patches: "keep" | "drop",
    chartTransform?: (chart: SurfaceChart) => SurfaceChart,
    reverseBoundaries = false
): GeometryResult {
    if (!isResult(source)) return snapshot;

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, loops] of Object.entries(source.boundaries)) {
        const mapped = loops.flatMap(loop =>
            transferBoundary(source, snapshot, loop, id => id)
        );

        if (mapped.length) {
            boundaries[name] = reverseBoundaries
                ? mapped.map(loop => ({
                    ...loop,
                    vertices: [...loop.vertices].reverse()
                }))
                : mapped;
        }
    }

    const mappedPatches: Record<string, SurfacePatchRef[]> =
        Object.create(null);

    if (patches === "keep") {
        for (const [name, list] of Object.entries(source.patches ?? {})) {
            for (const patch of list) {
                assertSelectionOwner(source, patch);
                const candidate: SurfacePatchRef = {
                    owner: snapshot.id,
                    faces: patch.faces.map((face: FaceRef) => ({ ...face })),
                    chart: chartTransform ? chartTransform(patch.chart) : patch.chart
                };
                if (patchChartMatches(snapshot, candidate)) {
                    (mappedPatches[name] ??= []).push(candidate);
                }
            }
        }
    }

    return {
        ...snapshot,
        boundaries,
        ...(Object.keys(mappedPatches).length ? { patches: mappedPatches } : {})
    };
}

function invalid(operation: string, message: string): never {
    throw new GeometryOperationError(operation, "invalid-input", message);
}

function transformedChart(
    original: SurfaceChart,
    transform: THREE.Matrix4,
    inverse: THREE.Matrix4,
    normalMatrix: THREE.Matrix3
): SurfaceChart {
    return {
        at: uv => original.at(uv).clone().applyMatrix4(transform),
        parameterOf: point => original.parameterOf(
            new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(inverse)
        ),
        normalAt: uv => original.normalAt(uv).clone()
            .applyMatrix3(normalMatrix).normalize()
    };
}

/** Applies an invertible affine transform without changing the source geometry. */
export function transformGeometry(
    source: GeometrySource,
    localToDestination: THREE.Matrix4,
    precision?: GeometryPrecision
): GeometryResult {
    const policy = resolvePrecision(precision);
    assertAffineTransform(localToDestination, "transformGeometry", policy);
    const transform = localToDestination.clone();
    const result = copy(source, policy);
    const reflection = transform.determinant() < 0;

    for (const vertex of result.geometry.vertices) {
        vertex.applyMatrix4(transform);
    }

    if (reflection) {
        for (const face of [
            ...result.geometry.quads,
            ...(result.geometry.triangles ?? [])
        ]) {
            face.corners.reverse();
            face.uvs.reverse();
        }
    }

    const inverse = transform.clone().invert();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
    const output = validated(result.geometry, "transformGeometry", policy);
    return remap(
        source, output, "keep",
        chart => transformedChart(chart, transform, inverse, normalMatrix),
        reflection
    );
}

export type DeformationField = (
    position: THREE.Vector3Like,
    vertexId: number
) => THREE.Vector3Like;

/** Changes each authored vertex once; parameterized patches are invalidated. */
export function deformVertices(
    source: GeometrySource,
    field: DeformationField,
    precision?: GeometryPrecision
): GeometryResult {
    const result = copy(source, precision);
    for (let id = 0; id < result.geometry.vertices.length; id++) {
        const vertex = result.geometry.vertices[id]!;
        const displacement = field(vertex.clone(), id);
        if (!displacement || ![displacement.x, displacement.y,
            displacement.z].every(Number.isFinite)) {
            invalid("deformVertices", "Invalid vertex displacement");
        }
        vertex.add(new THREE.Vector3(
            displacement.x, displacement.y, displacement.z
        ));
    }

    // Validate changed geometry before returning a new owned snapshot.
    const output = validated(result.geometry, "deformVertices", precision);
    return remap(source, output, "drop");
}

/** Offsets authored per-face-corner UVs, preserving topology and patch charts. */
export function offsetMeshUvs(
    source: GeometrySource,
    u: number,
    v: number,
    precision?: GeometryPrecision
): GeometryResult {
    if (![u, v].every(Number.isFinite)) {
        invalid("offsetMeshUvs", "UV offset must be finite");
    }

    const result = copy(source, precision);
    for (const face of [
        ...result.geometry.quads,
        ...(result.geometry.triangles ?? [])
    ]) {
        for (const uv of face.uvs) {
            uv.x += u;
            uv.y += v;

            if (!Number.isFinite(uv.x) || !Number.isFinite(uv.y)) {
                invalid("offsetMeshUvs", "UV offset exceeds finite precision");
            }
        }
    }

    return remap(source, result, "keep");
}
