import * as THREE from "three";

import { cm, mm } from "../../toolbox/units/length";
import { geometryResult, type GeometryResult } from
    "../../toolbox/geometry/kernel/GeometryResult";
import { layeredGridSolid } from "../../toolbox/geometry/build/layeredGridSolid";
import { loftPairedSurfaceRows, type PairedSurfaceSection } from "../../toolbox/geometry/build/loftPairedSurfaceRows";
import { sampleAdaptiveStations } from "../../toolbox/geometry/topology/adaptiveStations";
import { findFacingPatch } from "../../toolbox/geometry/queries/findFacingPatch";
import {
    tableTimberGeometry,
    tableTimberBetweenSurfaces,
    type TableTimberGeometry
} from "./tableTimberGeometry";

export const CHAIR = {
    seatHeight: cm(46),
    seatThickness: cm(3.8),
    seatWidth: cm(49),
    seatBack: -cm(26.2),
    rearBoardFront: -cm(8.7),
    frontBoardBack: -cm(8.5),
    seatFront: cm(21),
    frontX: cm(18.5),
    frontZ: cm(16),
    rearX: cm(20.5),
    rearFootZ: -cm(17.3),
    rearTopZ: -cm(24.5),
    rearHeight: cm(96),
    frontPostSize: cm(6.2),
    backPostSize: cm(6.6)
} as const;

export const CHAIR_FRONT_SEAT = {
    name: "FrontSeatBoards",
    length: CHAIR.seatWidth,
    depth: CHAIR.seatFront - CHAIR.frontBoardBack,
    thickness: CHAIR.seatThickness,
    planks: 2,
    widthWeights: [1.05, 0.95],
    gap: mm(1.8),
    seed: 412,
    wear: 0.5,
    crown: mm(0.6)
} as const;

export const CHAIR_BACK_INFILL = {
    name: "BackInfill",
    length: cm(32),
    depth: (CHAIR.rearX - CHAIR.backPostSize / 2) * 2 - mm(5),
    thickness: cm(2.5),
    planks: 3,
    widthWeights: [0.96, 1.08, 0.96],
    gap: mm(1.7),
    seed: 625,
    wear: 0.55,
    crown: mm(0.5)
} as const;

export type ChairSide = -1 | 1;

export interface ChairPeg {
    name: string;
    point: THREE.Vector3;
    outward: THREE.Vector3;
    radius: number;
}

export interface ChairFrameGeometry {
    posts: ReadonlyMap<string, TableTimberGeometry>;
    rails: readonly {name: string; timber: TableTimberGeometry}[];
    pegs: readonly ChairPeg[];
}

const underside = CHAIR.seatHeight - CHAIR.seatThickness;
const apronY = underside - cm(8.3) / 2 - mm(2);

export function chairRearZ(height: number): number {
    return CHAIR.rearFootZ +
        (CHAIR.rearTopZ - CHAIR.rearFootZ) *
            height / CHAIR.rearHeight;
}

function support(timber: TableTimberGeometry) {
    return {
        geometry: timber.geometry.geometry,
        localToWorld: timber.localToParent
    };
}

/**
 * A real fitted post-to-post rail uses full finite contact footprints.
 * The roll hint determines which dimensions follow height versus depth.
 */
function fittedRail(
    start: TableTimberGeometry,
    end: TableTimberGeometry,
    first: THREE.Vector3,
    last: THREE.Vector3,
    width: number,
    depth: number,
    roll: THREE.Vector3
): TableTimberGeometry {
    return tableTimberBetweenSurfaces({
        first: {target: support(start), near: first},
        last: {target: support(end), near: last},
        width,
        depth,
        referenceDirection: roll
    });
}

