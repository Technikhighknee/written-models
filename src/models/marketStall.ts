import * as THREE from "three";

import { tableTimberGeometry } from "./components/tableTimberGeometry";
import { oakPlankPanel } from "./components/oakSeating";
import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { oakVariant } from "../materials/wood/oak";
import { wovenCanvas } from "../materials/fabric/wovenCanvas";

const WIDTH = 2.40;
const POST_X = 1.05;
const POST_Z = 0.62;
const ROOF_EDGE_Z = 0.91;
const ROOF_EAVE = 2.24;
const ROOF_RIDGE = 2.675;

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
    seed: number
): void {
    const timber = tableTimberGeometry(start, end, width, depth);
    const wood = oakVariant(seed);
    const mesh = surfaceMesh({
        name,
        geometry: timber.geometry,
        materials: {
            px: wood.face, nx: wood.face,
            py: wood.endGrain, ny: wood.endGrain,
            pz: wood.face, nz: wood.face
        }
    });
    mesh.applyMatrix4(timber.localToParent);
    parent.add(mesh);
}

function buildFrame(stall: THREE.Group): void {
    let piece = 0;
    const timber = (
        name: string, start: THREE.Vector3, end: THREE.Vector3,
        width: number, depth = width
    ) => addTimber(stall, name, start, end,
        width, depth, [1, 3, 5, 7][piece++ % 4]!);

    // Four continuous posts: the awning and the sales counter share a frame.
    for (const x of [-POST_X, POST_X]) {
        for (const z of [-POST_Z, POST_Z]) {
            timber(
                `Upright-${x}-${z}`,
                at(x, 0.045, z), at(x, 2.20, z), 0.095
            );
        }
    }

    // All display boards bear directly on the framing below them.
    for (const z of [-0.16, 0.60]) {
        timber(`CounterBearer-${z}`,
            at(-1.095, 0.866, z), at(1.095, 0.866, z), 0.075, 0.09);
    }
    for (const x of [-0.96, 0.96]) {
        timber(`CounterCrosspiece-${x}`,
            at(x, 0.866, -0.20), at(x, 0.866, 0.66), 0.068);
    }

    for (const z of [-0.38, 0.47]) {
        timber(`LowBearer-${z}`,
            at(-POST_X, 0.294, z), at(POST_X, 0.294, z), 0.075);
    }
    for (const x of [-POST_X, POST_X]) {
        timber(`SideStretcher-${x}`,
            at(x, 0.294, -POST_Z), at(x, 0.294, POST_Z), 0.075);
    }

    // The ridge and rafter pairs genuinely support the pitched canvas.
    for (const z of [-0.77, 0.77]) {
        timber(`EaveRail-${z}`,
            at(-1.18, 2.191, z), at(1.18, 2.191, z), 0.085);
    }
    timber("RidgeBeam",
        at(-1.19, 2.625, 0), at(1.19, 2.625, 0), 0.095);

    for (const x of [-1.05, 0, 1.05]) {
        for (const side of [-1, 1]) {
            timber(`Rafter-${x}-${side}`,
                at(x, 2.191, side * 0.78),
                at(x, 2.625, 0), 0.066);
        }
    }

    for (const x of [-POST_X, POST_X]) {
        for (const z of [-POST_Z, POST_Z]) {
            timber(`CrossKnee-${x}-${z}`,
                at(x, 1.80, z),
                at(x - Math.sign(x) * 0.30, 2.185, z), 0.060);
            timber(`SideKnee-${x}-${z}`,
                at(x, 1.78, z),
                at(x, 2.18, z - Math.sign(z) * 0.28), 0.056);
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

    // Individually cut front planks, rather than a textured box front.
    for (let i = 0; i < 8; i++) {
        const x = -0.941 + i * 0.269;
        addTimber(
            stall, `CounterApronBoard${i + 1}`,
            at(x, 0.51, 0.704),
            at(x, 0.864 - (i % 3 === 0 ? 0.003 : 0), 0.704),
            0.261, 0.028, [5, 3, 7, 1][i % 4]!
        );
    }

    addTimber(stall, "ApronBottomRail",
        at(-1.04, 0.506, 0.682), at(1.04, 0.506, 0.682),
        0.053, 0.052, 5);
}

function roofPoint(x: number, z: number, across: number): THREE.Vector3 {
    const distance = Math.abs(z) / ROOF_EDGE_Z;
    const y = ROOF_RIDGE - (ROOF_RIDGE - ROOF_EAVE) * distance -
        0.024 * Math.sin(Math.PI * distance) -
        0.018 * Math.sin(Math.PI * across) * (0.4 + 0.6 * distance);
    return at(x, y, z);
}

function buildCanopy(stall: THREE.Group): void {
    const canopy = new AuthoredMeshBuilder({ weld: "position" });
    const stripes = 10;
    const left = -WIDTH / 2 - 0.06;
    const span = WIDTH + 0.12;
    const roofStations = [
        ROOF_EDGE_Z, 0.73, 0.48, 0.24, 0,
        -0.24, -0.48, -0.73, -ROOF_EDGE_Z
    ];

    for (let stripe = 0; stripe < stripes; stripe++) {
        const a = left + span * stripe / stripes;
        const b = left + span * (stripe + 1) / stripes;
        const material = stripe % 2 === 0 ? "red" : "linen";
        const rows: number[][] = [];

        for (const z of roofStations) {
            const ids: number[] = [];
            for (const j of [0, 0.5, 1]) {
                ids.push(canopy.addVertex(
                    roofPoint(a + (b - a) * j, z, j)
                ));
            }
            rows.push(ids);
        }

        for (let k = 0; k < rows.length - 1; k++) {
            const z0 = roofStations[k]!;
            const z1 = roofStations[k + 1]!;
            for (let col = 0; col < 2; col++) {
                const x0 = a + (b - a) * col / 2;
                const x1 = a + (b - a) * (col + 1) / 2;
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

        // Cloth panels terminate in actual scalloped front valances.
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
            const upper0 = roofPoint(x0, ROOF_EDGE_Z, from.j);
            const upper1 = roofPoint(x1, ROOF_EDGE_Z, to.j);
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
