import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "./MeshData";

/**
 * Assemble authored control geometry from triangular and quadrilateral faces.
 * Identical construction positions share vertex IDs across material, UV and
 * smoothing seams. Render-only duplication is handled later by the regular
 * toBufferGeometry conversion, not by model-specific mesh compilers.
 *
 * This builder does NOT triangulate quads, infer topology, or silently
 * discard degenerate faces; callers choose their genuine face structure.
 */
export class AuthoredMeshBuilder {
    private readonly vertices: THREE.Vector3[] = [];
    private readonly quads: QuadFace[] = [];
    private readonly triangles: TriangleFace[] = [];
    private readonly verticesByPosition = new Map<string, number>();

    constructor(private readonly weldResolution = 1e-9) {
        if (!Number.isFinite(weldResolution) || weldResolution <= 0) {
            throw new RangeError("Invalid construction vertex resolution");
        }
    }

    private vertexId(point: THREE.Vector3Like): number {
        if (![point.x, point.y, point.z].every(Number.isFinite)) {
            throw new RangeError("Non-finite authored vertex");
        }
        const key = [point.x, point.y, point.z]
            .map(value => Math.round(value / this.weldResolution))
            .join(":");
        const existing = this.verticesByPosition.get(key);
        if (existing !== undefined) return existing;
        const index = this.vertices.length;
        this.vertices.push(new THREE.Vector3(point.x, point.y, point.z));
        this.verticesByPosition.set(key, index);
        return index;
    }

    addFace(
        corners: readonly THREE.Vector3Like[],
        uv: readonly THREE.Vector2Like[],
        surface: string,
        smoothingGroup?: string
    ): void {
        if (![3, 4].includes(corners.length) ||
            uv.length !== corners.length ||
            !surface.trim() ||
            uv.some(point => ![point.x, point.y].every(Number.isFinite))) {
            throw new RangeError("Invalid authored face");
        }
        const ids = corners.map(point => this.vertexId(point));
        if (new Set(ids).size !== corners.length) {
            throw new RangeError("Authored face has collapsed edges");
        }
        const uvs = uv.map(p => new THREE.Vector2(p.x, p.y));
        const properties = {
            surface,
            ...(smoothingGroup === undefined ? {} : {smoothingGroup})
        };
        if (ids.length === 4) {
            this.quads.push({
                corners: ids as QuadFace["corners"],
                uvs: uvs as QuadFace["uvs"],
                ...properties
            });
        } else {
            this.triangles.push({
                corners: ids as TriangleFace["corners"],
                uvs: uvs as TriangleFace["uvs"],
                ...properties
            });
        }
    }

    build(): MeshData {
        return {
            vertices: this.vertices,
            quads: this.quads,
            ...(this.triangles.length ? {triangles: this.triangles} : {})
        };
    }
}
