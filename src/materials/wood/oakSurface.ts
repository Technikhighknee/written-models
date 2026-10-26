import type { SurfaceSample } from "../../toolbox/texturing/bakePbrMaps";
import {
    ellipseMask, palette, smoothstep, wrappedDelta
} from "../../toolbox/texturing/fields";
import { fractalNoise, tileableNoise } from "../../toolbox/texturing/tileableNoise";

const fract = (v: number): number => v - Math.floor(v);

/** A latewood band with an abrupt porous boundary, not a sine stripe. */
function latewood(phase: number): number {
    const t = fract(phase);
    return smoothstep(0.39, 0.82, t) * (1 - smoothstep(0.89, 0.995, t));
}

const KNOTS = [
    { u: 0.30, v: 0.29, ru: 0.095, rv: 0.048 },
    { u: 0.80, v: 0.74, ru: 0.060, rv: 0.033 }
] as const;

const RAYS = [
    [0.12, 0.14, 0.014, 0.033],
    [0.60, 0.48, 0.021, 0.051],
    [0.43, 0.86, 0.012, 0.038],
    [0.91, 0.22, 0.018, 0.025]
] as const;

const HEARTWOOD = [
    [0, [78, 61, 46]],
    [0.28, [116, 91, 65]],
    [0.53, [151, 124, 89]],
    [0.78, [180, 151, 111]],
    [1, [197, 171, 127]]
] as const;

/** Longitudinal oak cut. U runs across annual rings; V follows fibers. */
export function oakFace(u: number, v: number): SurfaceSample {
    const broad = fractalNoise(u, v, 3, 2, 3, 11);
    const streak = fractalNoise(u, v, 15, 5, 3, 26);
    const fine = tileableNoise(u, v, 145, 22, 47);
    const fiber = tileableNoise(u, v, 87, 6, 71);

    // Two localized knots. Their centers and dimensions are intentionally
    // authored; the material remains deterministic across all models.
    let knotDarkening = 0;
    let knotRings = 0;
    let bend = 0;

    for (const knot of KNOTS) {
        const du = wrappedDelta(u, knot.u) / knot.ru;
        const dv = wrappedDelta(v, knot.v) / knot.rv;
        const r = Math.hypot(du, dv);
        const aura = Math.exp(-0.8 * r * r);
        const core = ellipseMask(u, v, knot.u, knot.v, knot.ru * 0.52, knot.rv * 0.55);
        // Fibers flow around the eye; both directions of the grain bend.
        bend += 0.050 * du * Math.exp(-0.6 * du * du - 0.35 * dv * dv);
        knotDarkening += core * 0.40 + aura * 0.11;
        knotRings += Math.sin(r * 19 + 0.5 * broad) * aura * 0.06;
    }

    const displacement =
        0.032 * broad + 0.011 * streak + bend;
    const phase = 13 * (u + displacement) + 0.31 * streak;
    const ring = latewood(phase);
    const boundary = 1 - smoothstep(0.015, 0.12, fract(phase));

    // Oak is ring-porous: darker longitudinal vessel grooves are strongest
    // in earlywood, rather than being distributed evenly across the wood.
    const vesselField = tileableNoise(u, v, 126, 70, 102);
    const vessels = smoothstep(0.10, 0.58, vesselField) *
        (0.25 + 0.75 * boundary);
    const narrowPores = smoothstep(0.16, 0.6, fine) *
        (0.25 + 0.75 * boundary);

    // Narrow, softly reflecting medullary rays: occasional pale flecks,
    // not large uniform streaks or extra geometry.
    let ray = 0;
    for (const [x, y, rx, ry] of RAYS) {
        ray += ellipseMask(u, v, x, y, rx, ry);
    }
    ray = Math.min(1, ray);

    const tone = Math.max(0, Math.min(1,
        0.59 - 0.23 * ring + 0.12 * broad + 0.11 * streak +
        0.055 * fiber - 0.25 * vessels - 0.10 * narrowPores -
        knotDarkening + knotRings + 0.13 * ray
    ));

    return {
        color: palette(HEARTWOOD, tone),
        roughness: Math.max(0.66, Math.min(0.97,
            0.82 + 0.052 * ring + 0.065 * vessels +
            0.026 * narrowPores + 0.015 * fiber - 0.08 * ray
        )),
        height: -0.000055 * vessels - 0.000023 * narrowPores -
            0.000014 * ring + 0.000012 * fiber +
            0.000008 * streak - 0.000012 * knotDarkening +
            0.000007 * ray
    };
}

/** Cross-cut oak: growth rings and rays share the same material vocabulary. */
export function oakEndGrain(u: number, v: number): SurfaceSample {
    // One deliberately offset annual-ring center. Fade it before the tile
    // boundary, so we avoid the star-shaped duplicate centers produced by
    // periodic cosine radii while retaining a seamless repeating material.
    const du = wrappedDelta(u, 0.48);
    const dv = wrappedDelta(v, 0.53);
    const radial = Math.hypot(du * 1.08, dv * 0.9);
    const irregular = fractalNoise(u, v, 5, 5, 3, 221);
    const field = radial * 28 + 0.44 * irregular;
    const inside = 1 - smoothstep(0.34, 0.49, radial);
    const ring = latewood(field) * inside;
    const early = (1 - smoothstep(0.015, 0.16, fract(field))) * inside;
    const pores = smoothstep(0.16, 0.53,
        tileableNoise(u, v, 65, 67, 233)) * (0.25 + 0.75 * early);
    const narrow = tileableNoise(u, v, 41, 42, 242);
    const theta = Math.atan2(dv, du);
    const ray = Math.pow(Math.abs(Math.cos(19 * theta + irregular)), 24) *
        inside * smoothstep(0.06, 0.18, radial);

    const tone = Math.max(0, Math.min(1,
        0.51 - 0.22 * ring + 0.075 * irregular -
        0.19 * pores + 0.03 * narrow + 0.13 * ray
    ));

    return {
        color: palette(HEARTWOOD, tone),
        roughness: Math.max(0.7, Math.min(0.98,
            0.9 + 0.045 * pores + 0.03 * ring - 0.07 * ray
        )),
        height: -0.000050 * pores - 0.000012 * ring +
            0.000006 * irregular
    };
}
