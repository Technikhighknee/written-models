import * as THREE from "three";

import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { weightedCuts } from "../toolbox/spatial/layout/weightedCuts";
import { seededVariation } from "../toolbox/spatial/layout/seededVariation";
import { wellFinish } from "../material-system/weatheredWell";
import type { PaintedAtlas } from "../material-system/paint";

const TAU = 2 * Math.PI;
const WATER_LEVEL = 0.42;

interface StoneCourse {
    bottom: number;
    top: number;
    count: number;
    seed: number;
    shift: number;
    coping?: boolean;
}

const COURSES: readonly StoneCourse[] = [
    { bottom: 0.010, top: 0.166, count: 13, seed: 217, shift: 0.07 },
    { bottom: 0.166, top: 0.324, count: 14, seed: 431, shift: 0.26 },
    { bottom: 0.324, top: 0.478, count: 15, seed: 683, shift: 0.04 },
    { bottom: 0.449, top: 0.532, count: 14, seed: 919, shift: 0.19,
        coping: true }
];

const point = (angle: number, radius: number, y: number) =>
    new THREE.Vector3(
        Math.sin(angle) * radius, y, Math.cos(angle) * radius
    );

/**
 * Each block is a closed, chamfered wedge of actual stone. The angular
 * stations create real facets and worn corners, not a masonry decal.
 */
function addStone(
    mesh: AuthoredMeshBuilder,
    atlas: PaintedAtlas,
    course: StoneCourse,
    index: number,
    start: number,
    end: number
): void {
    const vary = (channel: number) =>
        seededVariation(course.seed, index, channel);
    const gap = 0.0032;
    const from = start + gap;
    const to = end - gap;
    const angularSpan = to - from;
    const angles = [0, 0.13, 0.5, 0.87, 1]
        .map(t => from + angularSpan * t);
    const coping = course.coping === true;
    const outerRadius = (coping ? 0.746 : 0.706) + vary(0) * 0.010;
    const innerRadius = (coping ? 0.506 : 0.529) + vary(1) * 0.006;
    const bottom = course.bottom + 0.003 + vary(2) * 0.0015;
    const top = course.top - 0.003 + vary(3) * 0.002;
    const chamfer = coping ? 0.009 : 0.012;
    const heights = [bottom, bottom + chamfer, top - chamfer, top];
    const surface = coping ? "coping" : "stone";

    const outer: number[][] = [];
    const inner: number[][] = [];

    for (let row = 0; row < heights.length; row++) {
        const outside: number[] = [];
        const inside: number[] = [];
        for (let col = 0; col < angles.length; col++) {
            const endWear = col === 0 || col === angles.length - 1;
            const topWear = row === 0 || row === heights.length - 1;
            const facet = col === 2 ? vary(4) * 0.004 : vary(col + 5) * 0.002;
            const outerR = outerRadius + facet -
                (endWear ? 0.008 : 0) - (topWear ? 0.010 : 0);
            const innerR = innerRadius + (endWear ? 0.003 : 0) +
                (topWear ? 0.007 : 0) + vary(10 + col) * 0.0015;
            outside.push(mesh.addVertex(point(angles[col]!, outerR, heights[row]!)));
            inside.push(mesh.addVertex(point(angles[col]!, innerR, heights[row]!)));
        }
        outer.push(outside);
        inner.push(inside);
    }

    // Offset the texture window per block so its pigment patterns never
    // form artificial horizontal courses or repeat at the joints.
    const u0 = 0.09 + (vary(18) + 1) * 0.13;
    const v0 = 0.08 + (vary(19) + 1) * 0.13;
    const u = (col: number) => u0 +
        (angles[col]! - from) * outerRadius / 0.92;
    const v = (row: number) => v0 +
        (heights[row]! - bottom) / 0.48;
    const radiusV = (outside: boolean) => v0 + (outside ? 0 : 0.36);
    const texture = (uu: number, vv: number) => atlas.uv(surface, uu, vv);
    const quad = (ids: number[], uv: readonly THREE.Vector2[]) => {
        mesh.addIndexedFace(ids, uv, "well");
    };

    for (let row = 0; row < heights.length - 1; row++) {
        for (let col = 0; col < angles.length - 1; col++) {
            quad([
                outer[row]![col]!, outer[row]![col + 1]!,
                outer[row + 1]![col + 1]!, outer[row + 1]![col]!
            ], [
                texture(u(col), v(row)), texture(u(col + 1), v(row)),
                texture(u(col + 1), v(row + 1)), texture(u(col), v(row + 1))
            ]);
            quad([
                inner[row + 1]![col]!, inner[row + 1]![col + 1]!,
                inner[row]![col + 1]!, inner[row]![col]!
            ], [
                texture(u(col), v(row + 1)), texture(u(col + 1), v(row + 1)),
                texture(u(col + 1), v(row)), texture(u(col), v(row))
            ]);
        }
    }

    const last = heights.length - 1;
    for (let col = 0; col < angles.length - 1; col++) {
        quad([
            outer[last]![col]!, outer[last]![col + 1]!,
            inner[last]![col + 1]!, inner[last]![col]!
        ], [
            texture(u(col), radiusV(true)),
            texture(u(col + 1), radiusV(true)),
            texture(u(col + 1), radiusV(false)),
            texture(u(col), radiusV(false))
        ]);
        quad([
            inner[0]![col]!, inner[0]![col + 1]!,
            outer[0]![col + 1]!, outer[0]![col]!
        ], [
            texture(u(col), radiusV(false)),
            texture(u(col + 1), radiusV(false)),
            texture(u(col + 1), radiusV(true)),
            texture(u(col), radiusV(true))
        ]);
    }

    for (let row = 0; row < last; row++) {
        quad([
            inner[row]![0]!, outer[row]![0]!,
            outer[row + 1]![0]!, inner[row + 1]![0]!
        ], [
            texture(u0, radiusV(false)), texture(u0 + 0.34, radiusV(false)),
            texture(u0 + 0.34, radiusV(false) + (v(row + 1) - v0)),
            texture(u0, radiusV(false) + (v(row + 1) - v0))
        ]);
        const endColumn = angles.length - 1;
        quad([
            outer[row]![endColumn]!, inner[row]![endColumn]!,
            inner[row + 1]![endColumn]!, outer[row + 1]![endColumn]!
        ], [
            texture(u0, radiusV(false)), texture(u0 + 0.34, radiusV(false)),
            texture(u0 + 0.34, radiusV(false) + (v(row + 1) - v0)),
            texture(u0, radiusV(false) + (v(row + 1) - v0))
        ]);
    }
}

