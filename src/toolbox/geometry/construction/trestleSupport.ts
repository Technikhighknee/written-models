import * as THREE from "three";

/** Timber assembled in the caller's coordinate system and material family. */
export type TrestleTimberFactory = (
    name: string,
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    depth: number
) => THREE.Mesh;

export interface TrestleSupportOptions {
    /** Height of the underside of the tabletop above the floor. */
    height: number;
    /** Length across the table (local Z) of the ground-bearing foot. */
    footLength: number;
    /** Length of the upper transverse bearer (local Z). */
    headLength: number;
    /** Size of the central upright in local X and Z. */
    postWidth: number;
    postDepth: number;
    /** Thickness in local X of the transverse timbers. */
    crossWidth: number;
    footHeight: number;
    headHeight: number;
    /** Square timber used for the pair of diagonal braces. */
    braceSize: number;
}

/**
 * Builds a robust, five-timber trestle frame in local Y/Z coordinates.
 *
 * Its origin is on the floor. The foot rests at Y=0 and the head ends
 * exactly at Y=height; both frames can be joined by a separate longitudinal
 * stretcher. Grain follows each timber's axis through the caller factory.
 *
 * No world-space attachment assumptions and no model-specific materials.
 */
export function createTrestleSupport(
    {
        height,
        footLength,
        headLength,
        postWidth,
        postDepth,
        crossWidth,
        footHeight,
        headHeight,
        braceSize
    }: TrestleSupportOptions,
    makeTimber: TrestleTimberFactory
): THREE.Group {
    const dimensions = [
        height, footLength, headLength, postWidth, postDepth, crossWidth,
        footHeight, headHeight, braceSize
    ];

    if (
        dimensions.some(n => !Number.isFinite(n) || n <= 0) ||
        footLength <= headLength * 0.75 ||
        headLength <= postDepth ||
        height <= footHeight + headHeight + braceSize * 3 ||
        braceSize >= postDepth ||
        footLength <= postDepth + braceSize * 4 ||
        typeof makeTimber !== "function"
    ) {
        throw new RangeError("Invalid trestle dimensions or timber factory");
    }

    const trestle = new THREE.Group();
    trestle.name = "TrestleSupport";

    const add = (
        name: string,
        start: THREE.Vector3,
        end: THREE.Vector3,
        width: number,
        depth: number
    ): void => {
        const timber = makeTimber(name, start, end, width, depth);
        timber.name = name;
        trestle.add(timber);
    };

    // createTimberBetween() aligns the long axis with the endpoints.
    // For cross timbers along Z, width maps to X and depth maps to Y.
    add(
        "Foot",
        new THREE.Vector3(0, footHeight / 2, -footLength / 2),
        new THREE.Vector3(0, footHeight / 2, footLength / 2),
        crossWidth,
        footHeight
    );

    add(
        "Post",
        new THREE.Vector3(0, footHeight, 0),
        new THREE.Vector3(0, height - headHeight, 0),
        postWidth,
        postDepth
    );

    add(
        "TopBearer",
        new THREE.Vector3(0, height - headHeight / 2, -headLength / 2),
        new THREE.Vector3(0, height - headHeight / 2, headLength / 2),
        crossWidth,
        headHeight
    );

    // Brace ends overlap the foot and post inside the joints, so neither
    // of these diagonal timbers appears to float beside its support.
    const lowerY = footHeight + braceSize * 0.10;
    const upperY = height - headHeight - braceSize * 0.82;
    const lowerZ = footLength / 2 - braceSize * 1.5;
    const upperZ = postDepth / 2 - braceSize * 0.25;

    for (const side of [-1, 1] as const) {
        add(
            side < 0 ? "BraceBack" : "BraceFront",
            new THREE.Vector3(0, lowerY, side * lowerZ),
            new THREE.Vector3(0, upperY, side * upperZ),
            braceSize,
            braceSize
        );
    }

    return trestle;
}
