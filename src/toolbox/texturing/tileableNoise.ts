/** Deterministic periodic value noise, reusable for any authored material. */
export function tileableNoise(
    u: number,
    v: number,
    columns: number,
    rows: number,
    seed = 0
): number {
    if (
        !Number.isInteger(columns) || columns < 1 ||
        !Number.isInteger(rows) || rows < 1 ||
        !Number.isInteger(seed)
    ) {
        throw new RangeError("Noise requires integer periods and seed");
    }

    const x = u * columns;
    const y = v * rows;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const tx = x - ix;
    const ty = y - iy;
    const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
    const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);

    const wrap = (n: number, count: number): number =>
        ((n % count) + count) % count;

    function value(px: number, py: number): number {
        let hash = Math.imul(wrap(px, columns) + seed * 1013, 0x1b873593);
        hash ^= Math.imul(wrap(py, rows) + seed * 9176, 0x85ebca6b);
        hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
        hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
        return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff * 2 - 1;
    }

    const a = value(ix, iy);
    const b = value(ix + 1, iy);
    const c = value(ix, iy + 1);
    const d = value(ix + 1, iy + 1);
    const low = a + (b - a) * sx;
    const high = c + (d - c) * sx;
    return low + (high - low) * sy;
}

/** Multi-scale periodic variation with independently controlled X and Y scale. */
export function fractalNoise(
    u: number,
    v: number,
    columns: number,
    rows: number,
    octaves: number,
    seed = 0
): number {
    if (!Number.isInteger(octaves) || octaves < 1 || octaves > 8) {
        throw new RangeError("Octaves must be between 1 and 8");
    }

    let sum = 0;
    let amplitude = 1;
    let total = 0;

    for (let i = 0; i < octaves; i++) {
        sum += tileableNoise(u, v, columns * 2 ** i, rows * 2 ** i, seed + i * 17)
            * amplitude;
        total += amplitude;
        amplitude *= 0.5;
    }

    return sum / total;
}