/** All posts, apron rails, stretchers and pinned positions, before shading. */
export function buildChairFrameGeometry(): ChairFrameGeometry {
    const posts = new Map<string, TableTimberGeometry>();
    const rails: {name: string; timber: TableTimberGeometry}[] = [];

    for (const side of [-1, 1] as const) {
        const label = side < 0 ? "Left" : "Right";
        posts.set(`${label}FrontLeg`, tableTimberGeometry(
            new THREE.Vector3(
                side * (CHAIR.frontX + mm(3)),
                0, CHAIR.frontZ + mm(9)
            ),
            new THREE.Vector3(
                side * CHAIR.frontX, underside, CHAIR.frontZ
            ),
            CHAIR.frontPostSize,
            CHAIR.frontPostSize,
            {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, -1, 0)
            }
        ));

        posts.set(`${label}BackStile`, tableTimberGeometry(
            new THREE.Vector3(
                side * CHAIR.rearX, 0, CHAIR.rearFootZ
            ),
            new THREE.Vector3(
                side * CHAIR.rearX, CHAIR.rearHeight, CHAIR.rearTopZ
            ),
            CHAIR.backPostSize,
            CHAIR.backPostSize,
            {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, -1, 0)
            }
        ));
    }

    const frontLeft = posts.get("LeftFrontLeg")!;
    const frontRight = posts.get("RightFrontLeg")!;
    const backLeft = posts.get("LeftBackStile")!;
    const backRight = posts.get("RightBackStile")!;

    function add(
        name: string,
        first: TableTimberGeometry,
        last: TableTimberGeometry,
        firstHint: THREE.Vector3,
        lastHint: THREE.Vector3,
        width: number,
        depth: number,
        roll: THREE.Vector3
    ): void {
        try {
            rails.push({
                name,
                timber: fittedRail(
                    first, last, firstHint, lastHint, width, depth, roll
                )
            });
        } catch (error) {
            throw new Error(`Chair joint ${name} does not fit its supports`, {
                cause: error
            });
        }
    }

    for (const [name, height, width, depth] of [
        ["FrontSeatRail", apronY, cm(8.3), cm(4.2)],
        ["FrontLowStretcher", cm(18), cm(4.4), cm(4.2)]
    ] as const) {
        add(name, frontLeft, frontRight,
            new THREE.Vector3(-CHAIR.frontX, height, CHAIR.frontZ),
            new THREE.Vector3(CHAIR.frontX, height, CHAIR.frontZ),
            width, depth, new THREE.Vector3(0, 1, 0));
    }

    for (const [name, height, width, depth] of [
        ["RearSeatRail", apronY, cm(8.3), cm(4.2)],
        ["RearLowStretcher", cm(18), cm(4.4), cm(4.2)]
    ] as const) {
        add(name, backLeft, backRight,
            new THREE.Vector3(-CHAIR.rearX, height, chairRearZ(height)),
            new THREE.Vector3(CHAIR.rearX, height, chairRearZ(height)),
            width, depth, new THREE.Vector3(0, 1, 0));
    }

    for (const side of [-1, 1] as const) {
        const label = side < 0 ? "Left" : "Right";
        for (const [name, height, depth] of [
            ["SeatApron", apronY, cm(8.3)],
            ["LowerStretcher", cm(18), cm(4.5)]
        ] as const) {
            add(`${label}${name}`,
                posts.get(`${label}FrontLeg`)!,
                posts.get(`${label}BackStile`)!,
                new THREE.Vector3(
                    side * CHAIR.frontX, height, CHAIR.frontZ
                ),
                new THREE.Vector3(
                    side * CHAIR.rearX, height, chairRearZ(height)
                ),
                cm(4.4), depth, new THREE.Vector3(1, 0, 0));
        }
    }

    const backHeight = cm(54);
    add("LowerBackRail", backLeft, backRight,
        new THREE.Vector3(
            -CHAIR.rearX, backHeight,
            chairRearZ(backHeight) + cm(1.1)
        ),
        new THREE.Vector3(
            CHAIR.rearX, backHeight,
            chairRearZ(backHeight) + cm(1.1)
        ),
        cm(5.2), cm(4.1), new THREE.Vector3(
            0, 1,
            (CHAIR.rearTopZ - CHAIR.rearFootZ) / CHAIR.rearHeight
        ));

    const pegs: ChairPeg[] = [];
    for (const side of [-1, 1] as const) {
        const label = side < 0 ? "Left" : "Right";
        const outward = new THREE.Vector3(side, 0, 0);

        function peg(
            name: string, post: TableTimberGeometry,
            y: number, z: number, radius: number
        ): void {
            const patch = findFacingPatch(
                support(post), new THREE.Vector3(0, y, z),
                outward
            );
            const point = patch.contact.point;
            pegs.push({
                name: `${label}${name}Drawpeg`,
                point,
                outward: patch.contact.normal,
                radius
            });
        }

        for (const [name, y] of [
            ["Seat", apronY],
            ["Stretcher", cm(18)]
        ] as const) {
            peg(`Front${name}`,
                posts.get(`${label}FrontLeg`)!,
                y, CHAIR.frontZ, mm(5));
        }

        for (const [name, y, offset] of [
            ["Seat", apronY, 0],
            ["Stretcher", cm(18), 0],
            ["LowerBack", cm(54), cm(1.3)],
            ["Crest", cm(89), cm(1.3)]
        ] as const) {
            peg(`Back${name}`,
                posts.get(`${label}BackStile`)!,
                y, chairRearZ(y) + offset, mm(5.5));
        }
    }

    return {posts, rails, pegs};
}

