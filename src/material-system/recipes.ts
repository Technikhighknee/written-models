import {
    PaintedSurface, assemblePaintedAtlas, seededRandom,
    type Mark, type PaintedAtlas, type Point
} from "./paint";

const choose = <T>(items: readonly T[], random: () => number): T =>
    items[Math.floor(random() * items.length)]!;

function freckles(
    surface: PaintedSurface,
    seed: number,
    count: number,
    color: string,
    opacity: number,
    bounds: readonly [number, number, number, number] = [0, 0, 1, 1]
): void {
    const random = seededRandom(seed);
    const [left, top, right, bottom] = bounds;
    const marks: Mark[] = Array.from({ length: count }, () => ({
        x: left + random() * (right - left),
        y: top + random() * (bottom - top),
        rx: 0.0006 + random() * 0.003,
        ry: 0.001 + random() * 0.007,
        rotation: random() * 3.14
    }));
    surface.marks(marks, { color, opacity, roughness: 0.96 });
}

function stoneCourses(
    surface: PaintedSurface, seed: number,
    courses: number, stones: number,
    colors: readonly string[]
): void {
    const random = seededRandom(seed);

    for (let row = 0; row < courses; row++) {
        const y0 = row / courses;
        const y1 = (row + 1) / courses;
        const offset = row % 2 ? 0.5 : 0;

        for (let i = -1; i <= stones; i++) {
            const x0 = (i + offset) / stones;
            const x1 = (i + offset + 1) / stones;
            const inset = 0.0035 + random() * 0.003;
            const chip = 0.004 + random() * 0.008;
            const top = y0 + 0.009 + random() * 0.006;
            const bottom = y1 - 0.009 - random() * 0.006;
            const irregular: Point[] = [
                [x0 + inset + chip, top],
                [x0 + (x1 - x0) * 0.46, top + (random() - 0.5) * 0.018],
                [x1 - inset - chip * 0.65, top + 0.004],
                [x1 - inset, top + chip * 1.6],
                [x1 - inset * 1.2, bottom - chip],
                [x1 - inset - chip * 0.7, bottom],
                [x0 + inset + chip * 0.7, bottom - 0.003],
                [x0 + inset, bottom - chip * 1.2]
            ];
            surface.polygon(irregular, {
                color: "#171b17", height: -0.009, roughness: 1
            });
            // A muted broad body; the black mortar remains visible at every joint.
            surface.polygon(irregular.map(([x, y]) => [
                x0 + (x - x0) * 0.97,
                top + (y - top) * 0.945
            ] as Point), {
                color: choose(colors, random),
                roughness: 0.94,
                height: 0.001 + random() * 0.0015
            });
            surface.stroke([
                [x0 + inset + chip * 1.2, top + 0.009],
                [x1 - inset - chip * 0.8, top + 0.012]
            ], 0.006, { color: "#d2b89b", opacity: 0.28, height: 0.003 });
            surface.stroke([
                [x0 + inset + 0.009, bottom - 0.008],
                [x1 - inset - 0.01, bottom - 0.013]
            ], 0.008, { color: "#2b2924", opacity: 0.53, height: -0.002 });

            if (random() > 0.45) {
                const x = x0 + (x1 - x0) * (0.23 + random() * 0.48);
                surface.stroke([
                    [x, top + 0.018],
                    [x + (random() - 0.5) * 0.02, top + 0.037],
                    [x + (random() - 0.5) * 0.02, top + 0.054]
                ], 0.002, {
                    color: "#292923", height: -0.003, opacity: 0.65
                });
            }

            const flecks: Mark[] = Array.from({ length: 9 }, () => ({
                x: x0 + inset + random() * (x1 - x0 - 2 * inset),
                y: top + random() * (bottom - top),
                rx: 0.001 + random() * 0.006,
                ry: 0.002 + random() * 0.013
            }));
            surface.marks(flecks, {
                color: choose(["#3f3a34", "#c5b49e", "#555346"], random),
                opacity: 0.19, roughness: 0.99, height: -0.0008
            });
        }
    }

    // Deposits and dampness follow joints and lower stones, not uniform noise.
    const moss = seededRandom(seed + 990);
    for (let i = 0; i < 130; i++) {
        const x = moss();
        const y = 0.2 + moss() * 0.8;
        const nearJoint = Math.abs(y * courses - Math.round(y * courses)) < 0.09;
        if (!nearJoint && moss() < 0.8) continue;
        surface.marks([{
            x, y, rx: 0.001 + moss() * 0.007,
            ry: 0.002 + moss() * 0.013
        }], {
            color: moss() > 0.48 ? "#394329" : "#515536",
            opacity: 0.35 + moss() * 0.3,
            roughness: 1
        });
    }
}

