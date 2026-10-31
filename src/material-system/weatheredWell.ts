import {
    PaintedSurface, assemblePaintedAtlas, seededRandom,
    type PaintedAtlas, type RasterSample
} from "./paint";
import {
    layeredField, periodicField, smoothRange
} from "./pigmentFields";

type Rgb = readonly [number, number, number];

interface Stain {
    x: number;
    y: number;
    rx: number;
    ry: number;
    tint: number;
}

interface Stone {
    left: number;
    right: number;
    seed: number;
    base: Rgb;
    shade: number;
    chips: readonly [number, number, number, number];
    stains: readonly Stain[];
    crack?: readonly (readonly [number, number])[];
}

interface Course {
    start: number;
    end: number;
    shift: number;
    stones: readonly Stone[];
}

const TAU = Math.PI * 2;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const WALL_COLORS: readonly Rgb[] = [
    [105, 90, 75], [119, 99, 80], [97, 86, 77],
    [126, 105, 86], [108, 91, 76], [93, 82, 72],
    [116, 98, 81], [101, 87, 76], [131, 108, 87]
];

const RIM_COLORS: readonly Rgb[] = [
    [118, 101, 87], [139, 114, 94], [107, 95, 86],
    [123, 101, 86], [105, 92, 78], [130, 108, 91]
];

function course(
    count: number, seed: number, start: number, end: number,
    shift: number, palette: readonly Rgb[]
): Course {
    const random = seededRandom(seed);
    const weights = Array.from({ length: count },
        () => 0.70 + random() * 0.66);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let position = 0;
    const stones: Stone[] = [];

    for (let i = 0; i < count; i++) {
        const left = position;
        position += weights[i]! / total;
        const right = i === count - 1 ? 1 : position;
        const stoneSeed = Math.floor(random() * 100000000);
        const stains: Stain[] = [];
        const countStains = 2 + Math.floor(random() * 4);

        for (let j = 0; j < countStains; j++) {
            stains.push({
                x: -0.15 + random() * 1.3,
                y: -0.1 + random() * 1.2,
                rx: 0.14 + random() * 0.43,
                ry: 0.13 + random() * 0.39,
                tint: (random() - 0.56) * 39
            });
        }

        let crack: readonly (readonly [number, number])[] | undefined;
        if (random() > 0.73) {
            const x = 0.2 + random() * 0.6;
            crack = [
                [x, -0.03],
                [x + (random() - 0.5) * 0.22, 0.19],
                [x + (random() - 0.5) * 0.30, 0.37],
                [x + (random() - 0.5) * 0.20, 0.57]
            ];
        }

        stones.push({
            left, right, seed: stoneSeed,
            base: palette[Math.floor(random() * palette.length)]!,
            shade: (random() - 0.52) * 28,
            chips: [
                0.009 + random() ** 2 * 0.032,
                0.009 + random() ** 2 * 0.038,
                0.009 + random() ** 2 * 0.029,
                0.009 + random() ** 2 * 0.036
            ],
            stains,
            ...(crack ? { crack } : {})
        });
    }

    return { start, end, shift, stones };
}

function findStone(course: Course, u: number): {
    stone: Stone;
    x: number;
    local: number;
} {
    const x = (u - course.shift + 2) % 1;
    const stone = course.stones.find(s => x >= s.left && x < s.right)
        ?? course.stones.at(-1)!;
    return {
        stone, x,
        local: (x - stone.left) / (stone.right - stone.left)
    };
}

function crackDistance(
    x: number, y: number,
    path: readonly (readonly [number, number])[]
): number {
    let closest = 1;
    for (let i = 0; i < path.length - 1; i++) {
        const [ax, ay] = path[i]!;
        const [bx, by] = path[i + 1]!;
        const dx = bx - ax;
        const dy = by - ay;
        const t = clamp(((x - ax) * dx + (y - ay) * dy) /
            (dx * dx + dy * dy));
        closest = Math.min(closest, Math.hypot(
            x - (ax + t * dx), y - (ay + t * dy)
        ));
    }
    return closest;
}

interface SurfaceContext {
    seed: number;
    circumference: number;
    height: number;
    inside?: boolean;
    rim?: boolean;
}