function addCourse(
    mesh: AuthoredMeshBuilder, atlas: PaintedAtlas, course: StoneCourse
): void {
    const weights = Array.from({ length: course.count }, (_, index) =>
        1 + seededVariation(course.seed, index, 23) * 0.23
    );
    const cuts = weightedCuts(course.shift, course.shift + TAU,
        course.count, weights);
    for (let i = 0; i < course.count; i++) {
        addStone(mesh, atlas, course, i, cuts[i]!, cuts[i + 1]!);
    }
}

/** A recessed mortar body supports the real stone gaps without fake grout lines. */
function addMortarRing(
    mesh: AuthoredMeshBuilder, atlas: PaintedAtlas,
    outerRadius: number, innerRadius: number,
    bottom: number, top: number
): void {
    const count = 40;
    const outerBottom: number[] = [];
    const outerTop: number[] = [];
    const innerBottom: number[] = [];
    const innerTop: number[] = [];
    for (let i = 0; i < count; i++) {
        const angle = i * TAU / count;
        outerBottom.push(mesh.addVertex(point(angle, outerRadius, bottom)));
        outerTop.push(mesh.addVertex(point(angle, outerRadius, top)));
        innerBottom.push(mesh.addVertex(point(angle, innerRadius, bottom)));
        innerTop.push(mesh.addVertex(point(angle, innerRadius, top)));
    }
    for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        const u0 = i / count;
        const u1 = (i + 1) / count;
        const uv = (u: number, v: number) => atlas.uv("mortar", u, v);
        mesh.addIndexedFace([
            outerBottom[i]!, outerBottom[next]!,
            outerTop[next]!, outerTop[i]!
        ], [uv(u0, 0), uv(u1, 0), uv(u1, 1), uv(u0, 1)], "well");
        mesh.addIndexedFace([
            innerTop[i]!, innerTop[next]!,
            innerBottom[next]!, innerBottom[i]!
        ], [uv(u0, 1), uv(u1, 1), uv(u1, 0), uv(u0, 0)], "well");
        mesh.addIndexedFace([
            outerTop[i]!, outerTop[next]!,
            innerTop[next]!, innerTop[i]!
        ], [uv(u0, 1), uv(u1, 1), uv(u1, 0), uv(u0, 0)], "well");
        mesh.addIndexedFace([
            innerBottom[i]!, innerBottom[next]!,
            outerBottom[next]!, outerBottom[i]!
        ], [uv(u0, 0), uv(u1, 0), uv(u1, 1), uv(u0, 1)], "well");
    }
}

function addWater(mesh: AuthoredMeshBuilder): void {
    const count = 40;
    const center = mesh.addVertex(point(0, 0, WATER_LEVEL));
    const rim = Array.from({ length: count }, (_, i) =>
        mesh.addVertex(point(i * TAU / count, 0.522, WATER_LEVEL))
    );
    for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        const uv = (angle: number) => new THREE.Vector2(
            0.5 + Math.sin(angle) * 0.48,
            0.5 + Math.cos(angle) * 0.48
        );
        mesh.addIndexedFace([
            center, rim[i]!, rim[next]!
        ], [
            new THREE.Vector2(0.5, 0.5),
            uv(i * TAU / count),
            uv(next * TAU / count)
        ], "water");
    }
}

export default {
    slug: "village-well",
    title: "Village Well",
    description: "A stone-built village well with a worn, uneven coping.",
    category: "architecture" as const,
    create
};

function create(): THREE.Mesh {
    const atlas = wellFinish();
    const mesh = new AuthoredMeshBuilder({ weld: "none" });

    addMortarRing(mesh, atlas, 0.671, 0.558, 0.011, 0.476);
    addMortarRing(mesh, atlas, 0.707, 0.527, 0.452, 0.515);
    for (const course of COURSES) addCourse(mesh, atlas, course);
    addWater(mesh);

    return surfaceMesh({
        name: "VillageWell",
        geometry: geometryResult(mesh.build()),
        materials: {
            well: atlas.material,
            water: new THREE.MeshStandardMaterial({
                name: "WellWater",
                color: "#167ed5",
                roughness: 1,
                metalness: 0
            })
        }
    });
}