function limestone(): PaintedAtlas {
    const outside = new PaintedSurface(
        768, 384, 4.7, 0.61, "#25231f", 0.99, true
    );
    stoneCourses(outside, 101, 3, 14, [
        "#847566", "#978675", "#7b7268", "#a08d75",
        "#756c60", "#918478", "#796d62"
    ]);
    freckles(outside, 403, 650, "#352f29", 0.17);

    const rim = new PaintedSurface(
        768, 192, 4.7, 0.275, "#292720", 0.99, true
    );
    stoneCourses(rim, 210, 1, 18, [
        "#9d8b75", "#85776b", "#a49381", "#81776a", "#8c806e"
    ]);
    freckles(rim, 491, 200, "#342f28", 0.18);

    const inside = new PaintedSurface(
        768, 256, 3.0, 0.31, "#242721", 0.99, true
    );
    stoneCourses(inside, 123, 2, 13, [
        "#625d50", "#686459", "#797166", "#59574f", "#777368"
    ]);
    inside.stroke([
        [0.02, 0.18], [0.06, 0.52], [0.07, 0.96]
    ], 0.06, { color: "#364437", opacity: 0.28 });
    freckles(inside, 303, 170, "#424838", 0.2);

    return assemblePaintedAtlas("Painted · Old well masonry", [
        { name: "wall", surface: outside },
        { name: "rim", surface: rim },
        { name: "inside", surface: inside }
    ]);
}

function timberBoards(
    surface: PaintedSurface,
    seed: number,
    horizontal: boolean,
    count: number,
    palette: readonly string[]
): void {
    const random = seededRandom(seed);
    for (let i = 0; i < count; i++) {
        const start = i / count + 0.0035;
        const end = (i + 1) / count - 0.004;
        const from: Point[] = horizontal
            ? [[0, start], [1, start], [1, end], [0, end]]
            : [[start, 0], [end, 0], [end, 1], [start, 1]];
        surface.polygon(from, {
            color: choose(palette, random), roughness: 0.87,
            height: 0.0017
        });
        const lines = 9;
        for (let j = 0; j < lines; j++) {
            const along = start + (end - start) * (j + 0.5) / lines;
            const wiggle = (random() - 0.5) * 0.004;
            surface.stroke(horizontal
                ? [[0.02, along], [0.32, along + wiggle],
                    [0.71, along - wiggle], [0.98, along]]
                : [[along, 0.01], [along + wiggle, 0.31],
                    [along - wiggle, 0.72], [along, 0.99]],
            0.001 + random() * 0.0022, {
                color: random() < 0.55 ? "#28190f" : "#c29a6c",
                opacity: 0.16 + random() * 0.3,
                height: random() * 0.0006
            });
        }
    }
    freckles(surface, seed + 71, 260, "#211910", 0.12);
}

function crate(): PaintedAtlas {
    const boards = new PaintedSurface(512, 512, 0.9, 0.9, "#25170f", 0.96);
    timberBoards(boards, 47, true, 7, [
        "#684329", "#5c3924", "#795035", "#704b2e",
        "#573724", "#805335"
    ]);
    // Frame and diagonal braces are painted, including their relief and shadows.
    const frame: readonly (readonly Point[])[] = [
        [[0.055, 0.05], [0.055, 0.95]],
        [[0.945, 0.05], [0.945, 0.95]],
        [[0.035, 0.065], [0.965, 0.065]],
        [[0.035, 0.935], [0.965, 0.935]],
        [[0.10, 0.91], [0.90, 0.10]]
    ];
    for (const path of frame) {
        boards.stroke(path, 0.077, {
            color: "#1c120d", roughness: 0.98, height: -0.003
        });
        boards.stroke(path, 0.061, {
            color: "#56361f", roughness: 0.88, height: 0.007
        });
        boards.stroke(path.map(([x, y]) => [x - 0.008, y - 0.008]), 0.008, {
            color: "#b38859", opacity: 0.42, height: 0.008
        });
    }
    return assemblePaintedAtlas("Painted · Braced crate", [
        { name: "planks", surface: boards }
    ]);
}

function barrel(): PaintedAtlas {
    const side = new PaintedSurface(768, 512, 2.9, 1.0, "#281a12", 0.95, true);
    timberBoards(side, 11, false, 14, [
        "#563623", "#63412b", "#764b2f", "#6c452d",
        "#60402c", "#805337", "#4f3424"
    ]);
    // Two nearly black wrought-iron hoops with restrained rivet heads.
    for (const y of [0.21, 0.76]) {
        side.stroke([[0, y - 0.008], [1, y - 0.008]], 0.049, {
            color: "#161713", roughness: 0.75, height: 0.002
        });
        side.stroke([[0, y - 0.022], [1, y - 0.022]], 0.007, {
            color: "#6b6353", opacity: 0.55, height: 0.003
        });
        side.stroke([[0, y + 0.018], [1, y + 0.018]], 0.008, {
            color: "#0b0d0b", height: -0.003
        });
        const rivets: Mark[] = Array.from({ length: 15 }, (_, i) => ({
            x: (i + 0.5) / 15,
            y: y - 0.007,
            rx: 0.0029,
            ry: 0.004
        }));
        side.marks(rivets, {
            color: "#80735b", roughness: 0.6, height: 0.003
        });
    }

    const head = new PaintedSurface(512, 512, 0.85, 0.85, "#28170e", 0.92);
    timberBoards(head, 88, true, 5, [
        "#6b462b", "#583823", "#7e5233", "#603e29"
    ]);
    return assemblePaintedAtlas("Painted · Coopered barrel", [
        { name: "staves", surface: side },
        { name: "head", surface: head }
    ]);
}

