import * as THREE from "three";
import { cm, mm } from "../toolbox/units/length";
import { loftAxialProfile } from "../toolbox/geometry/construction/loftAxialProfile";
import { mirrorStations } from "../toolbox/shapes/profiles/mirrorStations";
import { profileSpans } from "../toolbox/shapes/profiles/profileSpans";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { oakVariant } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";
import { bladeSteel } from "../materials/metal/bladeSteel";

export default {
    create,
    slug: "dagger",
    title: "Common Quillon Dagger",
    description: "A practical late-medieval steel dagger with a fitted oak-and-iron hilt."
};

// A modest civilian dagger, c. 1400. The geometry is defined by authored
// cross-sections and measurements; the toolbox owns its construction.
function create(): THREE.Group {
    const dagger = new THREE.Group();
    dagger.name = "CommonQuillonDagger";
    const steel = bladeSteel();
    const iron = wroughtIron();
    const oak = oakVariant(6);

    // U = blade thickness (Z), V = half-width (X). The eight faces
    // distinguish the central ridge, flat shoulders and sharpened bevels.
    dagger.add(surfaceMesh({
        name: "ForgedDoubleEdgedBlade",
        geometry: loftAxialProfile({
            axis: "y",
            outline: [
                [1, 0], [0.47, 0.79], [0, 1], [-0.47, 0.79],
                [-1, 0], [-0.47, -0.79], [0, -1], [0.47, -0.79]
            ],
            stations: [
                { at: -cm(23.25), radii: [mm(0.22), mm(1.0)] },
                { at: -cm(22.5),  radii: [mm(0.55), mm(2.5)] },
                { at: -cm(20.5),  radii: [mm(1.15), mm(5.8)] },
                { at: -cm(17.0),  radii: [mm(1.65), mm(9.1)] },
                { at: -cm(12.5),  radii: [mm(2.1),  mm(12.2)] },
                { at: -cm(7.5),   radii: [mm(2.55), mm(14.7)] },
                { at: -cm(3.0),   radii: [mm(2.7),  mm(16.1)] },
                { at: -cm(1.2),   radii: [mm(2.7),  mm(16.1)], surface: "ricasso" },
                { at: -mm(1.5),   radii: [mm(2.5),  mm(15.6)] }
            ],
            tipStart: -cm(23.75),
            surface: "blade",
            sideSurfaces: { 1: "edge", 2: "edge", 5: "edge", 6: "edge" },
            smoothing: "faceted"
        }),
        materials: { blade: steel.body, edge: steel.edge, ricasso: steel.body },
        capMaterial: steel.body
    }));

    // Only one half needs designing. The mirrored section follows the
    // same forged sweep and includes the integral central grip seat.
    dagger.add(surfaceMesh({
        name: "ForgedQuillonWithIntegralSeat",
        geometry: loftAxialProfile({
            axis: "x",
            stations: mirrorStations([
                { at: mm(5),  radii: [mm(8.3), mm(11.2)], offset: [mm(0.15), 0] },
                { at: mm(9),  radii: [mm(8.0), mm(9.8)] },
                { at: mm(13), radii: [mm(6.4), mm(7.1)], offset: [-mm(0.35), 0] },
                { at: mm(17), radii: [mm(4.0), mm(4.3)], offset: [-mm(1.2), 0] },
                { at: mm(23), radii: [mm(3.1), mm(3.2)], offset: [-mm(2.5), 0] },
                { at: mm(32), radii: [mm(3.0), mm(3.1)], offset: [-mm(4.4), 0] },
                { at: mm(39), radii: [mm(3.35), mm(3.45)], offset: [-mm(5.8), 0] },
                { at: mm(41), radii: [mm(2.45), mm(2.7)], offset: [-mm(6.1), 0] }
            ]),
            tipStart: -mm(42.4),
            tipEnd: mm(42.4),
            smoothing: "smooth"
        }),
        materials: iron
    }));

    // One continuous hilt: the iron collar, oak and wheel pommel meet at
    // shared cross-section loops instead of overlapping floating meshes.
    // The surface label changes precisely at each material joint.
    dagger.add(surfaceMesh({
        name: "ContinuousFittedOakAndIronHilt",
        geometry: loftAxialProfile({
            axis: "y",
            stations: profileSpans({
                start: { at: mm(4.8), radii: [mm(6.8), mm(8.6)] },
                spans: [
                    // Fitted iron collar flares out of the guard.
                    { length: mm(9), to: [mm(10.9), mm(12.2)],
                        bulge: { radii: [mm(0.4), mm(0.9)], peak: 0.77 },
                        easing: "out", samples: 4 },
                    // Shaped oak, broader through the palm and thinner
                    // where it sits inside the iron fittings.
                    { length: mm(97.2), to: [mm(10.5), mm(11.8)],
                        surface: "oak", easing: "smooth", samples: 9,
                        bulge: { radii: [mm(1.55), mm(2.5)], peak: 0.38 },
                        variation: 1 },
                    // Swollen wheel-shaped pommel, with a narrower neck.
                    { length: mm(20), to: [mm(8.6), mm(9.4)],
                        surface: "iron", samples: 7,
                        bulge: { radii: [mm(4.4), mm(5.5)], peak: 0.57 } },
                    { length: mm(1.2), to: [mm(4.0), mm(4.3)], samples: 2 },
                    // Peened tang, still part of the same continuous mesh.
                    { length: mm(2.9), to: [mm(2.2), mm(2.4)], samples: 2,
                        bulge: { radii: [mm(0.6), mm(0.6)] } }
                ]
            }),
            surface: "iron",
            smoothing: { iron: "smooth", oak: "faceted" },
            radialWaves: [
                { lobes: 3, amplitude: 0.012, axialFrequency: 32 },
                { lobes: 5, amplitude: 0.006, axialFrequency: -21 }
            ]
        }),
        materials: { iron, oak: oak.face },
        capMaterial: iron
    }));

    return dagger;
}
