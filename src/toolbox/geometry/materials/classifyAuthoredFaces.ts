import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";
import {
    assertSelectionOwner,
    geometryResult,
    GeometryOperationError,
    type BoundaryRef,
    type FaceRef,
    type GeometryResult,
    type SurfacePatchRef
} from "../kernel/GeometryResult";
import { patchChartMatches, transferBoundary } from "../kernel/selectionLifecycle";

export interface AuthoredFaceInfo {
    face: FaceRef;
    surface: string;
    smoothingGroup?: string;
    centroid: THREE.Vector3;
    normal: THREE.Vector3;
}

export interface FaceMetadata {
    surface: string;
    smoothingGroup?: string;
}

function faceInfo(
    face: QuadFace | TriangleFace,
    ref: FaceRef,
    vertices: readonly THREE.Vector3[]
): AuthoredFaceInfo {
    const points = face.corners.map(id => vertices[id]!);
    const a = points[0]!;
    const b = points[1]!;
    const c = points[2]!;
    const first = new THREE.Vector3().subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a));
    const firstArea = first.length();
    const centroid = a.clone().add(b).add(c).multiplyScalar(firstArea / 3);
    const normal = first.clone();
    let area = firstArea;

    if (points.length === 4) {
        const d = points[3]!;
        const second = new THREE.Vector3().subVectors(c, a)
            .cross(new THREE.Vector3().subVectors(d, a));
        const secondArea = second.length();
        centroid.add(a.clone().add(c).add(d).multiplyScalar(secondArea / 3));
        normal.add(second);
        area += secondArea;
    }

    centroid.divideScalar(area);
    normal.normalize();

    return {
        face: ref,
        surface: face.surface,
        ...(face.smoothingGroup === undefined
            ? {} : { smoothingGroup: face.smoothingGroup }),
        centroid,
        normal
    };
}

/** Reclassify authored faces without relying on GPU triangle order or groups. */
export function classifyAuthoredFaces(
    source: MeshData | GeometryResult,
    classify: (face: AuthoredFaceInfo) => FaceMetadata
): GeometryResult {
    if (typeof classify !== "function") {
        throw new GeometryOperationError(
            "classifyAuthoredFaces", "invalid-input",
            "Face classifier must be a function"
        );
    }

    const owned = "geometry" in source;
    const input = geometryResult(owned ? source.geometry : source);
    const classifyFace = <T extends QuadFace | TriangleFace>(
        face: T,
        ref: FaceRef
    ): T => {
        const metadata = classify(faceInfo(face, ref, input.geometry.vertices));
        if (!metadata ||
            typeof metadata.surface !== "string" ||
            !metadata.surface.trim() ||
            (metadata.smoothingGroup !== undefined &&
                typeof metadata.smoothingGroup !== "string")) {
            throw new GeometryOperationError(
                "classifyAuthoredFaces", "invalid-input",
                "Classifier must return a surface name and optional smoothing group",
                { face: ref }
            );
        }

        return {
            ...face,
            surface: metadata.surface,
            ...(metadata.smoothingGroup === undefined
                ? { smoothingGroup: undefined }
                : { smoothingGroup: metadata.smoothingGroup })
        };
    };

    const result = geometryResult({
        vertices: input.geometry.vertices,
        quads: input.geometry.quads.map((face, index) =>
            classifyFace(face, { kind: "quad", index })
        ),
        triangles: (input.geometry.triangles ?? []).map((face, index) =>
            classifyFace(face, { kind: "triangle", index })
        )
    });

    if (!owned) return result;

    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(source.boundaries)) {
        const surviving = refs.flatMap(ref =>
            transferBoundary(source, result, ref, id => id)
        );
        if (surviving.length) boundaries[name] = surviving;
    }

    const patches: Record<string, SurfacePatchRef[]> = Object.create(null);
    for (const [name, refs] of Object.entries(source.patches ?? {})) {
        for (const ref of refs) {
            assertSelectionOwner(source, ref);
            const candidate: SurfacePatchRef = {
                owner: result.id,
                faces: ref.faces.map(face => ({ ...face })),
                chart: ref.chart
            };

            if (patchChartMatches(result, candidate)) {
                (patches[name] ??= []).push(candidate);
            }
        }
    }

    return {
        ...result,
        boundaries,
        ...(Object.keys(patches).length ? { patches } : {})
    };
}
