import * as THREE from "three";
import type { TimberContactNormals } from "../../toolbox/geometry/construction/timber";

/** Timber assembled in the caller's coordinate system and material family. */
export type TrestleTimberFactory = (
    name: string,
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    depth: number,
    contacts?: TimberContactNormals
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
export interface TrestleTimber {
    name: string;
    start: THREE.Vector3;
    end: THREE.Vector3;
    width: number;
    depth: number;
    contacts?: TimberContactNormals;
}

/**
 * The timber cut list is authored independently from rendering.
 * Both the model and its renderer consume these exact member positions.
 */
export function trestleTimbers(
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
    }: TrestleSupportOptions
): readonly TrestleTimber[] {
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
        footLength <= postDepth + braceSize * 4
    ) {
        throw new RangeError("Invalid trestle dimensions or timber factory");
    }

    const members: TrestleTimber[] = [];

    const add = (
        name: string,
        start: THREE.Vector3,
        end: THREE.Vector3,
        width: number,
        depth: number,
        contacts?: TimberContactNormals
    ): void => {
        members.push({
            name, start, end, width, depth,
            ...(contacts ? {contacts} : {})
        });
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

    // Brace centers are chosen ON the foot's upper face and the post's
    // outer face. The two contact planes determine the miters at all four
    // corners of both ends; no beam penetrates the supporting timbers.
    const lowerZ = footLength / 2 - braceSize * 1.5;
    const upperY = height - headHeight - braceSize * 1.5;

    for (const side of [-1, 1] as const) {
        add(
            side < 0 ? "BraceBack" : "BraceFront",
            new THREE.Vector3(0, footHeight, side * lowerZ),
            new THREE.Vector3(0, upperY, side * postDepth / 2),
            braceSize,
            braceSize,
            {
                startNormal: new THREE.Vector3(0, 1, 0),
                endNormal: new THREE.Vector3(0, 0, side)
            }
        );
    }

    return members;
}

/** Build the rendered trestle from its authored five-member cut list. */
export function createTrestleSupport(
    options: TrestleSupportOptions,
    makeTimber: TrestleTimberFactory
): THREE.Group {
    if (typeof makeTimber !== "function") {
        throw new RangeError("Invalid trestle timber factory");
    }
    const trestle = new THREE.Group();
    trestle.name = "TrestleSupport";

    for (const member of trestleTimbers(options)) {
        const wood = makeTimber(
            member.name,
            member.start,
            member.end,
            member.width,
            member.depth,
            member.contacts
        );
        wood.name = member.name;
        trestle.add(wood);
    }

    return trestle;
}
