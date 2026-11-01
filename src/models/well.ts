import * as THREE from "three";

import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { weightedCuts } from "../toolbox/spatial/layout/weightedCuts";
import { seededVariation } from "../toolbox/spatial/layout/seededVariation";
import { limestoneVariant } from "../materials/stone/limestone";

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
    // Each stone selects a shared limestone finish, not a unique texture.
    // The coping is slightly lighter than the wall courses.
    const finish = Math.min(4,
        Math.floor((vary(20) + 1) * 2) + Number(coping)
    );
    const surface = `stone-${finish}`;

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

    // Limestone UVs are authored in metres. Vary each block's texture
    // window so the same mineral pattern does not repeat at every joint.
    const u0 = 0.09 + (vary(18) + 1) * 0.13;
    const v0 = 0.08 + (vary(19) + 1) * 0.13;
    const u = (col: number) => u0 +
        (angles[col]! - from) * outerRadius;
    const v = (row: number) => v0 +
        (heights[row]! - bottom);
    const radiusV = (outside: boolean) =>
        v0 + (outside ? 0 : outerRadius - innerRadius);
    const uv = (u: number, v: number) => new THREE.Vector2(u, v);
    const quad = (ids: number[], uv: readonly THREE.Vector2[]) => {
        mesh.addIndexedFace(ids, uv, surface);
    };

    for (let row = 0; row < heights.length - 1; row++) {
        for (let col = 0; col < angles.length - 1; col++) {
            quad([
                outer[row]![col]!, outer[row]![col + 1]!,
                outer[row + 1]![col + 1]!, outer[row + 1]![col]!
            ], [
                uv(u(col), v(row)), uv(u(col + 1), v(row)),
                uv(u(col + 1), v(row + 1)), uv(u(col), v(row + 1))
            ]);
            quad([
                inner[row + 1]![col]!, inner[row + 1]![col + 1]!,
                inner[row]![col + 1]!, inner[row]![col]!
            ], [
                uv(u(col), v(row + 1)), uv(u(col + 1), v(row + 1)),
                uv(u(col + 1), v(row)), uv(u(col), v(row))
            ]);
        }
    }

    const last = heights.length - 1;
    for (let col = 0; col < angles.length - 1; col++) {
        quad([
            outer[last]![col]!, outer[last]![col + 1]!,
            inner[last]![col + 1]!, inner[last]![col]!
        ], [
            uv(u(col), radiusV(true)),
            uv(u(col + 1), radiusV(true)),
            uv(u(col + 1), radiusV(false)),
            uv(u(col), radiusV(false))
        ]);
        quad([
            inner[0]![col]!, inner[0]![col + 1]!,
            outer[0]![col + 1]!, outer[0]![col]!
        ], [
            uv(u(col), radiusV(false)),
            uv(u(col + 1), radiusV(false)),
            uv(u(col + 1), radiusV(true)),
            uv(u(col), radiusV(true))
        ]);
    }

    for (let row = 0; row < last; row++) {
        quad([
            inner[row]![0]!, outer[row]![0]!,
            outer[row + 1]![0]!, inner[row + 1]![0]!
        ], [
            uv(u0, radiusV(false)), uv(u0 + outerRadius - innerRadius, radiusV(false)),
            uv(u0 + outerRadius - innerRadius, radiusV(false) + (v(row + 1) - v0)),
            uv(u0, radiusV(false) + (v(row + 1) - v0))
        ]);
        const endColumn = angles.length - 1;
        quad([
            outer[row]![endColumn]!, inner[row]![endColumn]!,
            inner[row + 1]![endColumn]!, outer[row + 1]![endColumn]!
        ], [
            uv(u0, radiusV(false)), uv(u0 + outerRadius - innerRadius, radiusV(false)),
            uv(u0 + outerRadius - innerRadius, radiusV(false) + (v(row + 1) - v0)),
            uv(u0, radiusV(false) + (v(row + 1) - v0))
        ]);
    }
}

function addCourse(
    mesh: AuthoredMeshBuilder, course: StoneCourse
): void {
    const weights = Array.from({ length: course.count }, (_, index) =>
        1 + seededVariation(course.seed, index, 23) * 0.23
    );
    const cuts = weightedCuts(course.shift, course.shift + TAU,
        course.count, weights);
    for (let i = 0; i < course.count; i++) {
        addStone(mesh, course, i, cuts[i]!, cuts[i + 1]!);
    }
}

/** A recessed mortar body supports the real stone gaps without fake grout lines. */
function addMortarRing(
    mesh: AuthoredMeshBuilder,
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
        const uv = (u: number, v: number) => new THREE.Vector2(u, v);
        mesh.addIndexedFace([
            outerBottom[i]!, outerBottom[next]!,
            outerTop[next]!, outerTop[i]!
        ], [uv(u0, 0), uv(u1, 0), uv(u1, 1), uv(u0, 1)], "mortar");
        mesh.addIndexedFace([
            innerTop[i]!, innerTop[next]!,
            innerBottom[next]!, innerBottom[i]!
        ], [uv(u0, 1), uv(u1, 1), uv(u1, 0), uv(u0, 0)], "mortar");
        mesh.addIndexedFace([
            outerTop[i]!, outerTop[next]!,
            innerTop[next]!, innerTop[i]!
        ], [uv(u0, 1), uv(u1, 1), uv(u1, 0), uv(u0, 0)], "mortar");
        mesh.addIndexedFace([
            innerBottom[i]!, innerBottom[next]!,
            outerBottom[next]!, outerBottom[i]!
        ], [uv(u0, 0), uv(u1, 0), uv(u1, 1), uv(u0, 1)], "mortar");
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
    const mesh = new AuthoredMeshBuilder({ weld: "none" });

    addMortarRing(mesh, 0.671, 0.558, 0.011, 0.476);
    addMortarRing(mesh, 0.707, 0.527, 0.452, 0.515);
    for (const course of COURSES) addCourse(mesh, course);
    addWater(mesh);

    return surfaceMesh({
        name: "VillageWell",
        geometry: geometryResult(mesh.build()),
        materials: {
            ...Object.fromEntries(
                Array.from({ length: 5 }, (_, i) => [
                    `stone-${i}`, limestoneVariant(i)
                ])
            ),
            mortar: new THREE.MeshStandardMaterial({
                name: "WellMortar",
                color: "#3c3731",
                roughness: 1,
                metalness: 0
            }),
            water: new THREE.MeshStandardMaterial({
                name: "WellWater",
                color: "#167ed5",
                roughness: 1,
                metalness: 0
            })
        }
    });
}
