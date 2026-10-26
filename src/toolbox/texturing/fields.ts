export function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export function smoothstep(from: number, to: number, value: number): number {
    const t = clamp01((value - from) / (to - from));
    return t * t * (3 - 2 * t);
}

/** Shortest signed separation on a repeating 0..1 axis. */
export function wrappedDelta(a: number, b: number): number {
    const delta = a - b;
    return delta - Math.floor(delta + 0.5);
}

/** An art-directable feature mask, with soft elliptical falloff and wrap. */
export function ellipseMask(
    u: number, v: number,
    centerU: number, centerV: number,
    radiusU: number, radiusV: number
): number {
    const dx = wrappedDelta(u, centerU) / radiusU;
    const dy = wrappedDelta(v, centerV) / radiusV;
    const distance = Math.hypot(dx, dy);
    return 1 - smoothstep(0.15, 1, distance);
}

export type Rgb = readonly [number, number, number];
export type ColorStop = readonly [position: number, color: Rgb];

/** Interpolates hand-picked colors without scattering RGB math through recipes. */
export function palette(stops: readonly ColorStop[], position: number): Rgb {
    if (stops.length < 2) {
        throw new RangeError("A palette requires at least two colors");
    }
    if (position <= stops[0]![0]) return stops[0]![1];

    for (let i = 1; i < stops.length; i++) {
        const [end, b] = stops[i]!;
        const [start, a] = stops[i - 1]!;
        if (end <= start) throw new RangeError("Palette stops must increase");
        if (position <= end) {
            const t = (position - start) / (end - start);
            return [
                a[0] + (b[0] - a[0]) * t,
                a[1] + (b[1] - a[1]) * t,
                a[2] + (b[2] - a[2]) * t
            ];
        }
    }
    return stops.at(-1)![1];
}
