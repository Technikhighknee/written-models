import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { loftSections } from "./loftSections";
import { sectionsBetweenPlanes } from "./sectionsBetweenPlanes";
import type { ContactPlane } from "./sectionsBetweenPlanes";

export type BeamContactPlane = ContactPlane;

export interface BeamBetweenPlanesOptions {
    start: BeamContactPlane;
    end: BeamContactPlane;
    width: number;
    depth: number;
}

/**
 * Quad-only rectangular member with two plane-fitted ends.
 * The actual fitting is section-agnostic and belongs to the reusable
 * sectionsBetweenPlanes operation. This constructor merely supplies
 * a rectangular cross-section with physical dimensions.
 */
export function beamBetweenPlanes({
    start, end, width, depth
}: BeamBetweenPlanesOptions): MeshData {
    if (![width, depth].every(Number.isFinite) ||
        width <= 0 || depth <= 0) {
        throw new RangeError("Invalid rectangular section dimensions");
    }
    const sections = sectionsBetweenPlanes({
        start, end,
        section: [
            new THREE.Vector2(-width / 2, -depth / 2),
            new THREE.Vector2(-width / 2, depth / 2),
            new THREE.Vector2(width / 2, depth / 2),
            new THREE.Vector2(width / 2, -depth / 2)
        ]
    });
    return loftSections(sections);
}
