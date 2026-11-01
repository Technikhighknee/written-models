import * as THREE from "three";

import { tableTimberGeometry } from "./components/tableTimberGeometry";
import type { ContactNormals } from "../toolbox/geometry/definitions/geometry";
import { oakPlankPanel } from "./components/oakSeating";
import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { oakVariant } from "../materials/wood/oak";
import { wovenCanvas } from "../materials/fabric/wovenCanvas";

const WIDTH = 2.40;
const POST_X = 1.05;
const POST_Z = 0.62;
const POST_SIZE = 0.095;
const INNER_X = POST_X - POST_SIZE / 2;
const INNER_Z = POST_Z - POST_SIZE / 2;

const ROOF_EDGE_Z = 0.91;
const ROOF_RIDGE = 2.73;
const ROOF_EAVE = 2.29;
const STRIPES = 10;
const CANVAS_LEFT = -WIDTH / 2 - 0.06;
const CANVAS_WIDTH = WIDTH + 0.12;

const at = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z);

export default {
    slug: "market-stall",
    title: "Medieval Market Stall",
    description: "An open oak merchant's stand beneath a striped canvas awning.",
    category: "architecture" as const,
    create
};

function addTimber(
    parent: THREE.Group,
    name: string,
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    depth: number,
    seed: number,
    contacts?: ContactNormals
): void {
    const timber = tableTimberGeometry(start, end, width, depth, contacts);
    const wood = oakVariant(seed);
    const mesh = surfaceMesh({
        name,
        geometry: timber.geometry,
        materials: timber.fitted
            ? {
                "side-0": wood.face, "side-1": wood.face,
                "side-2": wood.face, "side-3": wood.face,
                "cap-start": wood.endGrain, "cap-end": wood.endGrain
            }
            : {
                px: wood.face, nx: wood.face,
                py: wood.endGrain, ny: wood.endGrain,
                pz: wood.face, nz: wood.face
            }
    });
    mesh.applyMatrix4(timber.localToParent);
    parent.add(mesh);
}

function roofHeight(z: number): number {
    const progress = Math.abs(z) / ROOF_EDGE_Z;
    return ROOF_RIDGE - (ROOF_RIDGE - ROOF_EAVE) * progress -
        0.019 * Math.sin(Math.PI * progress);
}

