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
 * A single persistent mesh whose volume-correct fill levels are encoded as
 * glTF-compatible morph targets (Godot blend shapes). The fully filled mesh
 * is the neutral base, so importers never see degenerate base triangles.
 * Changing the level only adjusts weights, including after GLB export.
 *
 * A fixed number of samples approximates intermediate levels. This models
 * upright contents; tilting and pouring require separate behavior.
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
    const indices: number[] = [];
    const steps = 8;

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

    function positionsAtFill(fraction: number): Float32Array {
        const positions = new Float32Array(vertexCount * 3);
        const surfaceY = cavity.heightAtFill(fraction);

        function writeRing(
            start: number,
            section: ReturnType<ProfiledCavity["sectionAt"]>
        ): void {
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

        for (let row = 0; row < rows; row++) {
            const y = Math.min(cavity.rings[row]!.y, surfaceY);
            writeRing(row * count, cavity.sectionAt(y));
        }

        writeRing(topStart, cavity.sectionAt(surfaceY));
        writeRing(bottomStart, cavity.sectionAt(cavity.bottom));

        return positions;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);

    // Base = full. In particular, don't export a zero-height base mesh:
    // importers may discard its collapsed faces before reading blend shapes.
    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positionsAtFill(1), 3)
    );
    geometry.computeVertexNormals();

    geometry.morphAttributes.position = Array.from({length: steps}, (_, i) => {
        const target = new THREE.BufferAttribute(
            positionsAtFill(i / steps), 3
        );
        target.name = `Fill_${i}_of_${steps}`;
        return target;
    });
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "FillableContents";
    mesh.userData.fillSteps = steps;
    mesh.userData.fillControl = "blend-shapes";

    let fill = 1;

    function setFillLevel(fraction: number): void {
        if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
            throw new RangeError("Fill level must be between 0 and 1");
        }

        fill = fraction;
        const scaled = fraction * steps;
        const lower = Math.min(steps, Math.floor(scaled));
        const upper = Math.min(steps, lower + 1);
        const t = scaled - lower;

        // Morph targets 0..steps-1 are sample shapes; steps is the base.
        // Only the neighboring samples are ever active.
        const weights = mesh.morphTargetInfluences!;
        weights.fill(0);

        if (lower < steps) weights[lower] = 1 - t;
        if (upper < steps) weights[upper] = t;
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
