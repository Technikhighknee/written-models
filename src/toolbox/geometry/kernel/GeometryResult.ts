import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";
import { GeometryOperationError, type GeometryFailure } from "./GeometryOperationError";
import {
    resolvePrecision,
    triangleQuality,
    type GeometryPrecision
} from "./precision";

export { GeometryOperationError } from "./GeometryOperationError";
export type { GeometryFailure } from "./GeometryOperationError";

export type FaceRef =
    | { kind: "quad"; index: number }
    | { kind: "triangle"; index: number };

export interface EdgeRef {
    owner: symbol;
    from: number;
    to: number;
}

export interface BoundaryRef {
    owner: symbol;
    vertices: readonly number[];
    closed: boolean;
}

export interface SurfaceChart {
    at(uv: THREE.Vector2Like): THREE.Vector3;
    parameterOf(point: THREE.Vector3Like): THREE.Vector2;
    normalAt(uv: THREE.Vector2Like): THREE.Vector3;
}

export interface SurfacePatchRef {
    owner: symbol;
    faces: readonly FaceRef[];
    chart: SurfaceChart;
}

export interface GeometryResult {
    readonly id: symbol;
    readonly geometry: MeshData;
    readonly boundaries: Readonly<Record<string, readonly BoundaryRef[]>>;
    readonly regions: Readonly<Record<string, readonly FaceRef[]>>;
    readonly patches?: Readonly<Record<string, readonly SurfacePatchRef[]>>;
}

function invalid(
    reason: GeometryFailure,
    message: string,
    context?: GeometryOperationError["context"]
): never {
    throw new GeometryOperationError("geometryResult", reason, message, context);
}

/** Creates an owned snapshot. Mutable input vectors and face arrays are never retained. */
export function geometryResult(
    source: MeshData,
    precision?: GeometryPrecision
): GeometryResult {
    const policy = resolvePrecision(precision);
    if (!Array.isArray(source.vertices) ||
        !Array.isArray(source.quads) ||
        (source.triangles !== undefined && !Array.isArray(source.triangles))) {
        invalid("invalid-input", "Expected authored mesh arrays");
    }

    const vertices = source.vertices.map((point, vertex) => {
        if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
            invalid("invalid-input", "Non-finite authored position", { vertex });
        }
        return new THREE.Vector3(point.x, point.y, point.z);
    });

    function validate(
        face: QuadFace | TriangleFace,
        ref: FaceRef,
        count: 3 | 4
    ): void {
        if (!Array.isArray(face.corners) || face.corners.length !== count ||
            !Array.isArray(face.uvs) || face.uvs.length !== count ||
            typeof face.surface !== "string" || !face.surface.trim() ||
            (face.smoothingGroup !== undefined &&
                typeof face.smoothingGroup !== "string")) {
            invalid("invalid-input", "Invalid authored face", { face: ref });
        }

        if (new Set(face.corners).size !== count ||
            face.corners.some(index => !Number.isInteger(index) ||
                index < 0 || index >= vertices.length)) {
            invalid("invalid-topology", "Invalid face corner indices", { face: ref });
        }
        if (face.uvs.some(uv => !uv ||
            !Number.isFinite(uv.x) || !Number.isFinite(uv.y))) {
            invalid("invalid-input", "Invalid face UVs", { face: ref });
        }

        const a = vertices[face.corners[0]!]!;
        const b = vertices[face.corners[1]!]!;
        const c = vertices[face.corners[2]!]!;

        if (!triangleQuality(a, b, c, policy)) {
            invalid("degenerate-geometry", "Degenerate authored face", { face: ref });
        }

        if (count === 4) {
            const d = vertices[face.corners[3]!]!;

            if (!triangleQuality(a, c, d, policy) ||
                !triangleQuality(a, b, d, policy) ||
                !triangleQuality(b, c, d, policy)) {
                invalid("degenerate-geometry", "Degenerate authored quad", { face: ref });
            }

            const first = new THREE.Vector3().subVectors(b, a)
                .cross(new THREE.Vector3().subVectors(c, a));
            const second = new THREE.Vector3().subVectors(c, a)
                .cross(new THREE.Vector3().subVectors(d, a));

            if (first.dot(second) <= 0) {
                invalid("degenerate-geometry", "Folded authored quad", { face: ref });
            }
        }
    }

    const regions: Record<string, FaceRef[]> = Object.create(null);
    function register(surface: string, ref: FaceRef): void {
        (regions[surface] ??= []).push(ref);
    }

    const quads: QuadFace[] = source.quads.map((face, index) => {
        const ref: FaceRef = { kind: "quad", index };
        validate(face, ref, 4);
        register(face.surface, ref);
        return {
            corners: [...face.corners] as QuadFace["corners"],
            uvs: face.uvs.map(uv => new THREE.Vector2(uv.x, uv.y)) as QuadFace["uvs"],
            surface: face.surface,
            ...(face.smoothingGroup === undefined
                ? {} : { smoothingGroup: face.smoothingGroup })
        };
    });

    const triangles: TriangleFace[] = (source.triangles ?? []).map((face, index) => {
        const ref: FaceRef = { kind: "triangle", index };
        validate(face, ref, 3);
        register(face.surface, ref);
        return {
            corners: [...face.corners] as TriangleFace["corners"],
            uvs: face.uvs.map(uv => new THREE.Vector2(uv.x, uv.y)) as TriangleFace["uvs"],
            surface: face.surface,
            ...(face.smoothingGroup === undefined
                ? {} : { smoothingGroup: face.smoothingGroup })
        };
    });

    return {
        id: Symbol("geometry-result"),
        geometry: {
            vertices,
            quads,
            ...(source.triangles === undefined ? {} : { triangles })
        },
        boundaries: Object.create(null) as Record<string, readonly BoundaryRef[]>,
        regions
    };
}

/** Rejects selection handles from earlier geometry results. */
export function assertSelectionOwner(
    source: GeometryResult,
    selection: BoundaryRef | EdgeRef | SurfacePatchRef
): void {
    if (selection.owner !== source.id) {
        throw new GeometryOperationError(
            "selection", "invalid-input",
            "Selection belongs to a different geometry result"
        );
    }
}
