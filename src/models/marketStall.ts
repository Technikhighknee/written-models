import * as THREE from "three";

import { tableTimberGeometry } from "./components/tableTimberGeometry";
import type { ContactNormals } from "../toolbox/geometry/definitions/geometry";
import { oakPlankPanel } from "./components/oakSeating";
import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { cylinderMesh } from "../toolbox/geometry/construction/cylinderMesh";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { oakVariant } from "../materials/wood/oak";
import { wovenCanvas } from "../materials/fabric/wovenCanvas";

const WIDTH = 2.40;
const POST_X = 1.05;
const POST_Z = 0.62;
const POST_SIZE = 0.110;
const INNER_X = POST_X - POST_SIZE / 2;
const INNER_Z = POST_Z - POST_SIZE / 2;

const ROOF_EDGE_Z = 0.91;
const ROOF_EAVE = 2.29;
const ROOF_RIDGE = 2.73;
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

/**
 * A small chamfer on all four long edges makes the timber genuinely
 * dressed, with separate end grain and real authored control faces.
 */
function timberGeometry(length: number, width: number, depth: number) {
    const hx = width / 2;
    const hz = depth / 2;
    const bevel = Math.min(0.004, width * 0.085, depth * 0.085);
    const outline: readonly (readonly [number, number])[] = [
        [-hx + bevel, hz], [hx - bevel, hz],
        [hx, hz - bevel], [hx, -hz + bevel],
        [hx - bevel, -hz], [-hx + bevel, -hz],
        [-hx, -hz + bevel], [-hx, hz - bevel]
    ];
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const lower = outline.map(([x, z]) =>
        builder.addVertex(at(x, -length / 2, z))
    );
    const upper = outline.map(([x, z]) =>
        builder.addVertex(at(x, length / 2, z))
    );
    let perimeter = 0;

    for (let i = 0; i < outline.length; i++) {
        const next = (i + 1) % outline.length;
        const [x0, z0] = outline[i]!;
        const [x1, z1] = outline[next]!;
        const distance = Math.hypot(x1 - x0, z1 - z0);
        builder.addIndexedFace([
            lower[i]!, lower[next]!, upper[next]!, upper[i]!
        ], [
            new THREE.Vector2(perimeter, 0),
            new THREE.Vector2(perimeter + distance, 0),
            new THREE.Vector2(perimeter + distance, length),
            new THREE.Vector2(perimeter, length)
        ], "grain");
        perimeter += distance;
    }

    const bottomCenter = builder.addVertex(at(0, -length / 2, 0));
    const topCenter = builder.addVertex(at(0, length / 2, 0));
    const endUv = (i: number) =>
        new THREE.Vector2(outline[i]![0], outline[i]![1]);

    for (let i = 0; i < outline.length; i++) {
        const next = (i + 1) % outline.length;
        builder.addIndexedFace([
            bottomCenter, lower[next]!, lower[i]!
        ], [
            new THREE.Vector2(0, 0), endUv(next), endUv(i)
        ], "end");
        builder.addIndexedFace([
            topCenter, upper[i]!, upper[next]!
        ], [
            new THREE.Vector2(0, 0), endUv(i), endUv(next)
        ], "end");
    }

    return geometryResult(builder.build());
}

function wood(
    parent: THREE.Group, name: string,
    start: THREE.Vector3, end: THREE.Vector3,
    width: number, depth: number, seed: number,
    contacts?: ContactNormals
): void {
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (!(length > 0)) throw new RangeError("Empty market-stall timber");
    const material = oakVariant(seed);
    const fitted = contacts === undefined
        ? undefined
        : tableTimberGeometry(start, end, width, depth, contacts);
    const geometry = fitted?.geometry ??
        timberGeometry(length, width, depth);
    const mesh = surfaceMesh({
        name,
        geometry,
        materials: fitted ? {
            "side-0": material.face,
            "side-1": material.face,
            "side-2": material.face,
            "side-3": material.face,
            "cap-start": material.endGrain,
            "cap-end": material.endGrain
        } : {
            grain: material.face,
            end: material.endGrain
        }
    });
    if (fitted) {
        mesh.applyMatrix4(fitted.localToParent);
    } else {
        mesh.quaternion.setFromUnitVectors(
            at(0, 1, 0), direction.normalize()
        );
        mesh.position.copy(start).add(end).multiplyScalar(0.5);
    }
    parent.add(mesh);
}

