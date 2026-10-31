import * as THREE from "three";

import { buildWellStonework, WELL_OPENING_RADIUS } from "./components/wellStonework";
import { cylinderMesh } from "../toolbox/geometry/construction/cylinderMesh";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";

export default {
    slug: "village-well",
    title: "Village Well",
    description: "Well, well, well.",
    category: "architecture" as const,
    create
};

function create(): THREE.Group {
    const well = new THREE.Group();
    well.name = "VillageWell";

    well.add(surfaceMesh({
        name: "StoneWellhead",
        geometry: buildWellStonework(),
        // Neutral preview only; the stone appearance will be authored later.
        materials: new THREE.MeshStandardMaterial({
            color: "#999999",
            roughness: 1
        })
    }));

    const water = surfaceMesh({
        name: "WellWater",
        geometry: geometryResult(cylinderMesh({
            radiusTop: WELL_OPENING_RADIUS - 0.004,
            radiusBottom: WELL_OPENING_RADIUS - 0.004,
            height: 0.006,
            radialSegments: 24
        })),
        materials: new THREE.MeshStandardMaterial({
            color: "#b0b0b0",
            roughness: 0.8
        })
    });
    water.position.y = 0.385;
    well.add(water);

    return well;
}
