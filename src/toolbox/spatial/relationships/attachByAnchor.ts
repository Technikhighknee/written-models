import * as THREE from "three";
import type { Anchor } from "../anchors/anchors";
import { frameFromAncestor } from "../frames/frames";
import { attachAtFrames } from "./attachAtFrames";

const MATING_ROTATION = new THREE.Matrix4()
    .makeRotationX(Math.PI);

/**
 * Mate a descendant anchor onto a target anchor. The source may be
 * nested inside intermediate groups; the shared frame operation
 * handles the final hierarchy change and cycle validation.
 */
export function attachByAnchors<T extends THREE.Object3D>(
    targetAnchor: Anchor,
    child: T,
    sourceAnchor: Anchor
): T {
    if (sourceAnchor === child) {
        throw new Error("Source anchor must be a descendant of child");
    }

    return attachAtFrames({
        parent: targetAnchor,
        child,
        parentFrame: new THREE.Matrix4(),
        childFrame: frameFromAncestor(child, sourceAnchor),
        matingTransform: MATING_ROTATION
    });
}
