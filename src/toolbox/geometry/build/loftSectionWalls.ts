import * as THREE from "three";
import type { Section3 } from "../definitions/geometry";
import type { MeshData, QuadFace } from "../mesh/MeshData";
import {
    geometryResult,
    type BoundaryRef,
    type GeometryResult
} from "../kernel/GeometryResult";
import { resolvePrecision, type GeometryPrecision } from "../kernel/precision";
import { loftSideQuads } from "./loftSideQuads";

export interface LoftWallFace {
    /** Outer loop is 0; inner loops follow their authored order. */
    loop: number;
    edge: number;
    interval: number;
}

export interface LoftSectionWallsOptions {
    outerRegion?: string;
    innerRegions?: readonly string[];
    surfaceAt?: (face: LoftWallFace) => string;
    smoothingGroupAt?: (face: LoftWallFace) => string | undefined;
    precision?: GeometryPrecision;
}

function ringNormal(points: readonly THREE.Vector3Like[]): THREE.Vector3 {
    const normal = new THREE.Vector3();

    for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;

        normal.x += (a.y - b.y) * (a.z + b.z);
        normal.y += (a.z - b.z) * (a.x + b.x);
        normal.z += (a.x - b.x) * (a.y + b.y);
    }

    if (!(normal.lengthSq() > 0)) {
        throw new RangeError("Loft contour has no defined orientation");
    }

    return normal.normalize();
}

/**
 * Compose outer and inner wall strips from the same authored quad engine.
 * Ends intentionally remain open for the cap construction operation.
 */
export function loftSectionWalls(
    sections: readonly Section3[],
    {
        outerRegion = "outer",
        innerRegions = [],
        surfaceAt,
        smoothingGroupAt,
        precision
    }: LoftSectionWallsOptions = {}
): GeometryResult {
    const policy = resolvePrecision(precision);

    if (sections.length < 2) {
        throw new RangeError("Loft needs at least two sections");
    }

    const first = sections[0]!;
    const innerCount = first.inner?.length ?? 0;
    const outerCount = first.outer.points.length;
    const innerSizes = (first.inner ?? []).map(contour => contour.points.length);

    if (
        outerCount < 3 ||
        innerSizes.some(count => count < 3) ||
        sections.some(section =>
            !section.outer.closed ||
            section.outer.points.length !== outerCount ||
            (section.inner?.length ?? 0) !== innerCount ||
            (section.inner ?? []).some((contour, index) =>
                !contour.closed || contour.points.length !== innerSizes[index]
            )
        )
    ) {
        throw new RangeError("Loft sections require matching closed contours");
    }

    for (const section of sections) {
        const outward = ringNormal(section.outer.points);

        for (const inner of section.inner ?? []) {
            const inward = ringNormal(inner.points);

            if (outward.dot(inward) >= -Math.sin(policy.angle)) {
                throw new RangeError("Loft inner contours must oppose outer winding");
            }
        }
    }

    const vertices: THREE.Vector3[] = [];
    const quads: QuadFace[] = [];
    const boundaries: Record<string, BoundaryRef[]> = Object.create(null);
    const ranges: {
        name: string;
        offset: number;
        sides: number;
        rows: number;
    }[] = [];

    for (let loop = 0; loop <= innerCount; loop++) {
        const rings = sections.map(section =>
            loop === 0
                ? section.outer.points
                : section.inner![loop - 1]!.points
        );

        const defaultRegion = loop === 0
            ? outerRegion
            : (innerRegions[loop - 1] ?? `inner-${loop - 1}`);

        const strips = loftSideQuads({
            rings,
            uvMode: "perimeter",
            surface: (edge, interval) =>
                surfaceAt?.({ loop, edge, interval }) ?? defaultRegion,
            smoothingGroup: (edge, interval) =>
                smoothingGroupAt?.({ loop, edge, interval }),
            minimumEdgeLength: policy.absoluteLength,
            minimumTravel: policy.absoluteLength
        });

        const offset = vertices.length;
        vertices.push(...strips.vertices);

        for (const quad of strips.quads) {
            quads.push({
                ...quad,
                corners: quad.corners.map(index => index + offset) as
                    QuadFace["corners"]
            });
        }

        ranges.push({
            name: loop === 0 ? "outer" : `inner-${loop - 1}`,
            offset,
            sides: rings[0]!.length,
            rows: rings.length
        });
    }

    const mesh: MeshData = { vertices, quads };
    const result = geometryResult(mesh, policy);

    for (const { name, offset, sides, rows } of ranges) {
        boundaries[`start-${name}`] = [{
            owner: result.id,
            vertices: Array.from({ length: sides }, (_, i) => offset + i),
            closed: true
        }];
        boundaries[`end-${name}`] = [{
            owner: result.id,
            vertices: Array.from(
                { length: sides },
                (_, i) => offset + (rows - 1) * sides + i
            ),
            closed: true
        }];
    }

    return { ...result, boundaries };
}