function stonePixel(
    u: number, v: number,
    course: Course,
    context: SurfaceContext
): RasterSample {
    const { stone, x, local } = findStone(course, u);
    const rowV = clamp((v - course.start) / (course.end - course.start));
    const global = layeredField(u, v, context.seed);
    const coarse = periodicField(u, v, 11, 7, stone.seed);
    const granular = periodicField(u, v, 73, 48, stone.seed + 19);
    const pores = periodicField(u, v, 231, 156, stone.seed + 32);
    const pitting = periodicField(u, v, 139, 113, stone.seed + 47);
    const warp = periodicField(u, v, 32, 17, stone.seed + 73);

    // Seams are measured in metres. Small changes in the boundary position
    // make the joint follow the actual worn stone, rather than a straight grid.
    const xWarp = coarse * 0.0065 + granular * 0.0025 +
        periodicField(u, v, 13, 23, stone.seed + 91) * 0.004;
    const yWarp = global * 0.005 + granular * 0.002 +
        periodicField(u, v, 31, 17, stone.seed + 92) * 0.0025;
    const toLeft = (x - stone.left) * context.circumference + xWarp;
    const toRight = (stone.right - x) * context.circumference - xWarp;
    const toTop = (v - course.start) * context.height + yWarp;
    const toBottom = (course.end - v) * context.height - yWarp;
    const cornerWear = Math.max(
        stone.chips[0] - Math.hypot(toLeft, toTop),
        stone.chips[1] - Math.hypot(toRight, toTop),
        stone.chips[2] - Math.hypot(toLeft, toBottom),
        stone.chips[3] - Math.hypot(toRight, toBottom),
        0
    );
    const distance = Math.min(toLeft, toRight, toTop, toBottom) +
        0.0025 * warp - cornerWear;
    const mortarWidth = 0.0026 + (granular + 1) * 0.0018;
    const joint = smoothRange(mortarWidth, mortarWidth + 0.007, distance);
    const edge = smoothRange(0.002, 0.022, distance);
    const exposed = smoothRange(0.004, 0.038, distance);

    // Large stains belong to individual stones. The warped contours have
    // neither the repeated shape nor the independent scatter of ellipse stamps.
    let stain = 0;
    for (const patch of stone.stains) {
        const dx = (local - patch.x + coarse * 0.065) / patch.rx;
        const dy = (rowV - patch.y + global * 0.085) / patch.ry;
        const shape = Math.hypot(dx, dy) + granular * 0.16;
        stain += patch.tint * (1 - smoothRange(0.42, 1.15, shape));
    }

    const crust = smoothRange(0.06, 0.32,
        global * 0.8 + coarse * 0.9 + granular * 0.3);
    const paleMineral = smoothRange(0.18, 0.51,
        -coarse * 0.5 + granular * 0.8 + pores * 0.3);
    const weather = global * 18 + coarse * 16 + granular * 11 +
        pores * 3.5 + stain + stone.shade - 15 * crust +
        9 * paleMineral;
    const warm = (coarse - global) * 3.5;
    const age = context.inside ? 0.83 : 1;
    const borderShadow = (1 - exposed) * 17;
    const fissureShadow = (1 - edge) * 13;

    let red = stone.base[0] * age + weather + warm -
        borderShadow - fissureShadow;
    let green = stone.base[1] * age + weather * 0.89 -
        borderShadow - fissureShadow;
    let blue = stone.base[2] * age + weather * 0.78 - warm * 0.4 -
        borderShadow - fissureShadow;

    // Mineral flecks and wear reveal lighter stone near the high edges.
    const mineral = smoothRange(0.35, 0.75, granular + pores * 0.45);
    const wornEdge = (1 - exposed) *
        smoothRange(-0.10, 0.32, global + granular * 0.4);
    const highlight = 7 * mineral + 11 * wornEdge;
    red += highlight;
    green += highlight * 0.94;
    blue += highlight * 0.80;

    // Irregular fine fissures occur only on selected stones.
    let fracture = 0;
    if (stone.crack) {
        const d = crackDistance(local, rowV, stone.crack);
        fracture = 1 - smoothRange(0.004, 0.024, d + granular * 0.006);
        fracture *= smoothRange(0.04, 0.21, rowV) *
            (1 - smoothRange(0.52, 0.70, rowV));
        red -= 28 * fracture;
        green -= 25 * fracture;
        blue -= 21 * fracture;
    }

    // Local moisture finds cavities. Moss grows in patches around wet joints
    // and the bottom, not as randomly scattered bright green dots.
    const moisture = clamp((context.inside ? 0.42 : 0.12) +
        smoothRange(0.45, 0.98, v) * (context.rim ? 0.05 : 0.48));
    const porous = smoothRange(-0.13, 0.40,
        periodicField(u, v, 28, 18, context.seed + 123) +
        0.4 * periodicField(u, v, 67, 39, context.seed + 129));
    const crevice = 1 - smoothRange(0.002, 0.029, distance);
    const moss = moisture * porous * crevice *
        (0.35 + 0.65 * smoothRange(-0.25, 0.42, global));

    const darkening = moisture * (2.5 + porous * 9);
    red -= darkening + 27 * moss;
    green -= darkening * 0.78 + 12 * moss;
    blue -= darkening * 0.68 + 26 * moss;

    // Dark mortar is dirty brown, never pure black. Its diffuse tone still
    // varies with mineral deposits and accumulated soil.
    const mortarTone = (1 - exposed) * 8 +
        periodicField(u, v, 43, 31, context.seed + 235) * 7;
    const mortar: Rgb = [
        54 + mortarTone, 47 + mortarTone * 0.87,
        40 + mortarTone * 0.77
    ];
    red = mix(mortar[0], red, joint);
    green = mix(mortar[1], green, joint);
    blue = mix(mortar[2], blue, joint);

    const physicalRelief = 0.0005 * global +
        0.0008 * coarse + 0.0005 * granular +
        0.00028 * pores - 0.0006 * Math.max(0, pitting) -
        0.005 * (1 - exposed) - 0.006 * (1 - joint) -
        fracture * 0.0015 + moss * 0.0008;
    const roughness = clamp(
        0.92 + 0.045 * pores + 0.028 * granular +
        0.04 * moss - 0.06 * moisture
    );

    return {
        color: [red, green, blue],
        roughness,
        height: physicalRelief
    };
}

