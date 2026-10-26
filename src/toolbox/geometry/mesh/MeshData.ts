import * as THREE from "three";

export interface QuadFace {
    corners: [number, number, number, number];
    uvs: [THREE.Vector2, THREE.Vector2, THREE.Vector2, THREE.Vector2];
    surface: string;
    smoothingGroup?: string;
}


/** Authored triangles, for cap transitions with different edge densities. */
export interface TriangleFace {
    corners: [number, number, number];
    uvs: [THREE.Vector2, THREE.Vector2, THREE.Vector2];
    surface: string;
    smoothingGroup?: string;
}

export interface MeshData {
    vertices: THREE.Vector3[];
    quads: QuadFace[];
    /** Real triangles; not misreported as control quads. */
    triangles?: TriangleFace[];
}
