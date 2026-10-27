import * as THREE from "three";
import { cm, mm } from "../toolbox/units/length";
import { facetedDiamondOutline } from "../toolbox/shapes/profiles/facetedDiamondOutline";
import { profiledMesh } from "../toolbox/geometry/construction/profiledMesh";
import { oakVariant } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";
import { bladeSteel } from "../materials/metal/bladeSteel";

export default {
    create,
    slug: "dagger",
    title: "Common Quillon Dagger",
    description: "A practical late-medieval steel dagger with a fitted oak-and-iron hilt."
};

// A modest civilian dagger, c. 1400. The model authors shapes, proportions
// and materials; the toolbox creates cross-sections, seams and topology.
function create(): THREE.Group {
    const dagger = new THREE.Group();
    dagger.name = "CommonQuillonDagger";
    const steel = bladeSteel();
    const iron = wroughtIron();
    const oak = oakVariant(6);

    dagger.add(profiledMesh({
        name: "ForgedDoubleEdgedBlade",
        axis: "y",
        outline: facetedDiamondOutline([0.47, 0.79]),
        profile: {
            start: {at: -cm(23.25), radii: [mm(0.22), mm(1)]},
            spans: [
                // Curved taper from the point to the broad blade root.
                {length: cm(20.25), to: [mm(2.7), mm(16.1)],
                    easing: "out", samples: 7},
                {length: cm(1.8), to: [mm(2.7), mm(16.1)], samples: 1},
                // The short unsharpened base enters the forged guard.
                {length: mm(10.5), to: [mm(2.5), mm(15.6)],
                    surface: "ricasso", samples: 1}
            ]
        },
        tipStart: -cm(23.75),
        surface: "blade",
        sideSurfaces: {1: "edge", 2: "edge", 5: "edge", 6: "edge"},
        smoothing: "faceted",
        materials: {blade: steel.body, edge: steel.edge, ricasso: steel.body},
        capMaterial: steel.body
    }));

    dagger.add(profiledMesh({
        name: "ForgedQuillonWithIntegralSeat",
        axis: "x",
        mirrorAround: 0,
        profile: {
            start: {at: mm(5), radii: [mm(8.3), mm(11.2)],
                offset: [mm(0.15), 0]},
            spans: [
                // The center swells into the continuous grip seat.
                {length: mm(8), to: [mm(6.4), mm(7.1)], samples: 2,
                    offset: [-mm(0.35), 0],
                    bulge: {radii: [mm(0.65), mm(0.65)]}},
                {length: mm(10), to: [mm(3.1), mm(3.2)], samples: 2,
                    offset: [-mm(2.5), 0]},
                // Narrow forged arms curve downward toward the tips.
                {length: mm(16), to: [mm(3.35), mm(3.45)], samples: 2,
                    offset: [-mm(5.8), 0]},
                {length: mm(2), to: [mm(2.45), mm(2.7)], samples: 1,
                    offset: [-mm(6.1), 0]}
            ]
        },
        tipStart: -mm(42.4),
        tipEnd: mm(42.4),
        smoothing: "smooth",
        materials: iron
    }));

    dagger.add(profiledMesh({
        name: "ContinuousFittedOakAndIronHilt",
        axis: "y",
        profile: {
            start: {at: mm(4.8), radii: [mm(6.8), mm(8.6)]},
            spans: [
                // Iron ferrule grows out of the guard.
                {length: mm(9), to: [mm(10.9), mm(12.2)],
                    bulge: {radii: [mm(0.4), mm(0.9)], peak: 0.77},
                    easing: "out", samples: 4},
                // Long carved oak grip fitted into the two iron ends.
                {length: mm(97.2), to: [mm(10.5), mm(11.8)],
                    surface: "oak", easing: "smooth", samples: 9,
                    bulge: {radii: [mm(1.55), mm(2.5)], peak: 0.38},
                    variation: 1},
                // Plain iron wheel pommel, neck and peened tang.
                {length: mm(20), to: [mm(8.6), mm(9.4)],
                    surface: "iron", samples: 7,
                    bulge: {radii: [mm(4.4), mm(5.5)], peak: 0.57}},
                {length: mm(1.2), to: [mm(4), mm(4.3)], samples: 2},
                {length: mm(2.9), to: [mm(2.2), mm(2.4)], samples: 2,
                    bulge: {radii: [mm(0.6), mm(0.6)]}}
            ]
        },
        surface: "iron",
        smoothing: {iron: "smooth", oak: "faceted"},
        radialWaves: [
            {lobes: 3, amplitude: 0.012, axialFrequency: 32},
            {lobes: 5, amplitude: 0.006, axialFrequency: -21}
        ],
        materials: {iron, oak: oak.face},
        capMaterial: iron
    }));

    return dagger;
}
