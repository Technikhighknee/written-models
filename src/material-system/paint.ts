import * as THREE from "three";

export type Point = readonly [number, number];

export interface Ink {
    color?: string;
    roughness?: number;
    height?: number;
    opacity?: number;
}

export interface Mark {
    x: number;
    y: number;
    rx: number;
    ry: number;
    rotation?: number;
}

const HEIGHT_SCALE = 5000;
const TAU = Math.PI * 2;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const byte = (value: number) => Math.round(Math.min(255, Math.max(0, value)));

function canvas(width: number, height: number): HTMLCanvasElement {
    const result = document.createElement("canvas");
    result.width = width;
    result.height = height;
    return result;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const result = canvas.getContext("2d");
    if (!result) throw new Error("A 2D canvas is required for material painting");
    return result;
}

/**
 * A small digital painting surface. Operations author color, roughness and
 * physical relief together, rather than independently inventing three maps.
 * Coordinates are normalized; (0, 0) is the top-left of the painted image.
 */
export class PaintedSurface {
    readonly color: HTMLCanvasElement;
    readonly roughness: HTMLCanvasElement;
    private readonly relief: HTMLCanvasElement;
    readonly width: number;
    readonly height: number;
    readonly physicalWidth: number;
    readonly physicalHeight: number;
    readonly tileX: boolean;

    constructor(
        width: number, height: number,
        physicalWidth: number, physicalHeight: number,
        base: string, roughness = 0.9,
        tileX = false
    ) {
        if (
            !Number.isInteger(width) || !Number.isInteger(height) ||
            width < 8 || height < 8 ||
            physicalWidth <= 0 || physicalHeight <= 0
        ) throw new RangeError("Invalid painted surface dimensions");

        this.width = width;
        this.height = height;
        this.physicalWidth = physicalWidth;
        this.physicalHeight = physicalHeight;
        this.tileX = tileX;
        this.color = canvas(width, height);
        this.roughness = canvas(width, height);
        this.relief = canvas(width, height);
        this.paint({ color: base, roughness, height: 0 }, ctx => {
            ctx.fillRect(0, 0, 1, 1);
        });
    }

    private paint(ink: Ink, draw: (ctx: CanvasRenderingContext2D) => void): void {
        const channels: readonly (readonly [HTMLCanvasElement, string | undefined])[] = [
            [this.color, ink.color],
            [this.roughness, ink.roughness === undefined
                ? undefined : `rgb(${byte(clamp(ink.roughness) * 255)} ${byte(clamp(ink.roughness) * 255)} ${byte(clamp(ink.roughness) * 255)})`],
            [this.relief, ink.height === undefined
                ? undefined : `rgb(${byte(128 + ink.height * HEIGHT_SCALE)} ${byte(128 + ink.height * HEIGHT_SCALE)} ${byte(128 + ink.height * HEIGHT_SCALE)})`]
        ];

        for (const [surface, pigment] of channels) {
            if (pigment === undefined) continue;
            const ctx = context(surface);
            ctx.save();
            ctx.setTransform(this.width, 0, 0, this.height, 0, 0);
            ctx.globalAlpha = clamp(ink.opacity ?? 1);
            ctx.fillStyle = pigment;
            ctx.strokeStyle = pigment;
            draw(ctx);
            ctx.restore();
        }
    }

    polygon(points: readonly Point[], ink: Ink): void {
        if (points.length < 3) throw new RangeError("A painted polygon needs three points");
        this.paint(ink, ctx => {
            ctx.beginPath();
            ctx.moveTo(points[0]![0], points[0]![1]);
            for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
            ctx.closePath();
            ctx.fill();
        });
    }

    stroke(points: readonly Point[], width: number, ink: Ink): void {
        if (points.length < 2 || width <= 0) return;
        this.paint(ink, ctx => {
            ctx.beginPath();
            ctx.moveTo(points[0]![0], points[0]![1]);
            for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
            ctx.lineWidth = width;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.stroke();
        });
    }

    marks(marks: readonly Mark[], ink: Ink): void {
        if (!marks.length) return;
        this.paint(ink, ctx => {
            ctx.beginPath();
            for (const mark of marks) {
                ctx.moveTo(mark.x + mark.rx, mark.y);
                ctx.ellipse(
                    mark.x, mark.y, Math.max(0.00001, mark.rx),
                    Math.max(0.00001, mark.ry), mark.rotation ?? 0,
                    0, TAU
                );
            }
            ctx.fill();
        });
    }

