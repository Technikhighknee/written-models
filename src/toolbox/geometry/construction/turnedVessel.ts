import { latheMeridian } from "./latheMeridian";
import type { MeridianPoint } from "./latheMeridian";
import type { MeshData } from "../mesh/MeshData";

export interface VesselControlPoint {
    /** Height above the underside, in metres. */
    y: number;
    /** Outer radius, in metres. */
    radius: number;
}

export interface TurnedVesselOptions {
    /** A small number of authored outer silhouette landmarks, bottom first. */
    outline: readonly VesselControlPoint[];
    wallThickness: number;
    floorThickness: number;
    radialSegments?: number;
    samplesPerSpan?: number;
    /** Half-circle of rounded clay joining outer and inner walls. */
    rolledRim?: boolean;
    /** Shallow, circumferential grooves cut by turning tools. */
    turning?: { from: number; to: number; pitch: number; depth: number };
    /** Periodic pinches around the lower outside edge. */
    footImpressions?: { count: number; depth: number; height: number };
}

/**
 * Hollow, open-topped vessel with a REAL interior, a solid flat bottom,
 * and a connected lip. All surfaces belong to one continuous control mesh.
 *
 * The outer outline is interpolated by shape-preserving cubic Hermite
 * curves, so a small number of landmarks gives a smooth thrown body
 * without overshooting its intended diameter. Curvature and all rings
 * remain authored geometry and export through the ordinary mesh pipeline.
 */
export function turnedVessel({
    outline, wallThickness, floorThickness,
    radialSegments = 40, samplesPerSpan = 6,
    rolledRim = true, turning, footImpressions
}: TurnedVesselOptions): MeshData {
    if (outline.length < 2 || !Number.isInteger(samplesPerSpan) ||
        samplesPerSpan < 1 || samplesPerSpan > 40 ||
        !Number.isFinite(wallThickness) || wallThickness <= 0 ||
        !Number.isFinite(floorThickness) || floorThickness <= 0 ||
        outline.some((p, i) => !Number.isFinite(p.y) ||
            !Number.isFinite(p.radius) || p.radius <= wallThickness ||
            (i > 0 && p.y <= outline[i - 1]!.y)) ||
        outline[0]!.y !== 0 ||
        floorThickness >= outline.at(-1)!.y) {
        throw new RangeError("Invalid vessel outline or wall dimensions");
    }
    if (turning && (
        ![turning.from, turning.to, turning.pitch, turning.depth]
            .every(Number.isFinite) ||
        turning.from <= 0 || turning.to >= outline.at(-1)!.y ||
        turning.to <= turning.from || turning.pitch <= 0 ||
        turning.depth < 0 || turning.depth >= wallThickness / 2
    )) {
        throw new RangeError("Invalid turning detail");
    }
    if (footImpressions && (
        !Number.isInteger(footImpressions.count) || footImpressions.count < 3 ||
        ![footImpressions.depth, footImpressions.height]
            .every(Number.isFinite) ||
        footImpressions.depth < 0 || footImpressions.height <= 0 ||
        footImpressions.depth >= outline[0]!.radius / 2
    )) {
        throw new RangeError("Invalid foot impression");
    }

    const slopes = outline.slice(0, -1).map((point, index) => {
        const next = outline[index + 1]!;
        return (next.radius - point.radius) / (next.y - point.y);
    });
    const tangents = outline.map((_, index) => {
        if (index === 0) return slopes[0]!;
        if (index === outline.length - 1) return slopes.at(-1)!;
        const a = slopes[index - 1]!;
        const b = slopes[index]!;
        if (a * b <= 0) return 0;
        return 2 * a * b / (a + b);
    });

    function radiusAt(y: number): number {
        const clipped = Math.min(outline.at(-1)!.y, Math.max(0, y));
        let i = 0;
        while (i < outline.length - 2 && clipped > outline[i + 1]!.y) i++;
        const from = outline[i]!;
        const to = outline[i + 1]!;
        const width = to.y - from.y;
        const t = (clipped - from.y) / width;
        const t2 = t * t;
        const t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * from.radius +
            (t3 - 2 * t2 + t) * width * tangents[i]! +
            (-2 * t3 + 3 * t2) * to.radius +
            (t3 - t2) * width * tangents[i + 1]!;
    }

    const maxY = outline.at(-1)!.y;
    const heights = new Set<number>([0, floorThickness, maxY]);
    for (let index = 0; index < outline.length - 1; index++) {
        const from = outline[index]!;
        const to = outline[index + 1]!;
        for (let s = 0; s <= samplesPerSpan; s++) {
            heights.add(from.y + (to.y - from.y) * s / samplesPerSpan);
        }
    }
    if (turning) {
        const samples = Math.ceil((turning.to - turning.from) /
            (turning.pitch / 4));
        for (let s = 0; s <= samples; s++) {
            heights.add(turning.from +
                (turning.to - turning.from) * s / samples);
        }
    }
    const ys = [...heights].sort((a, b) => a - b).filter(
        (value, index, all) => index === 0 || value - all[index - 1]! > 1e-8
    );

    function outerRadius(y: number): number {
        const base = radiusAt(y);
        if (!turning || y < turning.from || y > turning.to) return base;
        const t = (y - turning.from) / (turning.to - turning.from);
        // Fade both ends so the turned section meets the plain clay cleanly.
        const fade = Math.sin(Math.PI * t) ** 2;
        const turn = Math.cos(2 * Math.PI * (y - turning.from) / turning.pitch);
        return base - turning.depth * Math.max(0, turn) ** 4 * fade;
    }

    const points: MeridianPoint[] = [{radius: 0, y: 0, surface: "base"}];
    // Flat underside, shallow pinched foot, then continuous exterior.
    for (const y of ys) {
        const flange = footImpressions && y < footImpressions.height
            ? {
                lobes: footImpressions.count,
                depth: footImpressions.depth *
                    (1 - y / footImpressions.height) ** 2
            }
            : undefined;
        points.push({
            radius: outerRadius(y), y,
            surface: "outer",
            smoothingGroup: "outside",
            ...(flange === undefined ? {} : {radialWave: flange})
        });
    }
    // Rim: a semicircular cross-section, open through its centre.
    if (rolledRim) {
        for (let i = 1; i <= 4; i++) {
            const angle = Math.PI * i / 4;
            points.push({
                radius: radiusAt(maxY) - wallThickness / 2 +
                    wallThickness / 2 * Math.cos(angle),
                y: maxY + wallThickness / 2 * Math.sin(angle),
                surface: i === 4 ? "inner" : "rim",
                smoothingGroup: "lip"
            });
        }
        // The exterior's last outgoing segment is also the lip.
        points[ys.length]!.surface = "rim";
    } else {
        points[ys.length]!.surface = "rim";
        points.push({radius: radiusAt(maxY) - wallThickness,
            y: maxY, surface: "inner", smoothingGroup: "inside"});
    }
    // Follow the INNER silhouette downward; do not carry exterior flutes
    // or surface turning marks into the drinking cavity.
    const inward = ys.filter(y => y >= floorThickness && y < maxY).reverse();
    if (!inward.includes(floorThickness)) inward.push(floorThickness);
    for (const y of inward) {
        points.push({
            radius: radiusAt(y) - wallThickness,
            y, surface: "inner", smoothingGroup: "inside"
        });
    }
    points.at(-1)!.surface = "floor";
    points.push({radius: 0, y: floorThickness});
    return latheMeridian(points, radialSegments);
}
