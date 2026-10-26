import * as THREE from "three";
import { createBeamBetween } from "./beams";
import { beamBetweenPlanes } from "./beamBetweenPlanes";
import { toBufferGeometry } from "../mesh/toBufferGeometry";
import { offsetMeshUvs } from "../uv/offsetMeshUvs";

export interface TimberFaces {
    /** Long-grain material on the four sides of a timber. */
    face: THREE.Material;
    /** True cross-cut material on both ends of a timber. */
    endGrain: THREE.Material;
}

/**
 * A wood beam with a defined fiber axis (from start to end).
 *
 * createBeamBetween() already aligns local +Y with that axis. BoxGeometry
 * material slots are +X, -X, +Y, -Y, +Z, -Z, so ONLY the local +/-Y
 * faces are end grain, regardless of where or how the beam is rotated.
 * Long-face UVs use physical meters with V following the fiber.
 */
export function createTimberBetween(
    start: THREE.Vector3Like,
    end: THREE.Vector3Like,
    width: number,
    depth: number,
    faces: TimberFaces,
    uvOffset: { u: number; v: number } = { u: 0, v: 0 }
): THREE.Mesh {
    if (
        !Number.isFinite(uvOffset.u) || !Number.isFinite(uvOffset.v) ||
        !Number.isFinite(width) || !Number.isFinite(depth) ||
        width <= 0 || depth <= 0
    ) {
        throw new RangeError("Invalid timber dimensions or UV offset");
    }

    const mesh = createBeamBetween(start, end, width, depth, [
        faces.face, faces.face,
        faces.endGrain, faces.endGrain,
        faces.face, faces.face
    ]);

    const uv = mesh.geometry.getAttribute("uv");

    for (let index = 0; index < uv.count; index++) {
        uv.setXY(
            index,
            uv.getX(index) + uvOffset.u,
            uv.getY(index) + uvOffset.v
        );
    }
    uv.needsUpdate = true;

    return mesh;
}

/** Exposed normals of the two supports that a timber joins. */
export interface TimberContactNormals {
    startNormal: THREE.Vector3Like;
    endNormal: THREE.Vector3Like;
}

/**
 * A timber with two geometrically fitted cuts instead of square box ends.
 *
 * `start` and `end` are points ON the supporting planes. The supplied
 * normals face the free space occupied by the beam. Use this for diagonal
 * braces meeting different kinds of timber faces (e.g. foot and upright).
 *
 * Unlike createTimberBetween(), this mesh is expressed directly in the
 * containing assembly's local coordinate space, so its position stays zero.
 */
export function createTimberBetweenContacts(
    start: THREE.Vector3Like,
    end: THREE.Vector3Like,
    width: number,
    depth: number,
    faces: TimberFaces,
    contacts: TimberContactNormals,
    uvOffset: { u: number; v: number } = { u: 0, v: 0 }
): THREE.Mesh {
    const geometry = beamBetweenPlanes({
        start: { point: start, normal: contacts.startNormal },
        end: { point: end, normal: contacts.endNormal },
        width,
        depth
    });

    offsetMeshUvs(geometry, uvOffset.u, uvOffset.v);

    return new THREE.Mesh(
        toBufferGeometry(geometry, {
            "side-0": 0,
            "side-1": 0,
            "side-2": 0,
            "side-3": 0,
            "cap-start": 1,
            "cap-end": 1
        }),
        [faces.face, faces.endGrain]
    );
}
