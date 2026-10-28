import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";

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

export type GeometryFailure =
    | "invalid-input"
    | "invalid-topology"
    | "degenerate-geometry"
    | "sampling-limit"
    | "no-intersection"
    | "outside-contact-patch"
    | "self-intersection"
    | "unsupported-topology"
    | "precision-loss";

export class GeometryOperationError extends Error {
    readonly operation: string;
    readonly reason: GeometryFailure;
    readonly context?: {
        face?: FaceRef;
        vertex?: number;
        station?: number;
        boundary?: string;
    };

    constructor(
        operation: string,
        reason: GeometryFailure,
        message: string,
        context?: GeometryOperationError["context"]
    ) {
        super(message);
        this.name = "GeometryOperationError";
        this.operation = operation;
        this.reason = reason;
        if (context !== undefined) this.context = context;
    }
}

function invalid(
    reason: GeometryFailure,
    message: string,
    context?: GeometryOperationError["context"]
): never {
    throw new GeometryOperationError("geometryResult", reason, message, context);
}

/** Creates an owned snapshot. Mutable input vectors and face arrays are never retained. */
export function geometryResult(source: MeshData): GeometryResult {
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
        const first = new THREE.Vector3().subVectors(b, a)
            .cross(new THREE.Vector3().subVectors(c, a));
        if (!(first.lengthSq() > 0)) {
            invalid("degenerate-geometry", "Collapsed authored face", { face: ref });
        }
        if (count === 4) {
            const d = vertices[face.corners[3]!]!;
            const second = new THREE.Vector3().subVectors(c, a)
                .cross(new THREE.Vector3().subVectors(d, a));
            if (!(second.lengthSq() > 0) || first.dot(second) <= 0) {
                invalid("degenerate-geometry", "Collapsed or folded quad", { face: ref });
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
