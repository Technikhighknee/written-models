import * as THREE from "three";

import { fitBetweenSurfaces, type SurfaceAttachment } from
    "../../toolbox/geometry/queries/fitBetweenSurfaces";
import { loftSectionWalls } from "../../toolbox/geometry/build/loftSectionWalls";
import { capBoundary } from "../../toolbox/geometry/build/finishBoundaries";
import type {
    Section3, ContactNormals
} from "../../toolbox/geometry/definitions/geometry";
import { boxMesh } from "../../toolbox/geometry/construction/boxMesh";
import { sectionsBetweenPlanes } from "../../toolbox/geometry/construction/sectionsBetweenPlanes";
import {
    geometryResult, type GeometryResult
} from "../../toolbox/geometry/kernel/GeometryResult";

export interface TableTimberGeometry {
    geometry: GeometryResult;
    /** Transform from the authored part to its containing trestle. */
    localToParent: THREE.Matrix4;
    /** Contact-fitted timbers use side-N; straight members use box faces. */
    fitted: boolean;
}

/**
 * Geometry of a rectangular member, independent of timber materials.
 * Square-cut members retain local axial coordinates, while fitted members
 * are shaped directly between their two authored contact planes.
 */
export function tableTimberGeometry(
    start: THREE.Vector3Like,
    end: THREE.Vector3Like,
    width: number,
    depth: number,
    contacts?: ContactNormals
): TableTimberGeometry {
    const from = new THREE.Vector3(start.x, start.y, start.z);
    const to = new THREE.Vector3(end.x, end.y, end.z);
    const direction = to.clone().sub(from);
    const length = direction.length();

    if (!Number.isFinite(length) || !(length > 0) ||
        ![width, depth].every(Number.isFinite) ||
        width <= 0 || depth <= 0) {
        throw new RangeError("Invalid rectangular timber dimensions");
    }

    if (contacts) {
        const sections = sectionsBetweenPlanes({
            start: { point: from, normal: contacts.startNormal },
            end: { point: to, normal: contacts.endNormal },
            section: [
                new THREE.Vector2(-width / 2, -depth / 2),
                new THREE.Vector2(-width / 2, depth / 2),
                new THREE.Vector2(width / 2, depth / 2),
                new THREE.Vector2(width / 2, -depth / 2)
            ]
        });

        return {
            geometry: closeTimberSections(sections.map(points => ({
                outer: { points, closed: true }
            }))),
            localToParent: new THREE.Matrix4(),
            fitted: true
        };
    }

    const rotation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), direction.divideScalar(length)
    );

    return {
        geometry: geometryResult(boxMesh({
            width, height: length, depth
        })),
        localToParent: new THREE.Matrix4().compose(
            from.add(to).multiplyScalar(0.5),
            rotation, new THREE.Vector3(1, 1, 1)
        ),
        fitted: false
    };
}

export interface FittedTableTimberOptions {
    first: SurfaceAttachment;
    last: SurfaceAttachment;
    width: number;
    depth: number;
    referenceDirection: THREE.Vector3Like;
}

function endFrame(section: Section3): THREE.Matrix4 {
    const points = section.outer.points;
    const a = new THREE.Vector3().copy(points[0]!);
    const b = new THREE.Vector3().copy(points[1]!);
    const c = new THREE.Vector3().copy(points[2]!);
    const x = b.sub(a).normalize();
    const normal = new THREE.Vector3().copy(points[1]!).sub(a)
        .cross(c.sub(a)).normalize();
    const y = new THREE.Vector3().crossVectors(normal, x).normalize();

    return new THREE.Matrix4().makeBasis(x, y, normal).setPosition(a);
}

/** Close the authored sections for both plane- and surface-fitted timbers. */
function closeTimberSections(sections: readonly Section3[]): GeometryResult {
    let geometry = loftSectionWalls(sections, {
        uvMode: "edge",
        surfaceAt: ({edge}) => `side-${edge}`
    });

    for (const [name, section] of [
        ["start", sections[0]!],
        ["end", sections[sections.length - 1]!]
    ] as const) {
        geometry = capBoundary(
            geometry,
            geometry.boundaries[`${name}-outer`]![0]!,
            {
                region: `cap-${name}`,
                uvFrame: endFrame(section),
                tessellation: "quad-if-planar"
            }
        );
    }

    return geometry;
}

/**
 * Fit an entire rectangular section, not just its centerline, between
 * two finite authored contact patches. Each end is capped on its actual
 * support plane; all six surfaces retain construction quads.
 */
export function tableTimberBetweenSurfaces({
    first, last, width, depth, referenceDirection
}: FittedTableTimberOptions): TableTimberGeometry {
    if (![width, depth].every(value =>
        Number.isFinite(value) && value > 0
    )) {
        throw new RangeError("Invalid fitted timber section");
    }

    const result = fitBetweenSurfaces({
        start: first,
        end: last,
        section: {
            outer: {
                closed: true,
                points: [
                    new THREE.Vector2(-width / 2, -depth / 2),
                    new THREE.Vector2(width / 2, -depth / 2),
                    new THREE.Vector2(width / 2, depth / 2),
                    new THREE.Vector2(-width / 2, depth / 2)
                ]
            }
        },
        referenceDirection
    });
    return {
        geometry: closeTimberSections(result.sections),
        localToParent: new THREE.Matrix4(),
        fitted: true
    };
}
