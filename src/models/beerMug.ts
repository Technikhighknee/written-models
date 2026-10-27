import * as THREE from "three";
import type { MeshData } from "../toolbox/geometry/mesh/MeshData";
import { cm, mm } from "../toolbox/units/length";
import { radialStaves } from "../toolbox/geometry/construction/radialStaves";
import { bandAroundProfile } from "../toolbox/geometry/construction/bandAroundProfile";
import { cylinderMesh } from "../toolbox/geometry/construction/cylinderMesh";
import { sweepSection } from "../toolbox/geometry/construction/sweepSection";
import { fitBoundaryToSurface } from "../toolbox/geometry/construction/fitBoundaryToSurface";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { offsetMeshUvs } from "../toolbox/geometry/uv/offsetMeshUvs";
import { tintVertices } from "../toolbox/geometry/materials/tintVertices";
import { coherentVariation } from "../toolbox/spatial/layout/coherentVariation";
import { oakVariant, oakBoardFace } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";

const STAVE_COUNT = 12;
const STAVE_SURFACES = {
    outer: 0, inner: 0, "edge-left": 0, "edge-right": 0,
    "cap-start": 1, "cap-end": 1
} as const;

export default {
    create,
    slug: "beer-mug",
    title: "Wooden Tavern Tankard",
    description: "A practical wooden drinking mug with staves and two iron bands."
};

export interface TankardGeometry {
    staves: MeshData[];
    floor: MeshData;
    bands: THREE.BufferGeometry[];
    handle: MeshData;
}

/** Geometric construction, independent of baked textures and rendering. */
export function buildTankardGeometry(): TankardGeometry {
    const profile = [
        new THREE.Vector2(cm(4.7), 0),
        new THREE.Vector2(cm(5.15), cm(7.1)),
        new THREE.Vector2(cm(4.9), cm(15.2))
    ];

    // A stave is centered on +X so the handle can be fitted to the
    // real faceted wood instead of to an invisible smooth cylinder.
    const angleOffset = Math.PI / 2 - Math.PI / STAVE_COUNT;
    const staves = radialStaves(profile, {
        count: STAVE_COUNT, thickness: mm(8),
        edgeRoundover: mm(0.8),
        innerWidthSamples: [0, 1],
        angleOffset
    });

    // A single plain inset disk: the bottom is low-cost and actually closed.
    const floor = cylinderMesh({
        radiusTop: cm(4.08), radiusBottom: cm(4.08),
        height: cm(1), radialSegments: STAVE_COUNT
    });

    // Give a full-sized hand room: keep the hoops near the wooden ends,
    // leaving the long central section free for the handle.
    const bandWidth = cm(1.05);
    const upperBandCenter = cm(14.05);
    const bands = [cm(1.0), upperBandCenter].map(y =>
        bandAroundProfile(profile, {
            y, width: bandWidth, thickness: mm(2.1),
            clearance: mm(0.25), radialSegments: 24, angleOffset
        })
    );

    // Two solid mounts flank an approximately 8 cm graspable vertical
    // section. Keep the upper mount tied to the lower edge of its hoop.
    const upperHandleY = upperBandCenter - bandWidth / 2 - cm(1.25);

    // Adult-hand grip: 24 mm across the knuckles (Z), 18 mm in depth (X).
    // Eight real bevelled sides, without extra smoothing subdivisions.
    const w = mm(12), d = mm(9), b = mm(2.4);
    const section = [
        [-w + b, -d], [w - b, -d], [w, -d + b], [w, d - b],
        [w - b, d], [-w + b, d], [-w, d - b], [-w, -d + b]
    ].map(([x, y]) => new THREE.Vector2(x!, y!));

    let handle = sweepSection({
        path: [
            new THREE.Vector3(cm(4.95), upperHandleY, 0),
            new THREE.Vector3(cm(6.8), upperHandleY, 0),
            new THREE.Vector3(cm(8.7), upperHandleY - mm(0.5), 0),
            new THREE.Vector3(cm(10.3), cm(11.5), 0),
            new THREE.Vector3(cm(10.4), cm(9.9), 0),
            new THREE.Vector3(cm(10.4), cm(5.3), 0),
            new THREE.Vector3(cm(10.3), cm(3.65), 0),
            new THREE.Vector3(cm(8.8), cm(3.0), 0),
            new THREE.Vector3(cm(6.8), cm(2.9), 0),
            new THREE.Vector3(cm(4.95), cm(3.15), 0)
        ],
        section, referenceAxis: new THREE.Vector3(0, 0, 1),
        segments: 18, endFlare: 0.03
    });

    const contactGeometry = toBufferGeometry(staves[0]!, STAVE_SURFACES);
    try {
        const target = new THREE.Mesh(contactGeometry);
        for (const boundarySurface of ["cap-start", "cap-end"]) {
            handle = fitBoundaryToSurface({
                geometry: handle, boundarySurface, target,
                direction: new THREE.Vector3(-1, 0, 0),
                rayOffset: cm(9), maxDistance: cm(16),
                embed: mm(0.5), falloffRings: 1
            });
        }
    } finally {
        contactGeometry.dispose();
    }

    return {staves, floor, bands, handle};
}

function create(): THREE.Group {
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
        const piece = surfaceMesh({
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
            }
        });
        const shade = 0.945 + 0.035 * tones[i]!;
        tintVertices(piece.geometry, new THREE.Color(shade, shade, shade));
        tankard.add(piece);
    }

    const bottom = surfaceMesh({
        name: "InsetWoodenBottom",
        geometry: parts.floor,
        materials: oakBoardFace(3)
    });
    bottom.position.y = cm(1.4);
    tintVertices(bottom.geometry, new THREE.Color(0.88, 0.88, 0.88));
    tankard.add(bottom);

    for (const [i, geometry] of parts.bands.entries()) {
        const band = new THREE.Mesh(geometry, wroughtIron());
        band.name = i === 0 ? "LowerIronBand" : "UpperIronBand";
        tankard.add(band);
    }

    const grip = surfaceMesh({
        name: "FittedWoodenGrip",
        geometry: parts.handle,
        materials: oakVariant(3).tinted.face
    });
    tintVertices(grip.geometry, new THREE.Color(0.88, 0.83, 0.78));
    tankard.add(grip);
    return tankard;
}