function peg(
    parent: THREE.Group, name: string,
    location: THREE.Vector3, normal: THREE.Vector3
): void {
    const oak = oakVariant(6);
    const mesh = surfaceMesh({
        name,
        geometry: geometryResult(cylinderMesh({
            radiusTop: 0.010,
            radiusBottom: 0.011,
            height: 0.012,
            radialSegments: 9
        })),
        materials: {
            side: oak.face, top: oak.endGrain, bottom: oak.endGrain
        }
    });
    mesh.position.copy(location).addScaledVector(normal, 0.004);
    mesh.quaternion.setFromUnitVectors(at(0, 1, 0), normal);
    parent.add(mesh);
}

function roofHeight(z: number): number {
    const progress = Math.abs(z) / ROOF_EDGE_Z;
    return ROOF_RIDGE - (ROOF_RIDGE - ROOF_EAVE) * progress -
        0.019 * Math.sin(Math.PI * progress);
}

function buildFrame(stall: THREE.Group): void {
    let cut = 0;
    const beam = (
        name: string, start: THREE.Vector3, end: THREE.Vector3,
        width: number, depth = width, contacts?: ContactNormals
    ) => wood(stall, name, start, end, width, depth,
        [1, 3, 5, 7][cut++ % 4]!, contacts);

    // All straight rails terminate precisely at the *faces* of these posts.
    for (const x of [-POST_X, POST_X]) {
        for (const z of [-POST_Z, POST_Z]) {
            beam("Post-" + x + "-" + z,
                at(x, POST_SIZE / 2, z),
                at(x, 2.25, z), POST_SIZE);
        }
    }

    // Tiered framing: the longitudinal rails meet the posts, the joists
    // bear on their top faces, and the boards sit on the joists.
    for (const [name, y, size] of [
        ["Counter", 0.789, 0.098],
        ["Shelf", 0.229, 0.090]
    ] as const) {
        for (const z of [-POST_Z, POST_Z]) {
            beam(name + "-LongRail-" + z,
                at(-INNER_X, y, z), at(INNER_X, y, z),
                size, 0.100);
        }
    }
    for (const [name, y, height, xs] of [
        ["Counter", 0.877, 0.078, [-0.79, 0, 0.79]],
        ["Shelf", 0.313, 0.078, [-0.79, 0, 0.79]]
    ] as const) {
        for (const x of xs) {
            beam(name + "-CrossBearer-" + x,
                at(x, y, -POST_Z), at(x, y, POST_Z),
                0.075, height);
        }
    }

    // A front lower apron rail meets the posts, and its seven boards
    // rest on that rail without disappearing into the counter framework.
    beam("ApronFootRail",
        at(-INNER_X, 0.510, POST_Z),
        at(INNER_X, 0.510, POST_Z), 0.090, 0.110);

    // Long and transverse ties have identical contact heights but no
    // overlapping volumes: each one ends against its supporting post.
    const tieY = 2.200;
    for (const z of [-POST_Z, POST_Z]) {
        beam("LongRoofTie-" + z,
            at(-INNER_X, tieY, z), at(INNER_X, tieY, z),
            0.110, 0.110);
    }
    for (const x of [-POST_X, POST_X]) {
        beam("GableTie-" + x,
            at(x, tieY, -INNER_Z), at(x, tieY, INNER_Z),
            0.110, 0.110);

        // Mitered knee braces: fitted against an inner post face and
        // the exact underside of the roof ties (no buried box ends).
        for (const z of [-POST_Z, POST_Z]) {
            const sx = Math.sign(x);
            const sz = Math.sign(z);
            beam("LongKnee-" + x + "-" + z,
                at(x - sx * POST_SIZE / 2, 1.76, z),
                at(x - sx * 0.32, tieY - 0.055, z),
                0.070, 0.060, {
                    startNormal: at(-sx, 0, 0),
                    endNormal: at(0, -1, 0)
                });
            beam("CrossKnee-" + x + "-" + z,
                at(x, 1.77, z - sz * POST_SIZE / 2),
                at(x, tieY - 0.055, z - sz * 0.30),
                0.066, 0.058, {
                    startNormal: at(0, 0, -sz),
                    endNormal: at(0, -1, 0)
                });
        }
    }

    // The ridge bears on two genuine short vertical supports on the ties.
    const ridgeSize = 0.086;
    const ridgeY = ROOF_RIDGE - 0.070;
    for (const x of [-POST_X, POST_X]) {
        beam("KingPost-" + x,
            at(x, tieY + 0.055 + 0.0375, 0),
            at(x, ridgeY - ridgeSize / 2 - 0.0375, 0), 0.075);
    }
    beam("Ridge",
        at(-1.19, ridgeY, 0), at(1.19, ridgeY, 0),
        ridgeSize);

    // Rails below the rafters bridge the eaves and mid-slope supports.
    // The cloth remains above the dressed timber's upper corners.
    for (const z of [-0.79, -0.43, 0.43, 0.79]) {
        const eave = Math.abs(z) > 0.7;
        const size = eave ? 0.078 : 0.070;
        const y = roofHeight(z) - 0.082 - size / 2;
        beam((eave ? "EavePurlin-" : "SlopePurlin-") + z,
            at(-1.19, y, z), at(1.19, y, z), size, size);
    }
    for (const x of [-POST_X, POST_X]) {
        for (const z of [-0.79, 0.79]) {
            const sz = Math.sign(z);
            const y = roofHeight(z) - 0.082 - 0.078 / 2;
            beam("EaveOutrigger-" + x + "-" + z,
                at(x, y, sz * (POST_Z + POST_SIZE / 2)),
                at(x, y, sz * (0.79 - 0.039)),
                0.054);
        }
    }

    for (const x of [-POST_X, 0, POST_X]) {
        for (const sz of [-1, 1]) {
            beam("Rafter-" + x + "-" + sz,
                at(x, roofHeight(0.085) - 0.048, sz * 0.085),
                at(x, roofHeight(0.79) - 0.048, sz * 0.79),
                0.065, 0.063);
        }
    }

    // Visible draw pegs make the primary joints intelligible from outside.
    for (const x of [-POST_X, POST_X]) {
        for (const z of [-POST_Z, POST_Z]) {
            const outward = at(0, 0, Math.sign(z));
            const face = z + Math.sign(z) * POST_SIZE / 2;
            for (const y of [0.229, 0.789, 1.76, tieY]) {
                peg(stall, "PostPin-" + x + "-" + z + "-" + y,
                    at(x, y, face), outward);
            }
        }
    }
}

