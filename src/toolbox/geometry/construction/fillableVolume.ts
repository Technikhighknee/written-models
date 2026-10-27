import * as THREE from "three";
import { ProfiledCavity } from "./profiledCavity";

export interface FillLevelController {
    getFillLevel(): number;
    setFillLevel(fraction: number): void;
}

export interface FillableVolume extends FillLevelController {
    readonly mesh: THREE.Mesh;
}

/**
 * A single persistent content mesh with a volume-correct horizontal surface.
 * Updating the fill changes its vertex buffer, not the model or mesh identity.
 * Geometry is for an upright vessel; sloshing/tilt is a separate capability.
 */
export function createFillableVolume(
    cavity: ProfiledCavity,
    material: THREE.Material,
    initialFill = 0,
    inset = 0.0003
): FillableVolume {
    if (!Number.isFinite(inset) || inset < 0) {
        throw new RangeError("Invalid content clearance");
    }

    const rows = cavity.rings.length;
    const count = cavity.rings[0]!.outline.length;
    const topStart = rows * count;
    const bottomStart = topStart + count + 1;
    const vertexCount = bottomStart + count + 1;
    const positions = new Float32Array(vertexCount * 3);
    const indices: number[] = [];

    for (let row = 0; row < rows - 1; row++) {
        for (let j = 0; j < count; j++) {
            const next = (j + 1) % count;
            const lower = row * count;
            const upper = (row + 1) * count;

            // Sorted X/Z outlines run clockwise when viewed from above.
            indices.push(
                lower + j, upper + j, lower + next,
                lower + next, upper + j, upper + next
            );
        }
    }

    for (let j = 0; j < count; j++) {
        const next = (j + 1) % count;
        indices.push(topStart + count, topStart + next, topStart + j);
        indices.push(bottomStart + count, bottomStart + j, bottomStart + next);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "FillableContents";

    let fill = 0;

    function writeRing(start: number, section: ReturnType<ProfiledCavity["sectionAt"]>): void {
        const cx = section.outline.reduce((sum, p) => sum + p.x, 0) / count;
        const cz = section.outline.reduce((sum, p) => sum + p.y, 0) / count;

        for (let j = 0; j < count; j++) {
            const point = section.outline[j]!;
            const dx = point.x - cx;
            const dz = point.y - cz;
            const radius = Math.hypot(dx, dz);
            const scale = Math.max(0, 1 - inset / radius);
            const index = (start + j) * 3;

            positions[index] = cx + dx * scale;
            positions[index + 1] = section.y;
            positions[index + 2] = cz + dz * scale;
        }

        if (start === topStart || start === bottomStart) {
            const center = (start + count) * 3;
            positions[center] = cx;
            positions[center + 1] = section.y;
            positions[center + 2] = cz;
        }
    }

    function setFillLevel(fraction: number): void {
        if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
            throw new RangeError("Fill level must be between 0 and 1");
        }

        fill = fraction;
        mesh.visible = fraction > 0;
        const surfaceY = cavity.heightAtFill(fraction);

        for (let row = 0; row < rows; row++) {
            const y = Math.min(cavity.rings[row]!.y, surfaceY);
            writeRing(row * count, cavity.sectionAt(y));
        }

        writeRing(topStart, cavity.sectionAt(surfaceY));
        writeRing(bottomStart, cavity.sectionAt(cavity.bottom));

        geometry.getAttribute("position").needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
    }

    setFillLevel(initialFill);

    return {
        mesh,
        setFillLevel,
        getFillLevel: () => fill
    };
}

/** Capability detection without constraining every model to be fillable. */
export function hasFillLevelController(
    model: THREE.Object3D
): model is THREE.Object3D & FillLevelController {
    return "setFillLevel" in model &&
        typeof model.setFillLevel === "function" &&
        "getFillLevel" in model &&
        typeof model.getFillLevel === "function";
}
