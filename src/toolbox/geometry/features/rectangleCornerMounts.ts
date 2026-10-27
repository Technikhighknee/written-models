import * as THREE from "three";
import { contactFrame } from "../../spatial/frames/contactFrame";

export type MountFace = "top" | "bottom";

export interface RectangleCornerMountOptions {
    width: number;
    depth: number;
    thickness: number;
    footprintWidth: number;
    footprintDepth: number;
    inset?: number;
    face?: MountFace;
}

export interface RectangleCornerMount {
    name: string;
    frame: THREE.Matrix4;
}

export function rectangleCornerMounts({
    width,
    depth,
    thickness,
    footprintWidth,
    footprintDepth,
    inset = 0,
    face = "bottom"
}: RectangleCornerMountOptions): RectangleCornerMount[] {
    const values = [
        width,
        depth,
        thickness,
        footprintWidth,
        footprintDepth,
        inset
    ];

    if (
        values.some(value => !Number.isFinite(value)) ||
        width <= 0 ||
        depth <= 0 ||
        thickness <= 0 ||
        footprintWidth <= 0 ||
        footprintDepth <= 0 ||
        inset < 0
    ) {
        throw new RangeError("Invalid mounting dimensions");
    }

    if (face !== "top" && face !== "bottom") {
        throw new RangeError("Face must be top or bottom");
    }

    const x = width / 2 - inset - footprintWidth / 2;
    const z = depth / 2 - inset - footprintDepth / 2;

    if (x < 0 || z < 0) {
        throw new RangeError(
            "Mounting footprint does not fit inside rectangle"
        );
    }

    const y = face === "bottom"
        ? -thickness / 2
        :  thickness / 2;
    
    const outward = new THREE.Vector3(0, face === "bottom" ? -1 : 1, 0);
    const tangent = new THREE.Vector3(1, 0, 0);

    const corners: [string, number, number][] = [
        ["FrontLeft", -x,  z],
        ["FrontRight", x,  z],
        ["BackLeft",  -x, -z],
        ["BackRight",  x, -z]
    ];

    return corners.map(([name, cx, cz]) => ({
        name,
        frame: contactFrame(
            new THREE.Vector3(cx, y, cz), outward, tangent
        )
    }));
}