function buildCounter(stall: THREE.Group): void {
    // The top face is at 0.940; the undersides touch the joist tops.
    const counter = oakPlankPanel({
        name: "SalesCounter",
        length: 1.90,
        depth: 1.12,
        thickness: 0.048,
        planks: 5,
        seed: 1402,
        gap: 0.003,
        wear: 0.44,
        crown: 0.0006
    });
    counter.position.set(0, 0.940, 0);
    stall.add(counter);

    const shelf = oakPlankPanel({
        name: "StorageShelf",
        length: 1.93,
        depth: 1.06,
        thickness: 0.036,
        planks: 4,
        seed: 823,
        gap: 0.003,
        wear: 0.46
    });
    shelf.position.set(0, 0.370, 0);
    stall.add(shelf);

    // The apron is flush against the front frame, supported by the
    // bottom rail and fastened to the counter runner behind it.
    for (let i = 0; i < 7; i++) {
        const x = -0.81 + i * 0.27;
        wood(stall, "ApronPlank-" + (i + 1),
            at(x, 0.555, POST_Z + 0.055 + 0.014),
            at(x, 0.810 - (i % 3 === 0 ? 0.002 : 0),
                POST_Z + 0.055 + 0.014),
            0.260, 0.028, [5, 3, 7, 1][i % 4]!);
    }
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