function bucket(): PaintedAtlas {
    const wall = new PaintedSurface(512, 512, 1.7, 0.58, "#352518", 0.95, true);
    timberBoards(wall, 29, false, 12, [
        "#6c482d", "#755137", "#64442c", "#815b3b",
        "#6a4a32", "#8d6342"
    ]);
    for (const y of [0.09, 0.91]) {
        wall.stroke([[0, y], [1, y]], 0.042, {
            color: "#392617", roughness: 0.91, height: 0.004
        });
        wall.stroke([[0, y - 0.014], [1, y - 0.014]], 0.006, {
            color: "#9e7650", opacity: 0.53, height: 0.005
        });
    }
    const floor = new PaintedSurface(256, 256, 0.44, 0.44, "#332518", 0.94);
    timberBoards(floor, 119, true, 4, [
        "#67472d", "#795338", "#60402b"
    ]);
    return assemblePaintedAtlas("Painted · Wooden pail", [
        { name: "staves", surface: wall },
        { name: "floor", surface: floor }
    ]);
}

function wicker(): PaintedAtlas {
    const weave = new PaintedSurface(768, 512, 2.3, 0.57, "#241b0d", 0.98, true);
    const rnd = seededRandom(37);
    const columns = 26;
    const rows = 18;

    // Dark joints and staggered reed faces. Each crossing changes which
    // strand appears on top instead of applying a uniform checker texture.
    for (let x = 0; x < columns; x++) {
        const u = (x + 0.5) / columns;
        weave.stroke([[u, 0.01], [u, 0.99]], 0.022, {
            color: choose(["#806036", "#927044", "#725632"], rnd),
            roughness: 0.92, height: 0.001
        });
    }
    for (let y = 0; y < rows; y++) {
        const v = (y + 0.5) / rows;
        for (let x = 0; x < columns; x++) {
            const from = x / columns - 0.004;
            const to = (x + 1) / columns + 0.004;
            const raised = (x + y) % 2 === 0;
            weave.stroke([
                [from, v + 0.005], [(from + to) / 2, v - 0.003],
                [to, v + 0.005]
            ], raised ? 0.036 : 0.027, {
                color: raised
                    ? choose(["#b28c50", "#a7824b", "#96713e"], rnd)
                    : choose(["#856337", "#6e502e", "#9d7844"], rnd),
                roughness: 0.86,
                height: raised ? 0.004 : 0.0006
            });
            weave.stroke([
                [from + 0.004, v - 0.01], [to - 0.004, v - 0.01]
            ], 0.004, { color: "#dfb975", opacity: 0.34 });
        }
    }
    for (const v of [0.02, 0.955]) {
        weave.stroke([[0, v], [1, v]], 0.05, {
            color: "#73512d", height: 0.005, roughness: 0.9
        });
        for (let i = 0; i < 40; i++) {
            const u = i / 40;
            weave.stroke([
                [u - 0.009, v + 0.016],
                [u + 0.013, v - 0.017]
            ], 0.011, { color: "#c09a59", height: 0.006 });
        }
    }

    const inside = new PaintedSurface(512, 256, 2, 0.48, "#574126", 0.98, true);
    timberBoards(inside, 91, false, 22, [
        "#755936", "#674d2d", "#8a6b41"
    ]);
    return assemblePaintedAtlas("Painted · Wicker basket", [
        { name: "weave", surface: weave },
        { name: "inside", surface: inside }
    ]);
}

let wellAtlas: PaintedAtlas | undefined;
let crateAtlas: PaintedAtlas | undefined;
let barrelAtlas: PaintedAtlas | undefined;
let bucketAtlas: PaintedAtlas | undefined;
let basketAtlas: PaintedAtlas | undefined;

export const wellFinish = (): PaintedAtlas =>
    wellAtlas ??= limestone();
export const crateFinish = (): PaintedAtlas =>
    crateAtlas ??= crate();
export const barrelFinish = (): PaintedAtlas =>
    barrelAtlas ??= barrel();
export const bucketFinish = (): PaintedAtlas =>
    bucketAtlas ??= bucket();
export const basketFinish = (): PaintedAtlas =>
    basketAtlas ??= wicker();
