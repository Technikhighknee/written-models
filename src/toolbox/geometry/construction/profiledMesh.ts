import type * as THREE from "three";
import { loftAxialProfile } from "./loftAxialProfile";
import type { LoftAxialProfileOptions } from "./loftAxialProfile";
import { profileSpans } from "../../shapes/profiles/profileSpans";
import type { ProfileSpansOptions } from "../../shapes/profiles/profileSpans";
import { mirrorStations } from "../../shapes/profiles/mirrorStations";
import { surfaceMesh } from "../mesh/surfaceMesh";
import type { SurfaceMeshOptions } from "../mesh/surfaceMesh";

export interface ProfiledMeshOptions extends Omit<LoftAxialProfileOptions, "stations">,
    Omit<SurfaceMeshOptions, "geometry"> {
    profile: ProfileSpansOptions;
    /** Mirror an authored positive half about the given axial coordinate. */
    mirrorAround?: number;
}

/**
 * Construct a complete control-mesh-backed object from a section profile.
 * This merely composes profileSpans, optional mirroring, lofting and surface
 * material assignment; nothing here knows what object is being modelled.
 */
export function profiledMesh({
    name, materials, capMaterial, profile, mirrorAround, ...options
}: ProfiledMeshOptions): THREE.Mesh {
    const authored = profileSpans(profile);
    const stations = mirrorAround === undefined
        ? authored : mirrorStations(authored, mirrorAround);
    return surfaceMesh({
        name,
        geometry: loftAxialProfile({...options, stations}),
        materials,
        ...(capMaterial === undefined ? {} : {capMaterial})
    });
}
