import * as THREE from "three";

export interface SurfaceSample {
    /** sRGB color, 0..255 per channel. */
    color: readonly [number, number, number];
    /** 0 = polished, 1 = fully rough. */
    roughness: number;
    /** Surface relief in meters, used to bake a tangent-space normal map. */
    height: number;
}

export interface SurfaceRecipe {
    width: number;
    height: number;
    /** Dimensions of one repeat in meters; geometry UVs are in meters too. */
    tileWidth: number;
    tileLength: number;
    sample: (u: number, v: number) => SurfaceSample;
}

export interface PbrMaps {
    color: THREE.CanvasTexture;
    roughness: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
}

/**
 * Bakes three aligned PBR maps from one authored surface recipe.
 *
 * Color is sRGB; roughness and normals are linear data. Each map has
 * the same physical UV scale and uses the same repeat transform,
 * so a scratch never drifts between channels.
 */
export function bakePbrMaps(recipe: SurfaceRecipe): PbrMaps {
    const { width, height, tileWidth, tileLength, sample } = recipe;

    if (
        !Number.isInteger(width) || width < 2 ||
        !Number.isInteger(height) || height < 2 ||
        !Number.isFinite(tileWidth) || tileWidth <= 0 ||
        !Number.isFinite(tileLength) || tileLength <= 0
    ) {
        throw new RangeError("Invalid surface map dimensions");
    }

    function image(): { canvas: HTMLCanvasElement; pixels: ImageData } {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Canvas 2D is unavailable");
        }

        return { canvas, pixels: context.createImageData(width, height) };
    }

    const color = image();
    const roughness = image();
    const normal = image();
    const heights = new Float32Array(width * height);

    const byte = (value: number): number =>
        Math.round(Math.max(0, Math.min(255, value)));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const offset = index * 4;
            const value = sample(x / width, y / height);

            if (
                !value.color.every(Number.isFinite) ||
                !Number.isFinite(value.roughness) ||
                !Number.isFinite(value.height)
            ) {
                throw new RangeError("Surface recipe produced invalid values");
            }

            heights[index] = value.height;
            color.pixels.data[offset] = byte(value.color[0]);
            color.pixels.data[offset + 1] = byte(value.color[1]);
            color.pixels.data[offset + 2] = byte(value.color[2]);
            color.pixels.data[offset + 3] = 255;

            const r = byte(value.roughness * 255);
            roughness.pixels.data[offset] = r;
            roughness.pixels.data[offset + 1] = r; // glTF reads G
            roughness.pixels.data[offset + 2] = r;
            roughness.pixels.data[offset + 3] = 255;
        }
    }

    // Central differences wrap at tile edges. Canvas pixels increase
    // downwards in Y, whereas texture V increases upwards.
    function at(x: number, y: number): number {
        return heights[
            ((y + height) % height) * width +
            ((x + width) % width)
        ]!;
    }

    const dx = tileWidth / width;
    const dy = tileLength / height;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            const nx = (at(x - 1, y) - at(x + 1, y)) / (2 * dx);
            const ny = (at(x, y + 1) - at(x, y - 1)) / (2 * dy);
            const invLength = 1 / Math.hypot(nx, ny, 1);

            normal.pixels.data[offset] = byte((nx * invLength * 0.5 + 0.5) * 255);
            normal.pixels.data[offset + 1] = byte((ny * invLength * 0.5 + 0.5) * 255);
            normal.pixels.data[offset + 2] = byte(((invLength) * 0.5 + 0.5) * 255);
            normal.pixels.data[offset + 3] = 255;
        }
    }

    function texture(
        entry: { canvas: HTMLCanvasElement; pixels: ImageData },
        colorSpace: THREE.ColorSpace
    ): THREE.CanvasTexture {
        const context = entry.canvas.getContext("2d");

        if (!context) {
            throw new Error("Canvas 2D is unavailable");
        }

        context.putImageData(entry.pixels, 0, 0);
        const result = new THREE.CanvasTexture(entry.canvas);
        result.colorSpace = colorSpace;
        result.wrapS = THREE.RepeatWrapping;
        result.wrapT = THREE.RepeatWrapping;
        result.repeat.set(1 / tileWidth, 1 / tileLength);
        result.anisotropy = 8;
        return result;
    }

    return {
        color: texture(color, THREE.SRGBColorSpace),
        roughness: texture(roughness, THREE.NoColorSpace),
        normal: texture(normal, THREE.NoColorSpace)
    };
}