    normalCanvas(): HTMLCanvasElement {
        const pixels = context(this.relief).getImageData(
            0, 0, this.width, this.height
        ).data;
        const normal = canvas(this.width, this.height);
        const ctx = context(normal);
        const image = ctx.createImageData(this.width, this.height);
        const at = (x: number, y: number): number => {
            const column = this.tileX
                ? (x + this.width) % this.width
                : Math.min(this.width - 1, Math.max(0, x));
            const row = Math.min(this.height - 1, Math.max(0, y));
            return (pixels[(row * this.width + column) * 4]! - 128) / HEIGHT_SCALE;
        };
        const dx = this.physicalWidth / this.width;
        const dy = this.physicalHeight / this.height;

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const nx = (at(x - 1, y) - at(x + 1, y)) / (2 * dx);
                const ny = (at(x, y + 1) - at(x, y - 1)) / (2 * dy);
                const scale = 1 / Math.hypot(nx, ny, 1);
                const i = (y * this.width + x) * 4;
                image.data[i] = byte((nx * scale * 0.5 + 0.5) * 255);
                image.data[i + 1] = byte((ny * scale * 0.5 + 0.5) * 255);
                image.data[i + 2] = byte((scale * 0.5 + 0.5) * 255);
                image.data[i + 3] = 255;
            }
        }
        ctx.putImageData(image, 0, 0);
        return normal;
    }
}

export interface PaintedAtlas {
    material: THREE.MeshStandardMaterial;
    uv(panel: string, u: number, v: number): THREE.Vector2;
}

const PADDING = 4;

function place(
    target: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    x: number, y: number
): void {
    const w = source.width;
    const h = source.height;
    const p = PADDING;

    target.drawImage(source, x + p, y + p);
    target.drawImage(source, 0, 0, 1, h, x, y + p, p, h);
    target.drawImage(source, w - 1, 0, 1, h, x + p + w, y + p, p, h);
    target.drawImage(source, 0, 0, w, 1, x + p, y, w, p);
    target.drawImage(source, 0, h - 1, w, 1, x + p, y + p + h, w, p);
    for (const [sx, sy, dx, dy] of [
        [0, 0, x, y],
        [w - 1, 0, x + p + w, y],
        [0, h - 1, x, y + p + h],
        [w - 1, h - 1, x + p + w, y + p + h]
    ] as const) {
        target.drawImage(source, sx, sy, 1, 1, dx, dy, p, p);
    }
}

/**
 * Atlas assembly is separate from painting. Every panel gets its own
 * correctly scaled normals and a gutter; all panels share one PBR material.
 */
export function assemblePaintedAtlas(
    name: string,
    panels: readonly { name: string; surface: PaintedSurface }[]
): PaintedAtlas {
    if (!panels.length || new Set(panels.map(p => p.name)).size !== panels.length) {
        throw new RangeError("Paint atlas requires distinct panels");
    }

    const width = Math.max(...panels.map(p => p.surface.width)) + 2 * PADDING;
    const height = panels.reduce(
        (sum, p) => sum + p.surface.height + 2 * PADDING, 0
    );
    const colors = canvas(width, height);
    const roughness = canvas(width, height);
    const normals = canvas(width, height);
    const locations = new Map<string, { y: number; w: number; h: number }>();
    let y = 0;

    for (const panel of panels) {
        const surface = panel.surface;
        place(context(colors), surface.color, 0, y);
        place(context(roughness), surface.roughness, 0, y);
        place(context(normals), surface.normalCanvas(), 0, y);
        locations.set(panel.name, {
            y, w: surface.width, h: surface.height
        });
        y += surface.height + 2 * PADDING;
    }

    const texture = (source: HTMLCanvasElement, space: THREE.ColorSpace) => {
        const result = new THREE.CanvasTexture(source);
        result.colorSpace = space;
        result.wrapS = THREE.RepeatWrapping;
        result.wrapT = THREE.RepeatWrapping;
        result.anisotropy = 8;
        return result;
    };

    return {
        material: new THREE.MeshStandardMaterial({
            name,
            map: texture(colors, THREE.SRGBColorSpace),
            roughnessMap: texture(roughness, THREE.NoColorSpace),
            normalMap: texture(normals, THREE.NoColorSpace),
            roughness: 1,
            metalness: 0,
            normalScale: new THREE.Vector2(0.8, 0.8)
        }),
        uv(panel, u, v) {
            const location = locations.get(panel);
            if (!location) throw new RangeError(`Unknown paint panel: ${panel}`);
            return new THREE.Vector2(
                (PADDING + u * location.w) / width,
                (height - location.y - PADDING - location.h +
                    v * location.h) / height
            );
        }
    };
}

export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}
