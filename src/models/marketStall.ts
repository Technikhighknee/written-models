import * as THREE from "three";

import {
    tableTimberGeometry,
    tableTimberBetweenSurfaces,
    type TableTimberGeometry
} from "./components/tableTimberGeometry";
import {
    oakPanelGeometry, oakPlank, oakPlankPanel, oakTimberShop
} from "./components/oakSeating";
import { transformGeometry } from "../toolbox/geometry/edit/geometryEdits";
import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { wovenCanvas } from "../materials/fabric/wovenCanvas";

const HALF_WIDTH = 1.05;
const HALF_DEPTH = 0.62;
const POST_SIZE = 0.115;
const POST_HEIGHT = 2.21;
const COUNTER_FRAME_HEIGHT = 0.85;
const RAIL_SIZE = 0.095;
const UPPER_FRAME_HEIGHT = 2.14;
const UPPER_RAIL_SIZE = 0.11;
const BRACE_START_HEIGHT = 1.75;
const FRAME_TOP = COUNTER_FRAME_HEIGHT + RAIL_SIZE / 2;
const COUNTER_DEPTH = 0.66;
const COUNTER_LENGTH = 2 * HALF_WIDTH + POST_SIZE;
const COUNTER_FRONT_BOARD_LENGTH = 1.975;
const COUNTER_APRON_LENGTH = 1.975;
const COUNTER_CENTER_Z = 0.365;
const CANOPY_EDGE_Z = 0.91;
const EAVE_RAIL_Z = 0.845;
const EAVE_RAIL_HEIGHT = 2.13;
const EAVE_RAIL_SIZE = 0.075;
const CANOPY_HALF_WIDTH = 1.22;
const RAFTER_POSITIONS = [-0.96, -0.48, 0, 0.48, 0.96] as const;
const SIDES = [-1, 1] as const;

const point = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z);

export default {
    slug: "market-stall",
    title: "Medieval Market Stall",
    description: "An oak sales counter supported by a fitted frame, open to the merchant behind.",
    category: "architecture" as const,
    create
};

/**
 * Ten sewn, alternating cloth panels. The shared grid uses real authored
 * quads and includes each valance station, so every scallop meets the
 * roof along the same edge instead of forming a T-junction.
 */
