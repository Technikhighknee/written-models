import * as THREE from "three";
import type { MeshData, QuadFace, TriangleFace } from "./MeshData";

export interface AuthoredMeshBuilderOptions {
    /** Position welding must be intentional; none preserves coincident parts. */
    weld: "position" | "none";
    resolution?: number;
}

/** Constructs authored faces without imposing render-vertex splits. */
export class AuthoredMeshBuilder {
    private readonly vertices: THREE.Vector3[] = [];
    private readonly quads: QuadFace[] = [];
    private readonly triangles: TriangleFace[] = [];
    private readonly verticesByPosition = new Map<string, number>();
    private readonly weldResolution: number;
    private readonly weld: "position" | "none";

    constructor(options: AuthoredMeshBuilderOptions) {
        const resolution = options?.resolution ?? 1e-9;
        if (!Number.isFinite(resolution) || resolution <= 0) {
            throw new RangeError("Invalid construction vertex resolution");
        }
        if (!options || (options.weld !== "none" && options.weld !== "position")) {
            throw new RangeError("Expected an explicit vertex welding policy");
        }
        this.weldResolution = resolution;
        this.weld = options.weld;
    }

    /** Adds a distinct vertex even at a position that already exists. */
    addVertex(point: THREE.Vector3Like): number {
        if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
            throw new RangeError("Non-finite authored vertex");
        }
        const index = this.vertices.length;
        this.vertices.push(new THREE.Vector3(point.x, point.y, point.z));
        return index;
    }

    private vertexId(point: THREE.Vector3Like): number {
        if (this.weld === "none") return this.addVertex(point);
        if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) {
            throw new RangeError("Non-finite authored vertex");
        }
        const key = [point.x, point.y, point.z]
            .map(value => Math.round(value / this.weldResolution))
            .join(":");
        const existing = this.verticesByPosition.get(key);
        if (existing !== undefined) return existing;
        const index = this.addVertex(point);
        this.verticesByPosition.set(key, index);
        return index;
    }

    /** Adds a face with explicit shared vertex IDs, independent of welding. */
    addIndexedFace(
        corners: readonly number[],
        uv: readonly THREE.Vector2Like[],
        surface: string,
        smoothingGroup?: string
    ): void {
        if ((corners.length !== 3 && corners.length !== 4) ||
            uv.length !== corners.length ||
            new Set(corners).size !== corners.length ||
            corners.some(index => !Number.isInteger(index) ||
                index < 0 || index >= this.vertices.length) ||
            !surface.trim() ||
            uv.some(point => !point ||
                ![point.x, point.y].every(Number.isFinite))) {
            throw new RangeError("Invalid authored indexed face");
        }
        const properties = {
            surface,
            ...(smoothingGroup === undefined ? {} : { smoothingGroup })
        };
        const uvs = uv.map(p => new THREE.Vector2(p.x, p.y));
        if (corners.length === 4) {
            this.quads.push({
                corners: [...corners] as QuadFace["corners"],
                uvs: uvs as QuadFace["uvs"],
                ...properties
            });
        } else {
            this.triangles.push({
                corners: [...corners] as TriangleFace["corners"],
                uvs: uvs as TriangleFace["uvs"],
                ...properties
            });
        }
    }

    /** Position-based faces follow the selected welding policy. */
    addFace(
        corners: readonly THREE.Vector3Like[],
        uv: readonly THREE.Vector2Like[],
        surface: string,
        smoothingGroup?: string
    ): void {
        if ((corners.length !== 3 && corners.length !== 4) ||
            uv.length !== corners.length ||
            !surface.trim() ||
            uv.some(point => !point ||
                ![point.x, point.y].every(Number.isFinite))) {
            throw new RangeError("Invalid authored face");
        }
        const ids = corners.map(point => this.vertexId(point));
        this.addIndexedFace(ids, uv, surface, smoothingGroup);
    }

    build(): MeshData {
        return {
            vertices: this.vertices,
            quads: this.quads,
            ...(this.triangles.length ? { triangles: this.triangles } : {})
        };
    }
}
