import * as THREE from "three";

/** One aligned PBR texture set, with identical UV transforms on all maps. */
export interface AtlasSource {
    id: string;
    color: THREE.CanvasTexture;
    roughness: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
}

export interface AtlasTile {
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface AtlasPage {
    width: number;
    height: number;
    tiles: AtlasTile[];
    color: THREE.CanvasTexture;
    roughness: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
}

const PADDING = 4;
const MAX_SIZE = 4096;

function powerOfTwo(value: number): number {
    return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

function sourceCanvas(texture: THREE.CanvasTexture): HTMLCanvasElement {
    const image: unknown = texture.image;
    if (!(image instanceof HTMLCanvasElement)) {
        throw new Error("Texture atlas requires canvas-backed source maps");
    }
    return image;
}

function paintTile(
    context: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    tile: AtlasTile
): void {
    const { x, y, width: w, height: h } = tile;
    const p = PADDING;
    context.drawImage(source, 0, 0, w, h, x + p, y + p, w, h);

    // Extend the last pixels into a gutter: bilinear filtering and lower
    // mip levels must not borrow pixels from the neighboring material.
    context.drawImage(source, 0, 0, 1, h, x, y + p, p, h);
    context.drawImage(source, w - 1, 0, 1, h, x + p + w, y + p, p, h);
    context.drawImage(source, 0, 0, w, 1, x + p, y, w, p);
    context.drawImage(source, 0, h - 1, w, 1, x + p, y + p + h, w, p);
    context.drawImage(source, 0, 0, 1, 1, x, y, p, p);
    context.drawImage(source, w - 1, 0, 1, 1, x + p + w, y, p, p);
    context.drawImage(source, 0, h - 1, 1, 1, x, y + p + h, p, p);
    context.drawImage(source, w - 1, h - 1, 1, 1,
        x + p + w, y + p + h, p, p);
}

function createCanvas(width: number, height: number): {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
} {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is required for texture atlases");
    return { canvas, context };
}

export function packPbrTextures(sources: readonly AtlasSource[]): {
    pages: AtlasPage[];
    tiles: Map<string, AtlasTile>;
} {
    if (sources.length === 0) return { pages: [], tiles: new Map() };

    const records = sources.map(source => {
        const color = sourceCanvas(source.color);
        const roughness = sourceCanvas(source.roughness);
        const normal = sourceCanvas(source.normal);
        if (
            color.width !== roughness.width ||
            color.height !== roughness.height ||
            color.width !== normal.width ||
            color.height !== normal.height
        ) {
            throw new Error("PBR maps must have matching dimensions");
        }
        if (color.width + PADDING * 2 > MAX_SIZE ||
            color.height + PADDING * 2 > MAX_SIZE) {
            throw new Error("Source texture exceeds the atlas size limit");
        }
        return { source, color, roughness, normal,
            width: color.width, height: color.height };
    }).sort((a, b) => b.height - a.height || b.width - a.width);

    const totalArea = records.reduce((sum, tile) =>
        sum + (tile.width + 2 * PADDING) *
        (tile.height + 2 * PADDING), 0);
    const atlasWidth = Math.min(MAX_SIZE, Math.max(
        powerOfTwo(Math.max(...records.map(r => r.width + 2 * PADDING))),
        powerOfTwo(Math.ceil(Math.sqrt(totalArea)))
    ));

    interface Placement {
        records: typeof records;
        x: number;
        y: number;
        shelfHeight: number;
    }
    const placements: Placement[] = [];
    let current: Placement = { records: [], x: 0, y: 0, shelfHeight: 0 };
    placements.push(current);

    for (const record of records) {
        const tileWidth = record.width + PADDING * 2;
        const tileHeight = record.height + PADDING * 2;
        if (current.x + tileWidth > atlasWidth) {
            current.y += current.shelfHeight;
            current.x = 0;
            current.shelfHeight = 0;
        }
        if (current.y + tileHeight > MAX_SIZE) {
            current = { records: [], x: 0, y: 0, shelfHeight: 0 };
            placements.push(current);
        }
        // Store each rect's shelf coordinates while preserving its source.
        (record as typeof record & { x: number; y: number }).x = current.x;
        (record as typeof record & { x: number; y: number }).y = current.y;
        current.records.push(record);
        current.x += tileWidth;
        current.shelfHeight = Math.max(current.shelfHeight, tileHeight);
    }

    const tiles = new Map<string, AtlasTile>();
    const pages = placements.map((placement, pageNumber): AtlasPage => {
        const height = powerOfTwo(
            placement.y + placement.shelfHeight
        );
        const color = createCanvas(atlasWidth, height);
        const roughness = createCanvas(atlasWidth, height);
        const normal = createCanvas(atlasWidth, height);
        const pageTiles: AtlasTile[] = [];

        for (const record of placement.records) {
            const placed = record as typeof record & { x: number; y: number };
            const tile: AtlasTile = {
                id: record.source.id,
                page: pageNumber,
                x: placed.x,
                y: placed.y,
                width: record.width,
                height: record.height
            };
            tiles.set(tile.id, tile);
            pageTiles.push(tile);
            paintTile(color.context, record.color, tile);
            paintTile(roughness.context, record.roughness, tile);
            paintTile(normal.context, record.normal, tile);
        }

        const makeMap = (canvas: HTMLCanvasElement, space: THREE.ColorSpace) => {
            const map = new THREE.CanvasTexture(canvas);
            map.colorSpace = space;
            map.wrapS = THREE.ClampToEdgeWrapping;
            map.wrapT = THREE.ClampToEdgeWrapping;
            map.anisotropy = 8;
            return map;
        };

        return {
            width: atlasWidth, height,
            tiles: pageTiles,
            color: makeMap(color.canvas, THREE.SRGBColorSpace),
            roughness: makeMap(roughness.canvas, THREE.NoColorSpace),
            normal: makeMap(normal.canvas, THREE.NoColorSpace)
        };
    });

    return { pages, tiles };
}

/**
 * UVs on the source are measured in texture repetitions, whereas atlas
 * UVs are normalized to the full sheet. Canvas images are stored top-down;
 * Three.js CanvasTexture flips Y when sampling, so the cell's V origin
 * is measured from the BOTTOM of the atlas.
 */
export function atlasUv(
    tile: AtlasTile,
    page: AtlasPage,
    repeatU: number,
    repeatV: number
): THREE.Vector2 {
    return new THREE.Vector2(
        (tile.x + PADDING + repeatU * tile.width) / page.width,
        (page.height - tile.y - PADDING - tile.height +
            repeatV * tile.height) / page.height
    );
}