/** The two post housings follow different top and bottom rake profiles. */
export function buildChairRearSeatGeometry(): GeometryResult {
    const clearance = mm(2.6);
    const half = CHAIR.seatWidth / 2;
    const cheek = CHAIR.rearX - CHAIR.backPostSize / 2 - clearance;
    const frontOfStile = (height: number) =>
        chairRearZ(height) + CHAIR.backPostSize / 2 + clearance;

    // The chair owns its two raked housings. The toolbox only builds
    // the shared, independently positioned upper/lower cell topology.
    const rear = CHAIR.seatBack;
    const front = CHAIR.rearBoardFront;
    const top = frontOfStile(CHAIR.seatHeight);
    const bottom = frontOfStile(underside);
    const columns = [
        -half, -cheek, -cheek / 2, 0, cheek / 2, cheek, half
    ];
    const rows = [
        { upper: rear, lower: rear },
        { upper: top, lower: bottom },
        { upper: front, lower: front }
    ];
    const filled = columns.slice(1).map((_, index) =>
        [index > 0 && index < columns.length - 2, true]
    );
    const thickness = CHAIR.seatThickness;

    return geometryResult(layeredGridSolid({
        columns,
        rows,
        filled,
        upperY: x =>
            thickness / 2 + mm(0.6) * (1 - (x / half) ** 2),
        lowerY: () => -thickness / 2,
        bevel: mm(1.25),
        surfaceAt: side =>
            side === "upper" ? "outer" :
            side === "lower" ? "inner" :
            side === "left" || side === "right" ? "cap-start" :
            "edge-left",
        faceUv: point => new THREE.Vector2(
            point.z - rear, point.x + half
        ),
        wallUv: (point, side) => new THREE.Vector2(
            side === "left" || side === "right"
                ? point.z - rear : point.x + half,
            point.y + thickness / 2
        )
    }));
}

/** One continuous shaped oak crest, with actual worn end corners. */
export function buildChairCrestGeometry(): GeometryResult {
    const length = 2 * (CHAIR.rearX - CHAIR.backPostSize / 2);
    const thickness = cm(3);
    const chamfer = mm(2.4);
    const crown = mm(0.6);
    const startWear = [mm(1.1), mm(1.4)] as const;
    const endWear = [mm(1.6), mm(1.2)] as const;
    const cornerExtent = 0.045;

    const sectionAt = (progress: number): PairedSurfaceSection => {
        const nearStart = Math.max(0, 1 - progress / cornerExtent) ** 2;
        const nearEnd = Math.max(0, 1 - (1 - progress) / cornerExtent) ** 2;
        const left = -cm(4.7) + mm(0.45) * Math.sin(Math.PI * progress) +
            startWear[0] * nearStart + endWear[0] * nearEnd;
        const right = cm(4.8) +
            cm(0.85) * Math.sin(Math.PI * progress) ** 2 -
            startWear[1] * nearStart - endWear[1] * nearEnd;

        const positions = [
            left, left + chamfer, (left + right) / 2,
            right - chamfer, right
        ];
        const last = positions.length - 1;
        const baseX = -length / 2 + length * progress;
        const topY = thickness / 2;
        const bottomY = -thickness / 2;

        return {
            outer: positions.map((z, index) => {
                const across = index / last;
                return new THREE.Vector3(
                    baseX,
                    topY + crown * Math.sin(Math.PI * across) ** 2 -
                        (index === 0 || index === last ? chamfer : 0),
                    z
                );
            }),
            inner: positions.map((z, index) => {
                return new THREE.Vector3(
                    baseX,
                    bottomY + (index === 0 || index === last ? chamfer : 0),
                    z
                );
            })
        };
    };

    const stations = sampleAdaptiveStations(progress => {
        const section = sectionAt(progress);
        return [...section.outer, ...section.inner];
    }, {
        maxDeviation: 0.00045,
        maxDepth: 6,
        knots: [cornerExtent, 1 - cornerExtent]
    }).stations;

    return geometryResult(loftPairedSurfaceRows(stations.map(sectionAt)));
}

/** Preserve the chosen rake and assembly placement of the back infill. */
export function chairBackTransform(): {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
} {
    const rake = (CHAIR.rearTopZ - CHAIR.rearFootZ) /
        CHAIR.rearHeight;
    const upright = new THREE.Vector3(0, 1, rake).normalize();
    const forward = new THREE.Vector3(0, -rake, 1).normalize();
    const across = new THREE.Vector3(1, 0, 0);
    const y = cm(70);

    return {
        position: new THREE.Vector3(
            0, y, chairRearZ(y) + cm(1.35)
        ),
        quaternion: new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(upright, forward, across)
        )
    };
}

export function chairCrestTransform(): {
    position: THREE.Vector3;
    rotationX: number;
} {
    const rake = (CHAIR.rearTopZ - CHAIR.rearFootZ) /
        CHAIR.rearHeight;
    const y = cm(89);

    return {
        position: new THREE.Vector3(
            0, y, chairRearZ(y) + cm(1.35)
        ),
        rotationX: -Math.PI / 2 + Math.atan(rake)
    };
}
