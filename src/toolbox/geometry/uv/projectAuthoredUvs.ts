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
import {
    assertAffineTransform,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import { patchChartMatches, transferBoundary } from "../kernel/selectionLifecycle";

export type AuthoredUvProjector = (
    position: THREE.Vector3Like,
    face: FaceRef,
    corner: number
) => THREE.Vector2Like;

export interface AuthoredUvProjectionOptions {
    /** An omitted selection projects every authored face. */
    faces?: readonly FaceRef[];
    /** Named authored surfaces; mutually exclusive with faces. */
    surfaces?: readonly string[];
    precision?: GeometryPrecision;
}

function invalid(message: string): never {
    throw new GeometryOperationError(
        "projectAuthoredUvs", "invalid-input", message
    );
}

/**
 * Project independent UV corners, not GPU vertices. Different faces can
 * have different charts without breaking welded construction topology.
 */
export function projectAuthoredUvs(
    source: MeshData | GeometryResult,
    project: AuthoredUvProjector,
    options: AuthoredUvProjectionOptions = {}
): GeometryResult {
    if (typeof project !== "function" ||
        (options.faces !== undefined && options.surfaces !== undefined)) {
        invalid("Expected a projector and at most one face selection");
    }

    const policy = resolvePrecision(options.precision);
    const owned = "geometry" in source;
    const input = geometryResult(owned ? source.geometry : source, policy);
    const keys = new Set<string>();
    const surfaces = options.surfaces === undefined
        ? undefined : new Set(options.surfaces);

    for (const ref of options.faces ?? []) {
        if (!Number.isInteger(ref.index) || ref.index < 0 ||
            (ref.kind === "quad"
                ? ref.index >= input.geometry.quads.length
                : ref.kind === "triangle"
                    ? ref.index >= (input.geometry.triangles?.length ?? 0)
                    : true)) {
            invalid("UV selection contains an unknown authored face");
        }
        keys.add(`${ref.kind}:${ref.index}`);
    }

    if (surfaces && [...surfaces].some(name => !name.trim())) {
        invalid("UV surface names must be nonempty");
    }

    let projected = 0;
    const mapFace = <T extends QuadFace | TriangleFace>(
        face: T,
        ref: FaceRef
    ): T => {
        const selected = options.faces !== undefined
            ? keys.has(`${ref.kind}:${ref.index}`)
            : surfaces === undefined || surfaces.has(face.surface);
        if (!selected) return face;
        projected++;

        const uvs = face.corners.map((id, corner) => {
            const value = project(
                input.geometry.vertices[id]!.clone(), ref, corner
            );
            if (!value || ![value.x, value.y].every(Number.isFinite)) {
                invalid("UV projector returned nonfinite coordinates");
            }
            return new THREE.Vector2(value.x, value.y);
        });

        return {
            ...face,
            uvs: uvs as T["uvs"]
        };
    };

    const result = geometryResult({
        vertices: input.geometry.vertices,
        quads: input.geometry.quads.map((face, index) =>
            mapFace(face, { kind: "quad", index })
        ),
        triangles: (input.geometry.triangles ?? []).map((face, index) =>
            mapFace(face, { kind: "triangle", index })
        )
    }, policy);

    if (!projected) invalid("UV selection contains no authored faces");
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
            if (patchChartMatches(result, candidate, policy)) {
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

/** Construction-local planar coordinates in metres, independent of UV seams. */
export function planarUvProjector(
    frame: THREE.Matrix4,
    offset: THREE.Vector2Like = { x: 0, y: 0 },
    precision?: GeometryPrecision
): AuthoredUvProjector {
    const policy = resolvePrecision(precision);
    assertAffineTransform(frame, "planarUvProjector", policy);

    if (![offset.x, offset.y].every(Number.isFinite)) {
        invalid("Planar UV offset must be finite");
    }

    const e = frame.elements;
    const axes = [
        new THREE.Vector3(e[0], e[1], e[2]),
        new THREE.Vector3(e[4], e[5], e[6]),
        new THREE.Vector3(e[8], e[9], e[10])
    ];
    if (
        axes.some(axis => Math.abs(axis.length() - 1) > policy.angle) ||
        Math.abs(axes[0]!.dot(axes[1]!)) > policy.angle ||
        Math.abs(axes[0]!.dot(axes[2]!)) > policy.angle ||
        Math.abs(axes[1]!.dot(axes[2]!)) > policy.angle
    ) {
        invalid("Planar UV frame must be rigid so coordinates stay in metres");
    }

    const inverse = frame.clone().invert();
    const origin = new THREE.Vector2(offset.x, offset.y);

    return point => {
        const local = new THREE.Vector3(point.x, point.y, point.z)
            .applyMatrix4(inverse);
        return new THREE.Vector2(local.x, local.y).add(origin);
    };
}