function masonryPanel(
    width: number, height: number,
    metresWide: number, metresHigh: number,
    seed: number, rows: readonly Course[],
    inside = false, rim = false
): PaintedSurface {
    const surface = new PaintedSurface(
        width, height, metresWide, metresHigh, "#756a5b", 0.95, true
    );
    surface.raster((u, v) => {
        const selected = rows.find(row => v < row.end) ?? rows.at(-1)!;
        return stonePixel(u, v, selected, {
            seed, circumference: metresWide,
            height: metresHigh, inside, rim
        });
    });
    return surface;
}

function waterPanel(): PaintedSurface {
    const panel = new PaintedSurface(
        384, 384, 0.946, 0.946, "#396176", 0.31
    );
    panel.raster((u, v) => {
        const x = u - 0.5;
        const y = v - 0.5;
        const radius = Math.hypot(x, y);
        const drift = layeredField(u, v, 200);
        const flow = periodicField(u + drift * 0.033, v, 9, 6, 407);
        const detail = periodicField(u, v, 26, 19, 523);
        const ripples = Math.sin(
            (u * 7.2 + v * 2.1 + flow * 0.48 + drift * 0.25) * TAU
        ) * 0.5 + 0.5;
        const reflection = smoothRange(0.12, 0.62,
            flow * 0.58 + drift * 0.34 + ripples * 0.28);
        const shade = smoothRange(0.30, 0.52, radius);
        return {
            color: [
                48 + 33 * reflection - 13 * shade + detail * 5,
                82 + 33 * reflection - 15 * shade + detail * 6,
                101 + 34 * reflection - 17 * shade + detail * 7
            ],
            roughness: 0.31 + detail * 0.035,
            height: 0.00045 * flow + 0.00024 * Math.sin(
                (u * 15 + v * 7 + drift * 2.1) * TAU
            )
        };
    });
    return panel;
}

let cached: PaintedAtlas | undefined;

/** Old limestone, layered by hand-authored stone courses and weather. */
export function wellFinish(): PaintedAtlas {
    if (cached) return cached;

    // The upper outer course and coping use identical circumferential cuts,
    // so a joint doesn't mysteriously disappear across the lip.
    const rim = course(19, 702, 0, 1, 0, RIM_COLORS);
    const wallRows = [
        course(19, 702, 0, 0.35, 0, RIM_COLORS),
        course(13, 1811, 0.35, 0.71, 0.033, WALL_COLORS),
        course(11, 2206, 0.71, 1, 0.014, WALL_COLORS)
    ];
    // Same cut sequence, separate physical weathering on the horizontal face.
    const coping: Course = {
        ...rim,
        stones: wallRows[0]!.stones
    };

    const wall = masonryPanel(
        1024, 576, 4.7, 0.597, 1023, wallRows
    );
    const top = masonryPanel(
        1024, 320, 4.7, 0.275, 2104, [coping], false, true
    );
    const interior = masonryPanel(
        768, 384, 2.97, 0.307, 3301, [
            course(18, 3329, 0, 0.54, 0, WALL_COLORS),
            course(16, 3328, 0.54, 1, 0.025, WALL_COLORS)
        ], true
    );

    cached = assemblePaintedAtlas("Hand-painted · weathered well", [
        { name: "wall", surface: wall },
        { name: "rim", surface: top },
        { name: "inside", surface: interior },
        { name: "water", surface: waterPanel() }
    ]);
    return cached;
}
