const smooth = (t: number): number => {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
};

function hash(x: number, y: number, seed: number): number {
    let h = Math.imul(x, 0x9e3779b1) ^
        Math.imul(y, 0x85ebca6b) ^
        Math.imul(seed, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** Smooth, horizontally tileable pigment variation, not a material recipe. */
export function periodicField(
    u: number, v: number, columns: number, rows: number, seed: number
): number {
    const x = u * columns;
    const y = v * rows;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const dx = smooth(x - ix);
    const dy = smooth(y - iy);
    const column = (i: number) => ((i % columns) + columns) % columns;
    const a = hash(column(ix), iy, seed);
    const b = hash(column(ix + 1), iy, seed);
    const c = hash(column(ix), iy + 1, seed);
    const d = hash(column(ix + 1), iy + 1, seed);
    return ((a + (b - a) * dx) * (1 - dy) +
        (c + (d - c) * dx) * dy) * 2 - 1;
}

export function layeredField(
    u: number, v: number, seed: number
): number {
    return (
        0.43 * periodicField(u, v, 7, 5, seed) +
        0.29 * periodicField(u, v, 23, 13, seed + 31) +
        0.18 * periodicField(u, v, 59, 38, seed + 67) +
        0.10 * periodicField(u, v, 141, 91, seed + 113)
    );
}

export function smoothRange(a: number, b: number, value: number): number {
    return smooth((value - a) / (b - a));
}

export function random01(seed: number, a: number, b = 0): number {
    return hash(a, b, seed);
}
