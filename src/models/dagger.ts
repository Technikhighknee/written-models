import * as THREE from "three";
import { cm, mm } from "../toolbox/units/length";
import { loftRings } from "../toolbox/geometry/construction/loftRings";
import { ellipticalRing } from "../toolbox/geometry/construction/ellipticalRing";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { oakVariant } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";
import { bladeSteel } from "../materials/metal/bladeSteel";

export default {
    create,
    slug: "dagger",
    title: "Common Quillon Dagger",
    description: "A practical late-medieval steel dagger with a fitted oak-and-iron hilt."
};

// A modest civilian quillon dagger, c. 1400. Every joint is designed
// at its actual mating contour, not hidden by overlapping cylinders.
function create(): THREE.Group {
    const dagger = new THREE.Group();
    dagger.name = "CommonQuillonDagger";

    const steel = bladeSteel();
    const iron = wroughtIron();
    const oak = oakVariant(6);

    // A double-edged, diamond-ridged blade: the bevel shoulders and
    // cutting edges are individually authored longitudinal contours.
    function bladeSection(y: number, halfWidth: number, halfThick: number) {
        const shoulder = halfWidth * 0.79;
        const shoulderDepth = halfThick * 0.47;
        return [
            new THREE.Vector3(0, y, halfThick),
            new THREE.Vector3(shoulder, y, shoulderDepth),
            new THREE.Vector3(halfWidth, y, 0),
            new THREE.Vector3(shoulder, y, -shoulderDepth),
            new THREE.Vector3(0, y, -halfThick),
            new THREE.Vector3(-shoulder, y, -shoulderDepth),
            new THREE.Vector3(-halfWidth, y, 0),
            new THREE.Vector3(-shoulder, y, shoulderDepth)
        ];
    }

    const bladeStations = [
        [-cm(23.25), mm(1.0), mm(0.22)],
        [-cm(22.5), mm(2.5), mm(0.55)],
        [-cm(20.5), mm(5.8), mm(1.15)],
        [-cm(17.0), mm(9.1), mm(1.65)],
        [-cm(12.5), mm(12.2), mm(2.1)],
        [-cm(7.5), mm(14.7), mm(2.55)],
        [-cm(3.0), mm(16.1), mm(2.7)],
        [-cm(1.2), mm(16.1), mm(2.7)],
        [-mm(1.5), mm(15.6), mm(2.5)]
    ] as const;

    const blade = new THREE.Mesh(
        toBufferGeometry(loftRings({
            rings: bladeStations.map(([y, w, t]) => bladeSection(y, w, t)),
            start: { point: new THREE.Vector3(0, -cm(23.75), 0) },
            surface: (side, interval) =>
                interval === bladeStations.length - 2
                    ? "ricasso"
                    : [1, 2, 5, 6].includes(side) ? "edge" : "blade",
            smoothingGroup: side => `blade-plane-${side}`
        }), {
            blade: 0, edge: 1, ricasso: 0,
            "cap-start": 0, "cap-end": 0
        }),
        [steel.body, steel.edge]
    );
    blade.name = "ForgedDoubleEdgedBlade";
    dagger.add(blade);

    // The quillon and its broad central seating block are ONE forged
    // contour, not a thin bar with an intersecting box glued onto it.
    // Both ends sweep down and taper to rounded, hand-forged points.
    const guardStations = [
        [-mm(41), -mm(6.1), mm(2.45), mm(2.7)],
        [-mm(39), -mm(5.8), mm(3.35), mm(3.45)],
        [-mm(32), -mm(4.4), mm(3.0), mm(3.1)],
        [-mm(23), -mm(2.5), mm(3.1), mm(3.2)],
        [-mm(17), -mm(1.2), mm(4.0), mm(4.3)],
        [-mm(13), -mm(0.35), mm(6.4), mm(7.1)],
        [-mm(9), 0, mm(8.0), mm(9.8)],
        [-mm(5), mm(0.15), mm(8.3), mm(11.2)],
        [mm(5), mm(0.15), mm(8.3), mm(11.2)],
        [mm(9), 0, mm(8.0), mm(9.8)],
        [mm(13), -mm(0.35), mm(6.4), mm(7.1)],
        [mm(17), -mm(1.2), mm(4.0), mm(4.3)],
        [mm(23), -mm(2.5), mm(3.1), mm(3.2)],
        [mm(32), -mm(4.4), mm(3.0), mm(3.1)],
        [mm(39), -mm(5.8), mm(3.35), mm(3.45)],
        [mm(41), -mm(6.1), mm(2.45), mm(2.7)]
    ] as const;

    const guard = new THREE.Mesh(
        toBufferGeometry(loftRings({
            rings: guardStations.map(([x, y, ry, rz]) =>
                ellipticalRing({
                    center: new THREE.Vector3(x, y, 0),
                    axisU: new THREE.Vector3(0, 1, 0),
                    axisV: new THREE.Vector3(0, 0, 1),
                    radiusU: ry, radiusV: rz, segments: 12
                })
            ),
            start: { point: new THREE.Vector3(-mm(42.4), -mm(6.2), 0) },
            end: { point: new THREE.Vector3(mm(42.4), -mm(6.2), 0) },
            smoothingGroup: () => "forged-quillon"
        }), { side: 0, "cap-start": 0, "cap-end": 0 }),
        iron
    );
    guard.name = "ForgedQuillonWithIntegralSeat";
    dagger.add(guard);

    // The hilt is a single continuous authored surface. Its iron root
    // grows out of the guard's central seat; metal, timber and pommel
    // then meet edge-to-edge on THE SAME vertices, with no hidden
    // intersecting end caps, z-fighting, or empty rings between pieces.
    //
    // Each station owns the material of the interval above it.
    type HiltMaterial = "iron" | "oak";
    interface HiltStation {
        y: number;
        rx: number;
        rz: number;
        material: HiltMaterial;
        carving?: number;
    }
    const hiltStations: readonly HiltStation[] = [
        { y: mm(4.8),   rx: mm(8.6),  rz: mm(6.8),  material: "iron" },
        { y: mm(7.0),   rx: mm(9.6),  rz: mm(8.2),  material: "iron" },
        { y: mm(9.0),   rx: mm(10.9), rz: mm(9.8),  material: "iron" },
        { y: mm(10.6),  rx: mm(13.0), rz: mm(11.7), material: "iron" },
        { y: mm(12.0),  rx: mm(13.1), rz: mm(11.8), material: "iron" },
        { y: mm(13.8),  rx: mm(12.2), rz: mm(10.9), material: "oak" },

        // A narrow shoulder at each end fits inside its iron collar.
        // Gentle asymmetry lives only in the carved wood, not in the
        // dimensional fit of the joints.
        { y: mm(16.0),  rx: mm(12.5), rz: mm(11.0), material: "oak", carving: 0.3 },
        { y: mm(21.0),  rx: mm(12.9), rz: mm(11.3), material: "oak", carving: 0.6 },
        { y: mm(32.0),  rx: mm(13.65),rz: mm(11.8), material: "oak", carving: 1.0 },
        { y: mm(49.0),  rx: mm(14.1), rz: mm(12.0), material: "oak", carving: 1.0 },
        { y: mm(67.0),  rx: mm(13.5), rz: mm(11.65),material: "oak", carving: 0.9 },
        { y: mm(86.0),  rx: mm(12.8), rz: mm(11.2), material: "oak", carving: 0.75 },
        { y: mm(101.0), rx: mm(12.7), rz: mm(11.1), material: "oak", carving: 0.45 },
        { y: mm(108.0), rx: mm(12.0), rz: mm(10.6), material: "oak", carving: 0.2 },
        { y: mm(111.0), rx: mm(11.8), rz: mm(10.5), material: "iron" },

        // A restrained wheel pommel, with a short peened tang formed
        // directly in the same contour instead of a floating cylinder.
        { y: mm(112.6), rx: mm(12.2), rz: mm(10.9), material: "iron" },
        { y: mm(114.0), rx: mm(12.9), rz: mm(11.5), material: "iron" },
        { y: mm(117.0), rx: mm(15.1), rz: mm(13.2), material: "iron" },
        { y: mm(120.0), rx: mm(16.0), rz: mm(14.0), material: "iron" },
        { y: mm(124.0), rx: mm(16.2), rz: mm(14.2), material: "iron" },
        { y: mm(127.0), rx: mm(15.2), rz: mm(13.5), material: "iron" },
        { y: mm(131.0), rx: mm(9.4),  rz: mm(8.6),  material: "iron" },
        { y: mm(132.2), rx: mm(4.3),  rz: mm(4.0),  material: "iron" },
        { y: mm(133.0), rx: mm(3.1),  rz: mm(2.85), material: "iron" },
        { y: mm(134.0), rx: mm(3.5),  rz: mm(3.2),  material: "iron" },
        { y: mm(135.1), rx: mm(2.4),  rz: mm(2.2),  material: "iron" }
    ];

    const hiltRings = hiltStations.map(station => {
        const ring = ellipticalRing({
            center: new THREE.Vector3(0, station.y, 0),
            axisU: new THREE.Vector3(0, 0, 1),
            axisV: new THREE.Vector3(1, 0, 0),
            radiusU: station.rz,
            radiusV: station.rx,
            segments: 12
        });

        // These small hand-tool deviations fade to zero at the precisely
        // fitted iron/wood seams. The original quad loops remain intact.
        return ring.map((point, index) => {
            const angle = 2 * Math.PI * index / 12;
            const variation = 1 + (station.carving ?? 0) * (
                0.012 * Math.sin(3 * angle + station.y * 32) +
                0.006 * Math.sin(5 * angle - station.y * 21)
            );
            point.x *= variation;
            point.z *= variation;
            return point;
        });
    });

    const hilt = new THREE.Mesh(
        toBufferGeometry(loftRings({
            rings: hiltRings,
            surface: (_side, interval) => hiltStations[interval]!.material,
            smoothingGroup: (side, interval) =>
                hiltStations[interval]!.material === "oak"
                    ? `carved-oak-face-${side}`
                    : "fitted-iron-hilt"
        }), {
            iron: 0, oak: 1,
            "cap-start": 0, "cap-end": 0
        }),
        [iron, oak.face]
    );
    hilt.name = "ContinuousFittedOakAndIronHilt";
    dagger.add(hilt);

    return dagger;
}