function buildFrame(stall: THREE.Group): void {
    let piece = 0;
    const timber = (
        name: string, start: THREE.Vector3, end: THREE.Vector3,
        width: number, depth = width, contacts?: ContactNormals
    ) => addTimber(stall, name, start, end,
        width, depth, [1, 3, 5, 7][piece++ % 4]!, contacts);

    for (const x of [-POST_X, POST_X]) {
        for (const z of [-POST_Z, POST_Z]) {
            timber(`Upright-${x}-${z}`,
                at(x, 0.045, z), at(x, 2.255, z), POST_SIZE);
        }
    }

    // The sale counter has a closed, face-to-face bearing frame:
    // the back edge and both sides have real support under the planks.
    const counterY = 0.870;
    for (const x of [-POST_X, POST_X]) {
        timber(`CounterSide-${x}`,
            at(x, counterY, -INNER_Z),
            at(x, counterY, INNER_Z), POST_SIZE, 0.064);
    }
    for (const z of [-0.14, POST_Z]) {
        timber(`CounterLongRail-${z}`,
            at(-INNER_X, counterY, z),
            at(INNER_X, counterY, z), 0.064, 0.09);
    }
    for (const x of [-0.76, 0, 0.76]) {
        timber(`CounterJoist-${x}`,
            at(x, counterY, -0.095),
            at(x, counterY, 0.575), 0.060, 0.064);
    }

    // Shelf bearers sit *inside* the actual shelf footprint, at the
    // exact underside of its boards. Side rails meet the post faces.
    const shelfY = 0.287;
    for (const x of [-POST_X, POST_X]) {
        timber(`ShelfSide-${x}`,
            at(x, shelfY, -INNER_Z),
            at(x, shelfY, INNER_Z), POST_SIZE, 0.082);
    }
    for (const z of [-0.28, 0.35]) {
        timber(`ShelfBearer-${z}`,
            at(-INNER_X, shelfY, z),
            at(INNER_X, shelfY, z), 0.082, 0.08);
    }

    // The two side lintels and the gable ties meet the inner post faces.
    // Braces terminate at their underside, not at the beam centres.
    const lintelY = 2.14;
    for (const z of [-POST_Z, POST_Z]) {
        timber(`LongLintel-${z}`,
            at(-INNER_X, lintelY, z),
            at(INNER_X, lintelY, z), 0.100, 0.090);
    }
    for (const x of [-POST_X, POST_X]) {
        timber(`GableTie-${x}`,
            at(x, lintelY, -INNER_Z),
            at(x, lintelY, INNER_Z), POST_SIZE, 0.100);
        for (const z of [-POST_Z, POST_Z]) {
            timber(`LongKnee-${x}-${z}`,
                at(x - Math.sign(x) * POST_SIZE / 2, 1.76, z),
                at(x - Math.sign(x) * 0.31, 2.09, z),
                0.053, 0.053, {
                    startNormal: at(-Math.sign(x), 0, 0),
                    endNormal: at(0, -1, 0)
                });
            timber(`CrossKnee-${x}-${z}`,
                at(x, 1.76, z - Math.sign(z) * POST_SIZE / 2),
                at(x, 2.09, z - Math.sign(z) * 0.26),
                0.050, 0.050, {
                    startNormal: at(0, 0, -Math.sign(z)),
                    endNormal: at(0, -1, 0)
                });
        }
    }

    // A short king post on each gable carries the ridge beam.
    const ridgeBeamY = roofHeight(0) - 0.088;
    const ridgeBeamSize = 0.095;
    for (const x of [-POST_X, POST_X]) {
        timber(`KingPost-${x}`,
            at(x, lintelY + 0.05, 0),
            at(x, ridgeBeamY - ridgeBeamSize / 2, 0),
            0.070);
    }
    timber("RidgeBeam",
        at(-1.19, ridgeBeamY, 0),
        at(1.19, ridgeBeamY, 0),
        ridgeBeamSize);

    // Short outriggers meet the eave rails without passing through them.
    const eaveZ = 0.79;
    const eaveY = roofHeight(eaveZ) - 0.09;
    for (const side of [-1, 1]) {
        timber(`EaveRail-${side}`,
            at(-1.19, eaveY, side * eaveZ),
            at(1.19, eaveY, side * eaveZ), 0.075, 0.080);
        for (const x of [-POST_X, POST_X]) {
            timber(`Outrigger-${x}-${side}`,
                at(x, eaveY, side * (POST_Z + POST_SIZE / 2)),
                at(x, eaveY, side * (eaveZ - 0.040)), 0.065);
        }
    }

    // Rafters have their ends beside the ridge and over the eave rails.
    // Their top edges stay below the actual fabric roof everywhere.
    for (const x of [-POST_X, 0, POST_X]) {
        for (const side of [-1, 1]) {
            timber(`Rafter-${x}-${side}`,
                at(x, roofHeight(0.075) - 0.078, side * 0.075),
                at(x, roofHeight(0.79) - 0.078, side * 0.79),
                0.064);
        }
    }
}

function buildCounter(stall: THREE.Group): void {
    const top = oakPlankPanel({
        name: "CounterBoards",
        length: 2.20,
        depth: 0.88,
        thickness: 0.046,
        planks: 5,
        seed: 1402,
        gap: 0.003,
        wear: 0.52,
        crown: 0.0007
    });
    top.position.set(0, 0.925, 0.25);
    stall.add(top);

    const shelf = oakPlankPanel({
        name: "LowerShelf",
        length: 1.94,
        depth: 0.76,
        thickness: 0.034,
        planks: 4,
        seed: 823,
        gap: 0.004,
        wear: 0.68
    });
    shelf.position.set(0, 0.345, 0.035);
    stall.add(shelf);

    // The apron butts against the front bearer, with a lower retaining
    // rail at its base. Its seven boards fit between the front uprights.
    const apronBack = POST_Z + 0.045;
    const apronDepth = 0.028;
    const apronCenter = apronBack + apronDepth / 2;
    for (let i = 0; i < 7; i++) {
        const x = -0.84 + i * 0.28;
        addTimber(stall, `ApronBoard${i + 1}`,
            at(x, 0.525, apronCenter),
            at(x, 0.838 - (i % 3 === 0 ? 0.003 : 0), apronCenter),
            0.27, apronDepth, [5, 3, 7, 1][i % 4]!);
    }
    addTimber(stall, "ApronBottomRail",
        at(-INNER_X, 0.50, POST_Z),
        at(INNER_X, 0.50, POST_Z), 0.05, 0.09, 5);
}

