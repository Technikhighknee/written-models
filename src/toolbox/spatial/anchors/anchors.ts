import * as THREE from "three";

export class Anchor extends THREE.Object3D {
    constructor(name: string) {
        super();

        if (!name.trim()) {
            throw new Error("Anchor has no name. Please call your local naming-authority (you).");
        }

        this.name = name;
    }
}

export interface AnchorOptions {
    position?: THREE.Vector3Like;
    rotation?: THREE.Quaternion;
}

export function addAnchor(
    owner: THREE.Object3D,
    name: string,
    {
        position = new THREE.Vector3(),
        rotation = new THREE.Quaternion()
    }: AnchorOptions = {}
): Anchor {
    if (owner.children.some(
        child => child instanceof Anchor && child.name === name
    )) {
        throw new Error(`Imposter anchor detected: ${name}`)
    }

    const anchor = new Anchor(name);

    anchor.position.copy(position);
    anchor.quaternion.copy(rotation);

    owner.add(anchor);

    return anchor;
}

export function getAnchor(
    owner: THREE.Object3D,
    name: string
): Anchor {
    const anchor = owner.children.find(
        child => child instanceof Anchor && child.name === name
    );

    if (!(anchor instanceof Anchor)) {
        throw new Error(`Don't know any anchor with the name ${name}`);
    }

    return anchor;
}