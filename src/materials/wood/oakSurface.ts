import type { SurfaceSample } from "../../toolbox/texturing/bakePbrMaps";
import { palette, smoothstep, wrappedDelta } from "../../toolbox/texturing/fields";
import { fractalNoise, tileableNoise } from "../../toolbox/texturing/tileableNoise";
import { flowedGrainField } from "../../toolbox/texturing/flowedGrainField";

const TAU = Math.PI * 2;
const fract = (value: number): number => value - Math.floor(value);
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

// Deep, warm oak shared by every cut: broad faces, long grain and
// end grain. Darken the sRGB stops themselves, not the material lighting,
// so the same look survives texture baking and GLB export.
const OAK_COLORS = [
    [0, [41, 29, 20]],
    [0.28, [57, 40, 27]],
    [0.53, [76, 53, 35]],
    [0.78, [94, 69, 47]],
    [1, [110, 85, 60]]
] as const;

function random(seed: number, salt: number): number {
    let h = Math.imul(seed + 171, 0x9e3779b1) ^
        Math.imul(salt + 1, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function bands(phase: number): { late: number; early: number } {
    const cycle = fract(phase);
    // Both boundaries are periodic: there is no break where one tile ends.
    const edge = Math.min(cycle, 1 - cycle);
    return {
        late: smoothstep(0.38, 0.83, cycle) *
            (1 - smoothstep(0.91, 0.995, cycle)),
        early: 1 - smoothstep(0.015, 0.105, edge)
    };
}

/**
 * Each seed is a different CUT of the same oak, not a new color scheme.
 * A tile spans an entire furniture board length; seed controls ring shape,
 * pores and the optional knot positions. No recognizable shared 'stamp'.
 */
export function makeOakFace(seed: number): (u: number, v: number) => SurfaceSample {
    if (!Number.isInteger(seed) || seed < 0) {
        throw new RangeError("Oak cut seed must be a nonnegative integer");
    }

    const ringCount = 10 + Math.floor(random(seed, 1) * 6);
    const knotCount = random(seed, 2) > 0.62 ? 1 : 0;
    const knotU = 0.18 + 0.64 * random(seed, 3);
    const knotV = 0.12 + 0.76 * random(seed, 4);
    const knotWidth = 0.055 + 0.025 * random(seed, 5);

    return (u, v) => {
        const broad = fractalNoise(u, v, 3, 2, 3, seed * 13 + 11);
        const streak = fractalNoise(u, v, 13, 4, 3, seed * 13 + 23);
        const vessels = tileableNoise(u, v, 107, 42, seed * 13 + 41);
        const fiber = tileableNoise(u, v, 89, 7, seed * 13 + 59);
        const speckle = tileableNoise(u, v, 151, 67, seed * 13 + 73);

        let knot = 0;
        let bend = 0;

        if (knotCount) {
            const du = wrappedDelta(u, knotU) / knotWidth;
            const dv = wrappedDelta(v, knotV) / 0.027;
            const distance = Math.hypot(du, dv);
            knot = Math.exp(-1.6 * distance * distance);
            bend = 0.045 * du * Math.exp(-0.9 * du * du - 0.35 * dv * dv);
        }

        const ringPhase = ringCount *
            (u + 0.023 * broad + 0.008 * streak + bend);
        const { late, early } = bands(ringPhase);

        const pore = smoothstep(0.20, 0.58, vessels) *
            (0.20 + 0.80 * early);
        const smallPores = smoothstep(0.20, 0.68, speckle) *
            (0.22 + 0.78 * early);

        // Pale oak rays are sparse and quiet, not repeating bright decals.
        const ray = smoothstep(0.65, 0.91,
            tileableNoise(u, v, 14, 29, seed * 13 + 97)
        ) * 0.5;

        const tone = clamp(
            0.60 - 0.19 * late + 0.12 * broad + 0.08 * streak +
            0.036 * fiber - 0.17 * pore - 0.070 * smallPores -
            0.21 * knot + 0.09 * ray
        );

        return {
            color: palette(OAK_COLORS, tone),
            roughness: clamp(
                0.80 + 0.043 * late + 0.057 * pore +
                0.017 * fiber + 0.019 * smallPores - 0.035 * ray
            ),
            height: -0.000041 * pore - 0.000014 * late -
                0.000010 * smallPores + 0.000011 * fiber +
                0.000007 * streak - 0.000012 * knot
        };
    };
}

/**
 * Cross-cut oak shows subdued, open ring arcs and exposed pores,
 * without centered bullseyes or repeated circular stamps.
 */
export function makeOakEndGrain(seed: number): (u: number, v: number) => SurfaceSample {
    if (!Number.isInteger(seed) || seed < 0) {
        throw new RangeError("Oak cut seed must be a nonnegative integer");
    }

    const rings = 12 + Math.floor(random(seed, 111) * 7);
    const bend = 1.1 + random(seed, 112) * 1.7;

    return (u, v) => {
        const uneven = fractalNoise(u, v, 5, 5, 3, seed * 19 + 203);
        const pores = tileableNoise(u, v, 71, 67, seed * 19 + 221);
        const fine = tileableNoise(u, v, 114, 91, seed * 19 + 239);

        // Integer transverse frequency and periodic longitudinal warp:
        // these arcs join continuously at both sides of the tile.
        const phase = rings * u + bend * Math.cos(TAU * v) +
            0.32 * uneven + 0.13 * Math.sin(TAU * u);
        const { late, early } = bands(phase);
        const openPores = smoothstep(0.08, 0.57, pores) *
            (0.35 + 0.65 * early);

        const tone = clamp(
            0.53 - 0.11 * late - 0.17 * openPores +
            0.074 * uneven + 0.035 * fine
        );

        return {
            color: palette(OAK_COLORS, tone),
            roughness: clamp(0.88 + 0.045 * openPores + 0.024 * late),
            height: -0.000036 * openPores - 0.000008 * late +
                0.000006 * uneven
        };
    };
}

// Seed-zero material recipes for callers that do not select a cut.
export const oakFace = makeOakFace(0);
export const oakEndGrain = makeOakEndGrain(0);

/**
 * Quiet, continuously flowing broad-face grain for planed oak.
 *
 * Grain lines follow one continuous fiber field across the board.
 * Broad latewood bands remain subordinate to pores and fine longitudinal grain.
 */
export function makeOakBoardFace(seed: number): (u: number, v: number) => SurfaceSample {
    if (!Number.isInteger(seed) || seed < 0) {
        throw new RangeError("Oak cut seed must be a nonnegative integer");
    }

    const flow = flowedGrainField({
        rings: 4 + Math.floor(random(seed, 7) * 3),
        bend: 0.24 + 0.07 * random(seed, 8),
        firstPhase: TAU * random(seed, 9),
        secondPhase: TAU * random(seed, 10)
    });

    return (u, v) => {
        const broad = fractalNoise(u, v, 3, 2, 3, seed * 13 + 11);
        const streak = fractalNoise(u, v, 13, 4, 2, seed * 13 + 23);
        const fiber = tileableNoise(u, v, 89, 7, seed * 13 + 59);
        const vessels = tileableNoise(u, v, 107, 42, seed * 13 + 41);

        // The displaced coordinate belongs to the grain itself, not to a
        // separate circular mask. Growth zones can't form floating crescents.
        const phase = flow(u, v, 0.10 * broad + 0.025 * streak);
        const { late, early } = bands(phase);
        const pores = smoothstep(0.08, 0.65, vessels) *
            (0.60 + 0.40 * early);

        const tone = clamp(
            0.66 + 0.10 * broad + 0.075 * streak +
            0.044 * fiber - 0.073 * late - 0.045 * pores
        );

        return {
            color: palette(OAK_COLORS, tone),
            roughness: clamp(
                0.80 + 0.018 * late +
                0.034 * pores + 0.013 * fiber
            ),
            height: -0.000029 * pores - 0.000008 * late +
                0.000007 * fiber + 0.000005 * streak
        };
    };
}
