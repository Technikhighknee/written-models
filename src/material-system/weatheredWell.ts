import {
    PaintedSurface, assemblePaintedAtlas, type PaintedAtlas,
    type RasterSample
} from "./paint";
import { periodicField } from "./pigmentFields";

type Rgb = readonly [number, number, number];

function stonePaint(
    width: number, height: number, seed: number, base: Rgb
): PaintedSurface {
    const surface = new PaintedSurface(
        width, height, 0.92, 0.48, "#736557", 0.94, true
    );
    surface.raster((u, v): RasterSample => {
        const broad = periodicField(u, v, 5, 4, seed);
        const mottling = periodicField(u, v, 19, 12, seed + 71);
        const grain = periodicField(u, v, 52, 33, seed + 103);
        const stained = Math.max(0,
            periodicField(u, v, 8, 9, seed + 211) * 0.65 + broad * 0.4
        );
        const tint = broad * 13 + mottling * 8 + grain * 2.5 - stained * 9;
        return {
            color: [
                base[0] + tint + mottling * 2,
                base[1] + tint,
                base[2] + tint - broad * 2
            ],
            roughness: 0.92 + mottling * 0.025 + grain * 0.012,
            // Chipped corners, joints and silhouette are actual geometry.
            height: broad * 0.00012 + mottling * 0.00007
        };
    });
    return surface;
}

let cached: PaintedAtlas | undefined;

/** Muted limestone pigment for blocks whose shape and joints are geometric. */
export function wellFinish(): PaintedAtlas {
    if (cached) return cached;

    const stone = stonePaint(768, 512, 391, [119, 102, 87]);
    const coping = stonePaint(768, 384, 881, [132, 113, 96]);
    const mortar = new PaintedSurface(
        128, 128, 0.5, 0.5, "#3c3731", 0.98, true
    );

    cached = assemblePaintedAtlas("Worn limestone · stone masonry", [
        { name: "stone", surface: stone },
        { name: "coping", surface: coping },
        { name: "mortar", surface: mortar }
    ]);
    cached.material.normalScale.set(0.32, 0.32);
    return cached;
}
