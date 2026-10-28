import * as THREE from "three";
import {
    pointOnContactPlane,
    supportFacePlane
} from "./supportFacePlane";
import type {TimberContactNormals} from "./timber";

export interface SurfaceAttachment {
    /** An authored support mesh with planar contact faces. */
    target: THREE.Mesh;
    /** Intended joint location near the support, in assembly coordinates. */
    near: THREE.Vector3Like;
}

export interface FittedMember {
    start: THREE.Vector3;
    end: THREE.Vector3;
    contacts: TimberContactNormals;
}

/**
 * Determine both fitted ends of a member joining two actual mesh surfaces.
 *
 * The member's axis comes from the two intended joint positions. Each
 * support contributes its facing planar construction surface, and the
 * member's endpoints lie on those surfaces. Pass the returned contacts
 * into sectionsBetweenPlanes(), beamBetweenPlanes() or a timber factory.
 *
 * For non-planar support surfaces, use fitBoundaryToSurface() instead.
 */
export function fitBetweenSupports(
    first: SurfaceAttachment,
    last: SurfaceAttachment
): FittedMember {
    const startHint = new THREE.Vector3(
        first.near.x, first.near.y, first.near.z
    );
    const endHint = new THREE.Vector3(
        last.near.x, last.near.y, last.near.z
    );
    const axis = endHint.clone().sub(startHint);
    if (axis.lengthSq() <= 1e-12 || !Number.isFinite(axis.lengthSq())) {
        throw new RangeError("Fitted member requires distinct, finite endpoints");
    }

    const startPlane = supportFacePlane(first.target, axis);
    const endPlane = supportFacePlane(
        last.target, axis.clone().negate()
    );

    const start = pointOnContactPlane(startPlane, startHint, axis);
    const end = pointOnContactPlane(endPlane, endHint, axis);

    if (start.distanceToSquared(end) <= 1e-12) {
        throw new RangeError("Supporting faces leave no span for the member");
    }

    return {
        start,
        end,
        contacts: {
            startNormal: startPlane.normal,
            endNormal: endPlane.normal
        }
    };
}
