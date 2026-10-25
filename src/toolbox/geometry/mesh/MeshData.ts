import * as THREE from "three";

export interface QuadFace {
    corners: [number, number, number, number];
    uvs: [THREE.Vector2, THREE.Vector2, THREE.Vector2, THREE.Vector2];
    surface: string;
}

export interface MeshData {
    vertices: THREE.Vector3[];
    quads: QuadFace[];
}
