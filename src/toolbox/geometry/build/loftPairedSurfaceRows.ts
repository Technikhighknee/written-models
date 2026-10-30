import * as THREE from "three";

import type { MeshData, QuadFace, TriangleFace } from "../mesh/MeshData";
import { loftSideQuads } from "./loftSideQuads";
import { bridgeBoundaries } from "./bridgeBoundaries";
import { geometryResult, type GeometryResult } from "../kernel/GeometryResult";

/** Open, corresponding surface rows, both ordered from the same end. */
export interface PairedSurfaceSection {
    outer: readonly THREE.Vector3Like[];
    inner: readonly THREE.Vector3Like[];
}

function stations(points: readonly THREE.Vector3Like[]): number[] {
    const distances = [0];
    for (let index = 1; index < points.length; index++) {
        const a = points[index - 1]!;
        const b = points[index]!;
        distances.push(
            distances.at(-1)! + Math.hypot(
                a.x - b.x, a.y - b.y, a.z - b.z
            )
        );
    }
    const length = distances.at(-1)!;
    if (!(length > 0)) {
        throw new RangeError("Collapsed surface row");
    }
    return distances.map(value => value / length);
}

/**
 * Close two independently sampled surface strips into one authored solid.
 *
 * The walls use the common quad-strip loft. Every end transition is the
 * actual generic boundary bridge, with no separate cap-stitch algorithm.
 * All authored face corners are remapped to the same shared section
 * vertices rather than welding coincident, independently generated meshes.
 */
export function loftPairedSurfaceRows(
    sections: readonly PairedSurfaceSection[]
): GeometryResult {
    const outerCount = sections[0]?.outer.length ?? 0;
    const innerCount = sections[0]?.inner.length ?? 0;

    if (
        sections.length < 2 || outerCount < 2 || innerCount < 2 ||
        sections.some(section =>
            section.outer.length !== outerCount ||
            section.inner.length !== innerCount
        )
    ) {
        throw new RangeError("Paired strips require consistent sampled rows");
    }

    const size = outerCount + innerCount;
    const rings = sections.map(section => [
        ...section.outer, ...section.inner.slice().reverse()
    ].map(p => new THREE.Vector3(p.x, p.y, p.z)));

    const surface = (edge: number) =>
        edge < outerCount - 1 ? "outer" :
        edge === outerCount - 1 ? "edge-right" :
        edge < size - 1 ? "inner" : "edge-left";

    const { vertices, quads } = loftSideQuads({
        rings,
        uvMode: "perimeter",
        travelMode: "first",
        surface,
        smoothingGroup: edge => {
            const region = surface(edge);
            return region === "outer" || region === "inner"
                ? region : undefined;
        }
    });
    const triangles: TriangleFace[] = [];

    for (const [row, region, reverseWinding] of [
        [0, "cap-start", false],
        [sections.length - 1, "cap-end", true]
    ] as const) {
        const section = sections[row]!;
        const bridge = bridgeBoundaries(
            { points: section.outer, closed: false },
            { points: section.inner, closed: false },
            {
                fromStations: stations(section.outer),
                toStations: stations(section.inner),
                reverseWinding,
                region
            }
        );
        const id = (index: number) => row * size + (
            index < outerCount ? index :
            size - 1 - (index - outerCount)
        );

        for (const quad of bridge.geometry.quads) {
            quads.push({
                ...quad,
                corners: quad.corners.map(id) as QuadFace["corners"]
            });
        }
        for (const triangle of bridge.geometry.triangles ?? []) {
            triangles.push({
                ...triangle,
                corners: triangle.corners.map(id) as TriangleFace["corners"]
            });
        }
    }

    const mesh: MeshData = triangles.length
        ? { vertices, quads, triangles }
        : { vertices, quads };
    return geometryResult(mesh);
}
