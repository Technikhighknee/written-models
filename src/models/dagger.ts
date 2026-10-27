import * as THREE from "three";
import { cm, mm } from "../toolbox/units/length";
import { loftRings } from "../toolbox/geometry/construction/loftRings";
import { cylinderMesh, CYLINDER_SURFACES } from "../toolbox/geometry/construction/cylinderMesh";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { oakVariant } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";
import { bladeSteel } from "../materials/metal/bladeSteel";

export default {
    create,
    slug: "dagger",
    title: "Common Quillon Dagger",
    description: "A practical late-medieval steel dagger with a shaped oak grip."
};

// An unadorned quillon dagger, c. 1400. Overall length ~37 cm,
// with a 23.5 cm tapered double-edged blade. No decorative fittings,
// jewels, fantastical proportions, or implausibly broad crossguard.
function create(): THREE.Group {
    const dagger = new THREE.Group();
    dagger.name = "CommonQuillonDagger";

    const steel = bladeSteel();
    const iron = wroughtIron();
    const oak = oakVariant(6);

    // Eight authored corners: two cutting edges, two center ridges and
    // four shoulders separating the flatter steel from sharpened bevels.
    // Exact contours define the sharp edges; no boolean operations.
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

    // The point is an authored apex, not four coincident vertices.
    // Long, restrained taper: a serviceable civilian dagger, not a sword.
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

    const bladeData = loftRings({
        rings: bladeStations.map(([y, w, t]) => bladeSection(y, w, t)),
        start: { point: new THREE.Vector3(0, -cm(23.75), 0) },
        // A real unsharpened base is captured inside the guard.
        surface: (side, interval) => {
            if (interval === bladeStations.length - 2) return "ricasso";
            return [1, 2, 5, 6].includes(side) ? "edge" : "blade";
        },
        smoothingGroup: side => `blade-plane-${side}`
    });
    const blade = new THREE.Mesh(
        toBufferGeometry(bladeData, {
            blade: 0, edge: 1, ricasso: 0,
            "cap-start": 0, "cap-end": 0
        }),
        [steel.body, steel.edge]
    );
    blade.name = "ForgedDoubleEdgedBlade";
    dagger.add(blade);

    // A simple iron crosspiece with lightly downturned quillons.
    // Loft along X; its changing octagonal sections produce the subtle
    // swells of forged iron without a cast ornament or fake intersections.
    function guardRing(
        x: number, y: number, ry: number, rz: number
    ): THREE.Vector3[] {
        return Array.from({ length: 8 }, (_, i) => {
            const a = 2 * Math.PI * i / 8;
            return new THREE.Vector3(
                x, y + ry * Math.cos(a), rz * Math.sin(a)
            );
        });
    }

    const guardShape = [
        [-cm(4.1), -mm(6.1), mm(2.45), mm(2.7)],
        [-cm(3.9), -mm(5.8), mm(3.35), mm(3.45)],
        [-cm(2.6), -mm(2.65), mm(3.05), mm(3.2)],
        [-cm(1.1), 0, mm(3.6), mm(3.85)],
        [-mm(6.1), mm(0.2), mm(5.2), mm(5.5)],
        [mm(6.1), mm(0.2), mm(5.2), mm(5.5)],
        [cm(1.1), 0, mm(3.6), mm(3.85)],
        [cm(2.6), -mm(2.65), mm(3.05), mm(3.2)],
        [cm(3.9), -mm(5.8), mm(3.35), mm(3.45)],
        [cm(4.1), -mm(6.1), mm(2.45), mm(2.7)]
    ] as const;

    const guard = new THREE.Mesh(
        toBufferGeometry(loftRings({
            rings: guardShape.map(([x, y, ry, rz]) =>
                guardRing(x, y, ry, rz)),
            smoothingGroup: side => `guard-facet-${side}`
        }), { side: 0, "cap-start": 0, "cap-end": 0 }),
        iron
    );
    guard.name = "HandForgedQuillons";
    dagger.add(guard);

    // Hand-shaped octagonal-ish oak grip: restrained swell in the palm,
    // narrow waist, slightly asymmetrical tool marks in the contour.
    // Not a stack of cylinders, and not a rotationally exact plastic grip.
    function gripRing(
        y: number, width: number, depth: number, phase: number
    ): THREE.Vector3[] {
        return Array.from({ length: 12 }, (_, i) => {
            const a = 2 * Math.PI * i / 12;
            const grain = 1 + 0.012 * Math.sin(3 * a + phase) +
                0.006 * Math.sin(5 * a - phase * 0.6);
            return new THREE.Vector3(
                Math.sin(a) * width * grain,
                y,
                Math.cos(a) * depth * grain
            );
        });
    }

    const gripShape = [
        [mm(11), mm(11.8), mm(10.5), 0.1],
        [mm(17), mm(12.4), mm(10.9), 0.4],
        [mm(31), mm(13.6), mm(11.75), 0.7],
        [mm(49), mm(14.2), mm(12.1), 0.9],
        [mm(67), mm(13.55), mm(11.65), 0.9],
        [mm(86), mm(12.8), mm(11.2), 0.65],
        [mm(101), mm(12.9), mm(11.25), 0.4],
        [mm(112), mm(11.65), mm(10.4), 0.1]
    ] as const;

    const woodGrip = new THREE.Mesh(
        toBufferGeometry(loftRings({
            rings: gripShape.map(([y, w, d, phase]) =>
                gripRing(y, w, d, phase)),
            smoothingGroup: side => `carved-oak-facet-${side}`
        }), { side: 0, "cap-start": 1, "cap-end": 1 }),
        [oak.face, oak.endGrain]
    );
    woodGrip.name = "FacetedOakGrip";
    dagger.add(woodGrip);

    function circularRing(
        y: number, rx: number, rz: number, count = 12
    ): THREE.Vector3[] {
        return Array.from({ length: count }, (_, i) => {
            const angle = i / count * 2 * Math.PI;
            return new THREE.Vector3(
                rx * Math.sin(angle), y, rz * Math.cos(angle)
            );
        });
    }

    const lowerFerrule = new THREE.Mesh(
        toBufferGeometry(loftRings({
            rings: [
                circularRing(mm(5), mm(13.5), mm(12.1)),
                circularRing(mm(7), mm(13.9), mm(12.3)),
                circularRing(mm(12), mm(12.6), mm(11.2)),
                circularRing(mm(14), mm(12.0), mm(10.8))
            ],
            smoothingGroup: side => `ferrule-side-${side}`
        }), { side: 0, "cap-start": 0, "cap-end": 0 }),
        iron
    );
    lowerFerrule.name = "IronGripFerrule";
    dagger.add(lowerFerrule);

    // Modest wheel-like forged pommel, peened over the hidden tang.
    // Its shaped silhouette is entirely physical, not a shading illusion.
    const pommel = new THREE.Mesh(
        toBufferGeometry(loftRings({
            rings: [
                circularRing(mm(109), mm(10.5), mm(9.8)),
                circularRing(mm(114), mm(12.4), mm(11.6)),
                circularRing(mm(119), mm(16.0), mm(14.1)),
                circularRing(mm(124), mm(16.9), mm(14.8)),
                circularRing(mm(129), mm(14.1), mm(12.5)),
                circularRing(mm(132), mm(7.8), mm(7.2))
            ],
            smoothingGroup: side => `pommel-facet-${side}`
        }), { side: 0, "cap-start": 0, "cap-end": 0 }),
        iron
    );
    pommel.name = "PlainIronPommel";
    dagger.add(pommel);

    const peen = new THREE.Mesh(
        toBufferGeometry(cylinderMesh({
            radiusTop: mm(2.85),
            radiusBottom: mm(3.8),
            height: mm(2.4),
            radialSegments: 12
        }), CYLINDER_SURFACES),
        iron
    );
    peen.name = "PeenedTang";
    peen.position.y = mm(132.9);
    dagger.add(peen);

    return dagger;
}
