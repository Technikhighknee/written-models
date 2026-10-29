import * as THREE from "three";

import { boxMesh } from "../../toolbox/geometry/construction/boxMesh";
import { beamBetweenPlanes } from "../../toolbox/geometry/construction/beamBetweenPlanes";
import {
    geometryResult, type GeometryResult
} from "../../toolbox/geometry/kernel/GeometryResult";
import type {
    TimberContactNormals
} from "../../toolbox/geometry/construction/timber";

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
    contacts?: TimberContactNormals
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
        return {
            geometry: geometryResult(beamBetweenPlanes({
                start: { point: from, normal: contacts.startNormal },
                end: { point: to, normal: contacts.endNormal },
                width, depth
            })),
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