function addStripedCanopy(
    stall: THREE.Group,
    ridgeHeight: number,
    ridgeSize: number
): void {
    const mesh = new AuthoredMeshBuilder({ weld: "position" });
    const stitches = new AuthoredMeshBuilder({ weld: "none" });
    const stripeCount = 10;
    const ridgeTop = ridgeHeight + ridgeSize / 2 + 0.020;
    const eaveTop = EAVE_RAIL_HEIGHT + EAVE_RAIL_SIZE / 2 + 0.028;
    const roofOverRail = UPPER_FRAME_HEIGHT + UPPER_RAIL_SIZE / 2 + 0.041;
    const zStations = [
        CANOPY_EDGE_Z, EAVE_RAIL_Z, 0.72, HALF_DEPTH,
        0.48, 0.32, 0.16, ridgeSize / 2, 0,
        -ridgeSize / 2, -0.16, -0.32, -0.48,
        -HALF_DEPTH, -0.72, -EAVE_RAIL_Z, -CANOPY_EDGE_Z
    ];

    function height(x: number, z: number, seam: number): number {
        const distance = Math.abs(z);
        // Cross the ridge on top of the actual timber before the pitched
        // fabric begins; otherwise the sloping cloth cuts through its sides.
        const ridgeEdge = ridgeSize / 2;
        const heightAtSlope = distance <= ridgeEdge
            ? ridgeTop
            : distance <= HALF_DEPTH
                ? THREE.MathUtils.lerp(
                    ridgeTop, roofOverRail,
                    (distance - ridgeEdge) / (HALF_DEPTH - ridgeEdge)
                )
                : THREE.MathUtils.lerp(
                    roofOverRail, eaveTop,
                    (distance - HALF_DEPTH) / (EAVE_RAIL_Z - HALF_DEPTH)
                );
        const base = distance <= EAVE_RAIL_Z
            ? heightAtSlope
            : THREE.MathUtils.lerp(
                eaveTop, eaveTop - 0.014,
                (distance - EAVE_RAIL_Z) /
                    (CANOPY_EDGE_Z - EAVE_RAIL_Z)
            );

        const i = RAFTER_POSITIONS.findIndex((position, index) =>
            index < RAFTER_POSITIONS.length - 1 &&
            x >= position && x <= RAFTER_POSITIONS[index + 1]!
        );
        const betweenRafters = i < 0 ? 0 :
            (x - RAFTER_POSITIONS[i]!) /
            (RAFTER_POSITIONS[i + 1]! - RAFTER_POSITIONS[i]!);
        const rafterSag = 0.006 *
            Math.sin(Math.PI * betweenRafters) ** 2 *
            Math.sin(Math.PI * distance / CANOPY_EDGE_Z) ** 2;
        const panelSag = 0.007 * Math.sin(Math.PI * seam) ** 2 *
            (0.35 + 0.65 * distance / CANOPY_EDGE_Z);

        return base - rafterSag - panelSag;
    }

    const scallops = [0.115, 0.182, 0.198, 0.182, 0.115];
    const left = -CANOPY_HALF_WIDTH;
    const width = 2 * CANOPY_HALF_WIDTH;

    for (let stripe = 0; stripe < stripeCount; stripe++) {
        const x0 = left + width * stripe / stripeCount;
        const x1 = left + width * (stripe + 1) / stripeCount;
        const material = stripe % 2 === 0 ? "red" : "linen";
        const xs = scallops.map((_, col) =>
            THREE.MathUtils.lerp(x0, x1, col / (scallops.length - 1))
        );
        const rows = zStations.map(z => xs.map((x, col) =>
            point(x, height(x, z, col / (xs.length - 1)), z)
        ));

        for (let row = 0; row < rows.length - 1; row++) {
            const z0 = zStations[row]!;
            const z1 = zStations[row + 1]!;
            for (let col = 0; col < xs.length - 1; col++) {
                const a = xs[col]!;
                const b = xs[col + 1]!;
                mesh.addFace([
                    rows[row]![col]!, rows[row]![col + 1]!,
                    rows[row + 1]![col + 1]!,
                    rows[row + 1]![col]!
                ], [
                    new THREE.Vector2(a, z0),
                    new THREE.Vector2(b, z0),
                    new THREE.Vector2(b, z1),
                    new THREE.Vector2(a, z1)
                ], material, "roof-cloth");
            }
        }

        const hem = rows[0]!;
        const lower = xs.map((x, col) =>
            point(
                x,
                hem[col]!.y - scallops[col]!,
                CANOPY_EDGE_Z + 0.035
            )
        );

        for (let col = 0; col < xs.length - 1; col++) {
            mesh.addFace([
                hem[col]!, hem[col + 1]!,
                lower[col + 1]!, lower[col]!
            ], [
                new THREE.Vector2(xs[col]!, CANOPY_EDGE_Z),
                new THREE.Vector2(xs[col + 1]!, CANOPY_EDGE_Z),
                new THREE.Vector2(xs[col + 1]!, CANOPY_EDGE_Z + scallops[col + 1]!),
                new THREE.Vector2(xs[col]!, CANOPY_EDGE_Z + scallops[col]!)
            ], material, "cloth-valance");
        }
    }

    stall.add(surfaceMesh({
        name: "SewnStripedCanvas",
        geometry: geometryResult(mesh.build()),
        materials: {
            red: wovenCanvas("madder-red"),
            linen: wovenCanvas("unbleached")
        }
    }));

    // Short running stitches make the nine panel joins legible without
    // laying another coplanar sheet over the canopy.
    for (let seam = 1; seam < stripeCount; seam++) {
        const x = left + width * seam / stripeCount;
        for (let i = 0; i < 28; i++) {
            if ((i * 7 + seam * 3) % 41 === 0) continue;
            const z0 = -0.86 + i * 0.062 +
                0.0012 * Math.sin(i * 2.1 + seam);
            const z1 = z0 + 0.020 +
                0.002 * Math.sin(i * 1.7 + seam);
            const halfThread = 0.0025;
            const lift = 0.004;
            const threadPoint = (dx: number, z: number) =>
                point(x + dx, height(x + dx, z, 0) + lift, z);

            stitches.addFace([
                threadPoint(-halfThread, z0),
                threadPoint(halfThread, z0),
                threadPoint(halfThread, z1),
                threadPoint(-halfThread, z1)
            ], [
                new THREE.Vector2(x - halfThread, z0),
                new THREE.Vector2(x + halfThread, z0),
                new THREE.Vector2(x + halfThread, z1),
                new THREE.Vector2(x - halfThread, z1)
            ], "thread");
        }
    }

    stall.add(surfaceMesh({
        name: "CanopySeamStitches",
        geometry: geometryResult(stitches.build()),
        materials: wovenCanvas("unbleached")
    }));
}

