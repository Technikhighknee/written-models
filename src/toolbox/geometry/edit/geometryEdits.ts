import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import {
    GeometryOperationError,
    geometryResult,
    type BoundaryRef,
    type FaceRef,
    type GeometryResult,
    type SurfaceChart,
    type SurfacePatchRef
} from "../kernel/GeometryResult";

type GeometrySource = MeshData | GeometryResult;

function isResult(source: GeometrySource): source is GeometryResult {
    return "geometry" in source;
}

function copy(source: GeometrySource): GeometryResult {
    return geometryResult(isResult(source) ? source.geometry : source);
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
        boundaries[name] = loops.map(loop => ({
            owner: snapshot.id,
            vertices: reverseBoundaries
                ? [...loop.vertices].reverse() : [...loop.vertices],
            closed: loop.closed
        }));
    }

    let mappedPatches: Record<string, SurfacePatchRef[]> | undefined;
    if (patches === "keep" && source.patches) {
        mappedPatches = Object.create(null) as Record<string, SurfacePatchRef[]>;
        for (const [name, list] of Object.entries(source.patches)) {
            mappedPatches[name] = list.map(patch => ({
                owner: snapshot.id,
                faces: patch.faces.map((face: FaceRef) => ({ ...face })),
                chart: chartTransform ? chartTransform(patch.chart) : patch.chart
            }));
        }
    }

    return {
        ...snapshot,
        boundaries,
        ...(mappedPatches === undefined ? {} : { patches: mappedPatches })
    };
}

function invalid(operation: string, message: string): never {
    throw new GeometryOperationError(operation, "invalid-input", message);
}

function assertAffineTransform(matrix: THREE.Matrix4): void {
    const elements = matrix.elements;
    const determinant = matrix.determinant();
    if (!elements.every(Number.isFinite) ||
        !Number.isFinite(determinant) || Math.abs(determinant) < 1e-15 ||
        elements[3] !== 0 || elements[7] !== 0 ||
        elements[11] !== 0 || elements[15] !== 1) {
        invalid("transformGeometry", "Transform must be finite, affine and invertible");
    }
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
    localToDestination: THREE.Matrix4
): GeometryResult {
    assertAffineTransform(localToDestination);
    const result = copy(source);
    const reflection = localToDestination.determinant() < 0;

    for (const vertex of result.geometry.vertices) {
        vertex.applyMatrix4(localToDestination);
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

    const inverse = localToDestination.clone().invert();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(localToDestination);
    return remap(
        source, result, "keep",
        chart => transformedChart(chart, localToDestination, inverse, normalMatrix),
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
    field: DeformationField
): GeometryResult {
    const result = copy(source);
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
    const validated = geometryResult(result.geometry);
    return remap(source, validated, "drop");
}

/** Offsets authored per-face-corner UVs, preserving topology and patch charts. */
export function offsetMeshUvs(
    source: GeometrySource,
    u: number,
    v: number
): GeometryResult {
    if (![u, v].every(Number.isFinite)) {
        invalid("offsetMeshUvs", "UV offset must be finite");
    }

    const result = copy(source);
    for (const face of [
        ...result.geometry.quads,
        ...(result.geometry.triangles ?? [])
    ]) {
        for (const uv of face.uvs) {
            uv.x += u;
            uv.y += v;
        }
    }
    return remap(source, result, "keep");
}
