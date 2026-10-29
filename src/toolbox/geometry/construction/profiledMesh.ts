import type * as THREE from "three";
import {
    profiledSolid, type ProfiledSolidOptions
} from "./profiledSolid";
import { surfaceMesh } from "../mesh/surfaceMesh";
import type { SurfaceMeshOptions } from "../mesh/surfaceMesh";

export interface ProfiledMeshOptions extends ProfiledSolidOptions,
    Omit<SurfaceMeshOptions, "geometry"> {}

/** Render an authored profile without losing its owned construction data. */
export function profiledMesh({
    name, materials, capMaterial, ...options
}: ProfiledMeshOptions): THREE.Mesh {
    return surfaceMesh({
        name,
        geometry: profiledSolid(options),
        materials,
        ...(capMaterial === undefined ? {} : {capMaterial})
    });
}