function create(): THREE.Group {
    const stall = new THREE.Group();
    stall.name = "MedievalMarketStall";

    const workshop = oakTimberShop(3);
    const posts = new Map<string, TableTimberGeometry>();
    const sideRails = new Map<number, TableTimberGeometry>();
    const upperLongRails = new Map<number, TableTimberGeometry>();
    const upperEndRails = new Map<number, TableTimberGeometry>();

    const key = (x: number, z: number) => `${x}:${z}`;
    const postAt = (x: number, z: number) => {
        const post = posts.get(key(x, z));
        if (!post) throw new Error("Market stall post is missing");
        return post;
    };
    const surfaceOf = (member: TableTimberGeometry) => ({
        geometry: member.geometry.geometry,
        localToWorld: member.localToParent
    });

    // Build the supports first. Every rail is fitted to these actual
    // finite faces, rather than independently guessing its endpoints.
    for (const sideX of SIDES) {
        for (const sideZ of SIDES) {
            const x = sideX * HALF_WIDTH;
            const z = sideZ * HALF_DEPTH;
            const post = tableTimberGeometry(
                point(x, 0, z),
                point(x, POST_HEIGHT, z),
                POST_SIZE, POST_SIZE
            );
            posts.set(key(x, z), post);
            stall.add(workshop.timberFromGeometry(
                `Post-${sideX}-${sideZ}`, post
            ));
        }
    }

    function addBetween(
        name: string,
        first: TableTimberGeometry,
        last: TableTimberGeometry,
        from: THREE.Vector3,
        to: THREE.Vector3,
        height: number,
        depth: number,
        referenceDirection = point(0, 1, 0)
    ): TableTimberGeometry {
        const member = tableTimberBetweenSurfaces({
            first: { target: surfaceOf(first), near: from },
            last: { target: surfaceOf(last), near: to },
            width: height,
            depth,
            referenceDirection
        });
        stall.add(workshop.timberFromGeometry(name, member));
        return member;
    }

    function addRail(
        name: string,
        from: readonly [number, number],
        to: readonly [number, number],
        height = COUNTER_FRAME_HEIGHT,
        size = RAIL_SIZE
    ): TableTimberGeometry {
        return addBetween(
            name, postAt(...from), postAt(...to),
            point(from[0], height, from[1]),
            point(to[0], height, to[1]),
            size, size
        );
    }

    // +Z faces customers; -Z is the merchant's entrance.
    // Leave the entire rear span open from the ground upward.
    // The counter occupies only the front part of this U-shaped frame,
    // preserving working space behind the boards.
    const frontBearer = addRail(
        "CounterFrontRail",
        [-HALF_WIDTH, HALF_DEPTH],
        [HALF_WIDTH, HALF_DEPTH]
    );
    for (const sideX of SIDES) {
        const x = sideX * HALF_WIDTH;
        const rail = addRail(
            `CounterEndRail-${sideX}`,
            [x, -HALF_DEPTH],
            [x, HALF_DEPTH]
        );
        sideRails.set(sideX, rail);
    }

    // The upper ring terminates on the actual post faces. None of the
    // four rails passes through a post or through another rail.
    for (const sideZ of SIDES) {
        const z = sideZ * HALF_DEPTH;
        const member = addRail(
            `UpperLongRail-${sideZ}`,
            [-HALF_WIDTH, z],
            [HALF_WIDTH, z],
            UPPER_FRAME_HEIGHT,
            UPPER_RAIL_SIZE
        );
        upperLongRails.set(sideZ, member);
    }
    for (const sideX of SIDES) {
        const x = sideX * HALF_WIDTH;
        const member = addRail(
            `UpperEndRail-${sideX}`,
            [x, -HALF_DEPTH],
            [x, HALF_DEPTH],
            UPPER_FRAME_HEIGHT,
            UPPER_RAIL_SIZE
        );
        upperEndRails.set(sideX, member);
    }

    // Both directions are braced. Each knee is cut against the inner
    // face of its post and the real lower face of the corresponding rail.
    const braceEndHeight = UPPER_FRAME_HEIGHT - UPPER_RAIL_SIZE / 2;
    for (const sideX of SIDES) {
        for (const sideZ of SIDES) {
            const x = sideX * HALF_WIDTH;
            const z = sideZ * HALF_DEPTH;
            const post = postAt(x, z);

            addBetween(
                `LongKnee-${sideX}-${sideZ}`,
                post,
                upperLongRails.get(sideZ)!,
                point(x - sideX * POST_SIZE / 2, BRACE_START_HEIGHT, z),
                point(sideX * 0.70, braceEndHeight, z),
                0.062,
                0.068,
                point(0, 0, 1)
            );
            addBetween(
                `EndKnee-${sideX}-${sideZ}`,
                post,
                upperEndRails.get(sideX)!,
                point(x, BRACE_START_HEIGHT, z - sideZ * POST_SIZE / 2),
                point(x, braceEndHeight, sideZ * 0.27),
                0.062,
                0.068,
                point(1, 0, 0)
            );
        }
    }

    // The ridge bears on the gable ties through two short king posts.
    // All three pieces are constructed from actual support surfaces.
    const ridgeHeight = 2.62;
    const ridgeSize = 0.105;
    const ridge = tableTimberGeometry(
        point(-1.125, ridgeHeight, 0),
        point(1.125, ridgeHeight, 0),
        ridgeSize, ridgeSize
    );
    stall.add(workshop.timberFromGeometry("RidgeBeam", ridge));

    for (const sideX of SIDES) {
        const x = sideX * HALF_WIDTH;
        addBetween(
            `RidgeSupport-${sideX}`,
            upperEndRails.get(sideX)!,
            ridge,
            point(x, UPPER_FRAME_HEIGHT + UPPER_RAIL_SIZE / 2, 0),
            point(x, ridgeHeight - ridgeSize / 2, 0),
            0.075,
            0.075,
            point(1, 0, 0)
        );
    }

    // Every rafter meets the ridge on its side face and bears on the
    // upper long rail's top face. Their actual end cuts follow the
    // contacted surfaces; no beam is sunk into its support.
    for (const x of RAFTER_POSITIONS) {
        for (const sideZ of SIDES) {
            const z = sideZ * HALF_DEPTH;
            addBetween(
                `Rafter-${x}-${sideZ}`,
                ridge,
                upperLongRails.get(sideZ)!,
                point(x, ridgeHeight, sideZ * ridgeSize / 2),
                point(x, UPPER_FRAME_HEIGHT + UPPER_RAIL_SIZE / 2, z),
                0.064,
                0.054,
                point(1, 0, 0)
            );
        }
    }

    // A light eave rail is fixed to each upper long rail with five
    // fitted outriggers. The larger fabric overhang is not left floating.
    for (const sideZ of SIDES) {
        const eaveZ = sideZ * EAVE_RAIL_Z;
        const rail = tableTimberGeometry(
            point(-1.16, EAVE_RAIL_HEIGHT, eaveZ),
            point(1.16, EAVE_RAIL_HEIGHT, eaveZ),
            EAVE_RAIL_SIZE,
            EAVE_RAIL_SIZE
        );
        stall.add(workshop.timberFromGeometry(
            `EaveRail-${sideZ}`, rail
        ));

        for (const x of RAFTER_POSITIONS) {
            addBetween(
                `EaveOutrigger-${x}-${sideZ}`,
                upperLongRails.get(sideZ)!,
                rail,
                point(x, EAVE_RAIL_HEIGHT, sideZ * HALF_DEPTH),
                point(x, EAVE_RAIL_HEIGHT, eaveZ),
                0.053,
                0.052,
                point(0, 1, 0)
            );
        }
    }

    addStripedCanopy(stall, ridgeHeight, ridgeSize);

    // A rear bearer joins the existing side rails; the customer's
    // front bearer is already part of the U-shaped post frame.
    const backZ = 0.115;
    const backHeight = 0.087;
    const backY = FRAME_TOP - backHeight / 2;
    const backBearer = addBetween(
        "CounterRearBearer",
        sideRails.get(-1)!, sideRails.get(1)!,
        point(-HALF_WIDTH, backY, backZ),
        point(HALF_WIDTH, backY, backZ),
        backHeight, 0.075
    );

    // Three joists carry the countertop almost to its end grain.
    // Their upper faces share the same elevation as both supporting rails.
    const joistHeight = 0.079;
    const joistY = FRAME_TOP - joistHeight / 2;
    for (const x of [-0.83, 0, 0.83]) {
        addBetween(
            `CounterJoist-${x}`,
            backBearer, frontBearer,
            point(x, joistY, backZ),
            point(x, joistY, HALF_DEPTH),
            joistHeight, 0.075
        );
    }

    const boards = oakPanelGeometry({
        name: "SalesCounterBoards",
        length: COUNTER_LENGTH,
        depth: COUNTER_DEPTH,
        thickness: 0.044,
        planks: 5,
        widthWeights: [1.07, 0.94, 1.03, 0.96, 1.17],
        seed: 1402,
        gap: 0.003,
        wear: 0.50,
        crown: 0.00055
    });
    const planks = new THREE.Group();
    planks.name = "SalesCounterBoards";

    boards.forEach((board, index) => {
        const geometry = index === 4
            ? transformGeometry(
                board,
                new THREE.Matrix4().makeScale(
                    COUNTER_FRONT_BOARD_LENGTH / COUNTER_LENGTH, 1, 1
                )
            )
            : board;
        const seed = (1402 + index * 3 + 2) % 8;
        const tone = 0.96 + 0.012 * ((1402 + index * 5) % 5);
        planks.add(oakPlank(
            `SalesCounterBoard${index + 1}`, geometry, seed, tone
        ));
    });

    planks.position.set(0, FRAME_TOP + 0.044 / 2, COUNTER_CENTER_Z);
    stall.add(planks);

    // A single vertical apron closes the otherwise exposed front framing.
    // Its rear face meets the front rail; the counter overhangs it toward
    // the customer. It terminates short of the post faces, like the top.
    const apronHeight = 0.15;
    const apronThickness = 0.028;
    // Dowels secure the visible rail ends close to their post joints.
    // Their heads sit proud of the timber faces, not on the canvas.
    for (const sideX of SIDES) {
        const x = sideX * (HALF_WIDTH - POST_SIZE / 2 - 0.075);
        for (const sideZ of SIDES) {
            const z = sideZ * HALF_DEPTH;
            stall.add(workshop.peg(
                `UpperLongDowel-${sideX}-${sideZ}`,
                point(x, UPPER_FRAME_HEIGHT, z + sideZ * UPPER_RAIL_SIZE / 2),
                point(0, 0, sideZ)
            ));
        }
    }

    for (const sideX of SIDES) {
        const x = sideX * (HALF_WIDTH + UPPER_RAIL_SIZE / 2);
        for (const sideZ of SIDES) {
            const z = sideZ * (HALF_DEPTH - POST_SIZE / 2 - 0.075);
            stall.add(workshop.peg(
                `UpperEndDowel-${sideX}-${sideZ}`,
                point(x, UPPER_FRAME_HEIGHT, z),
                point(sideX, 0, 0)
            ));
        }
    }

    for (const sideX of SIDES) {
        const x = sideX * (HALF_WIDTH - POST_SIZE / 2 - 0.075);
        stall.add(workshop.peg(
            `CounterFrontDowel-${sideX}`,
            point(x, COUNTER_FRAME_HEIGHT, HALF_DEPTH + RAIL_SIZE / 2),
            point(0, 0, 1)
        ));
    }
    for (const sideX of SIDES) {
        const x = sideX * (HALF_WIDTH + RAIL_SIZE / 2);
        for (const sideZ of SIDES) {
            const z = sideZ * (HALF_DEPTH - POST_SIZE / 2 - 0.075);
            stall.add(workshop.peg(
                `CounterSideDowel-${sideX}-${sideZ}`,
                point(x, COUNTER_FRAME_HEIGHT, z),
                point(sideX, 0, 0)
            ));
        }
    }

    // Three enclosed sides below the counter, with the merchant's back
    // opening left clear. The vertical oak boards remain separate pieces.
    // Low rails connect the posts behind them; the boards stop short of
    // the established apron and counter rails.
    const lowerWallRailHeight = 0.135;
    const lowerWallRailSize = 0.043;
    addBetween(
        "LowerFrontRail",
        postAt(-HALF_WIDTH, HALF_DEPTH),
        postAt(HALF_WIDTH, HALF_DEPTH),
        point(-HALF_WIDTH, lowerWallRailHeight, HALF_DEPTH),
        point(HALF_WIDTH, lowerWallRailHeight, HALF_DEPTH),
        lowerWallRailSize, lowerWallRailSize
    );
    for (const sideX of SIDES) {
        const x = sideX * HALF_WIDTH;
        addBetween(
            `LowerSideRail-${sideX}`,
            postAt(x, -HALF_DEPTH),
            postAt(x, HALF_DEPTH),
            point(x, lowerWallRailHeight, -HALF_DEPTH),
            point(x, lowerWallRailHeight, HALF_DEPTH),
            lowerWallRailSize, lowerWallRailSize
        );
    }

    const wallBottom = 0.035;
    const frontWallTop = FRAME_TOP - apronHeight - 0.003;
    const frontBoards = oakPlankPanel({
        name: "LowerFrontBoards",
        length: frontWallTop - wallBottom,
        depth: 2 * (HALF_WIDTH - POST_SIZE / 2) - 0.012,
        thickness: 0.024,
        planks: 9,
        widthWeights: [0.94, 1.07, 0.97, 1.03, 1.09, 0.93, 1.04, 1.02, 0.95],
        seed: 638,
        gap: 0.0025,
        wear: 0,
        crown: 0.00045
    });
    // The panel's original long X axis is vertical, its across-plank Z
    // axis spans the opening, and its thickness points toward customers.
    frontBoards.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
            point(0, 1, 0),
            point(0, 0, 1),
            point(1, 0, 0)
        )
    );
    frontBoards.position.set(
        0,
        (wallBottom + frontWallTop) / 2,
        HALF_DEPTH + lowerWallRailSize / 2 + 0.001 + 0.012
    );
    stall.add(frontBoards);

    const sideWallTop = COUNTER_FRAME_HEIGHT - RAIL_SIZE / 2 - 0.004;
    for (const sideX of SIDES) {
        const sideBoards = oakPlankPanel({
            name: `LowerSideBoards-${sideX}`,
            length: sideWallTop - wallBottom,
            depth: 2 * (HALF_DEPTH - POST_SIZE / 2) - 0.012,
            thickness: 0.024,
            planks: 5,
            widthWeights: [1.04, 0.92, 1.09, 0.98, 1.03],
            seed: sideX === -1 ? 271 : 714,
            gap: 0.0025,
            wear: 0,
            crown: 0.00045
        });
        // Rotating X up preserves the planks' vertical grain; Z runs
        // between the rear and front posts.
        sideBoards.rotation.z = Math.PI / 2;
        sideBoards.position.set(
            sideX * (
                HALF_WIDTH + lowerWallRailSize / 2 + 0.001 + 0.012
            ),
            (wallBottom + sideWallTop) / 2,
            0
        );
        stall.add(sideBoards);
    }

    const apron = oakPlankPanel({
        name: "CounterFrontApron",
        length: COUNTER_APRON_LENGTH,
        depth: apronHeight,
        thickness: apronThickness,
        planks: 1,
        seed: 321,
        gap: 0,
        wear: 0.25,
        crown: 0.0003
    });
    apron.rotation.x = Math.PI / 2;
    apron.position.set(
        0,
        FRAME_TOP - apronHeight / 2,
        HALF_DEPTH + RAIL_SIZE / 2 + apronThickness / 2
    );
    stall.add(apron);

    return stall;
}
