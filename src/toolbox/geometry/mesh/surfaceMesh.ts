import * as THREE from "three";
import type { MeshData } from "./MeshData";
import type { GeometryResult } from "../kernel/GeometryResult";
import { toBufferGeometry } from "./toBufferGeometry";

export interface SurfaceMeshOptions {
    name: string;
    geometry: MeshData | GeometryResult;
    /** A uniform material, or an explicit map from surface to material. */
    materials: THREE.Material | Readonly<Record<string, THREE.Material>>;
    /** Fallback for loft cap-start / cap-end only. */
    capMaterial?: THREE.Material;
}

/**
 * Build a named mesh from authored surface topology, deduplicating shared
 * materials and preparing material groups for rendering and GLB export.
 * Never reconstructs or discards the control mesh used by Quad View.
 */
export function surfaceMesh({
    name, geometry, materials, capMaterial
}: SurfaceMeshOptions): THREE.Mesh {
    const authored = "geometry" in geometry ? geometry.geometry : geometry;
    const palette: THREE.Material[] = [];
    const indices: Record<string, number> = {};
    const bySurface = materials instanceof THREE.Material
        ? undefined : materials;

    for (const face of [...authored.quads, ...(authored.triangles ?? [])]) {
        const material = bySurface === undefined
            ? materials as THREE.Material
            : bySurface[face.surface] ??
                (face.surface === "cap-start" || face.surface === "cap-end"
                    ? capMaterial : undefined);
        if (!material) {
            throw new RangeError(`Missing material for surface ${face.surface}`);
        }
        if (indices[face.surface] !== undefined) continue;
        let index = palette.indexOf(material);
        if (index === -1) {
            index = palette.length;
            palette.push(material);
        }
        indices[face.surface] = index;
    }

    const result = new THREE.Mesh(
        toBufferGeometry(authored, indices),
        palette.length === 1 ? palette[0]! : palette
    );
    result.name = name;
    return result;
}
