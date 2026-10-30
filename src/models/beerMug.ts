import * as THREE from "three";
import type { GeometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { cm, mm } from "../toolbox/units/length";
import { cooperedStaves } from "./components/cooperedStaves";
import { forgedBand } from "./components/forgedBand";
import { cylinderMesh } from "../toolbox/geometry/construction/cylinderMesh";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { tankardHandle } from "./components/tankardHandle";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { offsetMeshUvs } from "../toolbox/geometry/edit/geometryEdits";
import { coherentVariation } from "../toolbox/spatial/layout/coherentVariation";
import { oakVariant, oakBoardFace } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";
import { ProfiledCavity } from "../toolbox/geometry/construction/profiledCavity";
import { cavitySectionsFromSurfaces } from "../toolbox/geometry/queries/cavitySectionsFromSurfaces";
import {
    createFillableVolume,
    type FillLevelController
} from "../toolbox/geometry/construction/fillableVolume";

const STAVE_COUNT = 12;
const TANKARD_PROFILE = [
    new THREE.Vector2(cm(4.7), 0),
    new THREE.Vector2(cm(5.15), cm(7.1)),
    new THREE.Vector2(cm(4.9), cm(15.2))
];
export default {
    create,
    slug: "beer-mug",
    title: "Wooden Tavern Tankard",
    description: "A practical wooden drinking mug with staves and two iron bands."
};

export interface TankardGeometry {
    staves: GeometryResult[];
    floor: GeometryResult;
    bands: GeometryResult[];
    handle: GeometryResult;
}

/** Geometric construction, independent of baked textures and rendering. */
export function buildTankardGeometry(): TankardGeometry {
    // A stave is centered on +X so the handle can be fitted to the
    // real faceted wood instead of to an invisible smooth cylinder.
    const angleOffset = Math.PI / 2 - Math.PI / STAVE_COUNT;
    const staves = cooperedStaves(TANKARD_PROFILE, {
        count: STAVE_COUNT, thickness: mm(8),
        edgeRoundover: mm(0.8),
        angleOffset
    });

    // A single plain inset disk: the bottom is low-cost and actually closed.
    const floor = geometryResult(cylinderMesh({
        radiusTop: cm(4.08), radiusBottom: cm(4.08),
        height: cm(1), radialSegments: STAVE_COUNT
    }));

    // Give a full-sized hand room: keep the hoops near the wooden ends,
    // leaving the long central section free for the handle.
    const bandWidth = cm(1.05);
    const upperBandCenter = cm(14.05);
    const bands = [cm(1.0), upperBandCenter].map(y =>
        forgedBand(TANKARD_PROFILE, {
            y, width: bandWidth, thickness: mm(2.1),
            clearance: mm(0.25), radialSegments: 24, angleOffset
        })
    );

    const handle = tankardHandle(
        staves[0]!, upperBandCenter, bandWidth
    );

    return {staves, floor, bands, handle};
}

/**
 * Derive the serving volume from the actual stave faces. The section
 * heights come from the same authored profile that constructs the wood;
 * neither the outline nor its correspondence is approximated by a circle.
 */
export function buildTankardServingCavity(staves: readonly GeometryResult[]): ProfiledCavity {
    const rings = cavitySectionsFromSurfaces({
        pieces: staves.map(stave => ({
            geometry: stave.geometry,
            regions: ["inner"],
            localToWorld: new THREE.Matrix4()
        })),
        sectionFrame: new THREE.Matrix4(),
        heights: TANKARD_PROFILE.map(point => point.y)
    });

    const physical = new ProfiledCavity(rings).between(
        cm(1.9) + mm(0.2),
        cm(15.2) - mm(2)
    );

    // Fill level 1 is one serving with 10% of the physical volume as headroom.
    return physical.between(
        physical.bottom,
        physical.heightAtFill(0.9)
    );
}

function create(): THREE.Group & FillLevelController {
    const tankard = new THREE.Group();
    tankard.name = "WoodenTavernTankard";
    const parts = buildTankardGeometry();
    const tones = coherentVariation({
        count: STAVE_COUNT, seed: 19, radius: 3, cyclic: true
    });
    const seeds = [1, 3, 5, 7];

    for (let i = 0; i < parts.staves.length; i++) {
        const seed = seeds[i % seeds.length]!;
        const oak = oakVariant(seed);
        const shade = 0.945 + 0.035 * tones[i]!;
        tankard.add(surfaceMesh({
            name: `Stave${String(i + 1).padStart(2, "0")}`,
            geometry: offsetMeshUvs(
                parts.staves[i]!,
                cm(2) + (i % 4) * cm(4),
                cm(9) + (i % 5) * cm(16)
            ),
            materials: {
                outer: oak.tinted.face,
                inner: oak.tinted.face,
                "edge-left": oak.tinted.face,
                "edge-right": oak.tinted.face,
                "cap-start": oak.tinted.endGrain,
                "cap-end": oak.tinted.endGrain
            },
            tint: new THREE.Color(shade, shade, shade)
        }));
    }

    const bottom = surfaceMesh({
        name: "InsetWoodenBottom",
        geometry: parts.floor,
        materials: oakBoardFace(3),
        tint: new THREE.Color(0.88, 0.88, 0.88)
    });
    bottom.position.y = cm(1.4);
    tankard.add(bottom);

    for (const [i, geometry] of parts.bands.entries()) {
        tankard.add(surfaceMesh({
            name: i === 0 ? "LowerIronBand" : "UpperIronBand",
            geometry,
            materials: wroughtIron()
        }));
    }

    const grip = surfaceMesh({
        name: "FittedWoodenGrip",
        geometry: parts.handle,
        materials: oakVariant(3).tinted.face,
        tint: new THREE.Color(0.88, 0.83, 0.78)
    });
    tankard.add(grip);

    const cavity = buildTankardServingCavity(parts.staves);
    const beer = createFillableVolume(
        cavity,
        new THREE.MeshPhysicalMaterial({
            name: "Amber Ale",
            color: "#b77a2b",
            metalness: 0,
            roughness: 0.2,
            clearcoat: 0.5,
            clearcoatRoughness: 0.1,
            side: THREE.DoubleSide
        }),
        0.65,
        mm(0.35)
    );
    beer.mesh.name = "AmberAleContents";
    tankard.add(beer.mesh);

    // A stable model instance exposes live fill control to games and viewers.
    return Object.assign(tankard, {
        getFillLevel: beer.getFillLevel,
        setFillLevel: beer.setFillLevel
    });
}