function roofPoint(x: number, z: number): THREE.Vector3 {
    const stripePosition = (x - CANVAS_LEFT) /
        (CANVAS_WIDTH / STRIPES);
    const sag = 0.012 * Math.sin(Math.PI * stripePosition) ** 2;
    return at(x, roofHeight(z) - sag, z);
}

function buildCanopy(stall: THREE.Group): void {
    const canopy = new AuthoredMeshBuilder({ weld: "position" });
    const left = CANVAS_LEFT;
    const span = CANVAS_WIDTH;
    const roofStations = [
        ROOF_EDGE_Z, 0.73, 0.48, 0.24, 0,
        -0.24, -0.48, -0.73, -ROOF_EDGE_Z
    ];

    for (let stripe = 0; stripe < STRIPES; stripe++) {
        const a = left + span * stripe / STRIPES;
        const b = left + span * (stripe + 1) / STRIPES;
        const material = stripe % 2 === 0 ? "red" : "linen";
        const rows: number[][] = [];

        for (const z of roofStations) {
            const ids: number[] = [];
            for (const j of [0, 0.25, 0.5, 0.75, 1]) {
                ids.push(canopy.addVertex(
                    roofPoint(a + (b - a) * j, z)
                ));
            }
            rows.push(ids);
        }

        for (let k = 0; k < rows.length - 1; k++) {
            const z0 = roofStations[k]!;
            const z1 = roofStations[k + 1]!;
            for (let col = 0; col < 4; col++) {
                const x0 = a + (b - a) * col / 4;
                const x1 = a + (b - a) * (col + 1) / 4;
                canopy.addIndexedFace([
                    rows[k]![col]!, rows[k]![col + 1]!,
                    rows[k + 1]![col + 1]!, rows[k + 1]![col]!
                ], [
                    new THREE.Vector2(x0, z0),
                    new THREE.Vector2(x1, z0),
                    new THREE.Vector2(x1, z1),
                    new THREE.Vector2(x0, z1)
                ], material, "cloth-roof");
            }
        }

        const scallop = [
            { j: 0, drop: 0.115 },
            { j: 0.25, drop: 0.182 },
            { j: 0.5, drop: 0.198 },
            { j: 0.75, drop: 0.182 },
            { j: 1, drop: 0.115 }
        ];
        for (let col = 0; col < scallop.length - 1; col++) {
            const from = scallop[col]!;
            const to = scallop[col + 1]!;
            const x0 = a + (b - a) * from.j;
            const x1 = a + (b - a) * to.j;
            const upper0 = roofPoint(x0, ROOF_EDGE_Z);
            const upper1 = roofPoint(x1, ROOF_EDGE_Z);
            const bottom0 = at(x0, upper0.y - from.drop, 0.947);
            const bottom1 = at(x1, upper1.y - to.drop, 0.947);

            canopy.addFace([
                upper0, upper1, bottom1, bottom0
            ], [
                new THREE.Vector2(x0, ROOF_EDGE_Z),
                new THREE.Vector2(x1, ROOF_EDGE_Z),
                new THREE.Vector2(x1, ROOF_EDGE_Z + to.drop),
                new THREE.Vector2(x0, ROOF_EDGE_Z + from.drop)
            ], material, "cloth-valance");
        }
    }

    stall.add(surfaceMesh({
        name: "SewnStripedCanvas",
        geometry: geometryResult(canopy.build()),
        materials: {
            red: wovenCanvas("madder-red"),
            linen: wovenCanvas("unbleached")
        }
    }));
}

function create(): THREE.Group {
    const stall = new THREE.Group();
    stall.name = "MedievalMarketStall";

    buildFrame(stall);
    buildCounter(stall);
    buildCanopy(stall);

    return stall;
}
