import * as THREE from "three";

import { wellStonework } from "./components/wellStonework";
import { cylinderMesh } from "../toolbox/geometry/construction/cylinderMesh";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";

export default {
    slug: "village-well",
    title: "Village Well",
    description: "The lower stone courses of a village well, with recessed water.",
    category: "architecture" as const,
    create
};

function create(): THREE.Group {
    const well = new THREE.Group();
    well.name = "VillageWell";

    well.add(wellStonework());
    well.add(wellWater());

    return well;
}

/** A dark recessed surface, not a fake solid stone cap over the opening. */
function wellWater(): THREE.Mesh {
    const surface = surfaceMesh({
        name: "WaterBelowTheRim",
        geometry: geometryResult(cylinderMesh({
            radiusTop: 0.445,
            radiusBottom: 0.445,
            height: 0.008,
            radialSegments: 32
        })),
        materials: new THREE.MeshPhysicalMaterial({
            name: "Deep Well Water",
            color: "#243c3c",
            metalness: 0,
            roughness: 0.3,
            clearcoat: 0.25,
            clearcoatRoughness: 0.22
        })
    });
    surface.position.y = 0.065;
    return surface;
}
