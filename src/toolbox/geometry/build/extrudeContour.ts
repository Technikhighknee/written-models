import * as THREE from "three";
import type {
    Contour2,
    Profile2,
    SampledContour2,
    SampledProfile2,
    Section3
} from "../definitions/geometry";
import {
    GeometryOperationError,
    type GeometryResult
} from "../kernel/GeometryResult";
import {
    assertAffineTransform,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import {
    orientContour2,
    contourWinding
} from "../topology/contours";
import { loftSectionWalls } from "./loftSectionWalls";
import { capSectionEnd } from "./finishBoundaries";

export interface ExtrudeLayer {
    /** Layer position along depth, with required endpoints at 0 and 1. */
    position: number;
    /** Signed offset in the section plane, measured in metres. */
    contourOffset: number;
}

export interface ExtrudeOptions {
    frame: THREE.Matrix4;
    depth: number;
    caps?: boolean;
    layers?: readonly ExtrudeLayer[];
    precision?: GeometryPrecision;
}

function invalid(
    reason: "invalid-input" | "degenerate-geometry" | "unsupported-topology",
    message: string
): never {
    throw new GeometryOperationError("extrudeContour", reason, message);
}

function pointsOf(
    contour: Contour2 | SampledContour2,
    winding: "clockwise" | "counterclockwise",
    precision: GeometryPrecision
): THREE.Vector2[] {
    if ("parameters" in contour) {
        const stations = contour.parameters;

        if (
            stations.length !== contour.points.length ||
            stations[0] !== 0 ||
            stations.some((value, index) =>
                !Number.isFinite(value) ||
                value < 0 || value >= 1 ||
                (index > 0 && value <= stations[index - 1]!)
            )
        ) {
            invalid("invalid-input", "Invalid sampled contour stations");
        }

        const points = contour.points.map(point =>
            new THREE.Vector2(point.x, point.y)
        );

        if (contourWinding(points) !== winding) {
            invalid("invalid-input", "Sampled contour winding must be authored explicitly");
        }
        return points;
    }

    if (!contour.closed) {
        invalid("invalid-input", "Extrusion requires closed contours");
    }

    return orientContour2(contour.points, winding, precision.absoluteLength);
}

function offsetContour(
    original: readonly THREE.Vector2[],
    offset: number,
    precision: GeometryPrecision
): THREE.Vector2[] {
    if (offset === 0) return original.map(point => point.clone());

    const result: THREE.Vector2[] = [];

    for (let i = 0; i < original.length; i++) {
        const previous = original[(i + original.length - 1) % original.length]!;
        const current = original[i]!;
        const next = original[(i + 1) % original.length]!;

        const before = current.clone().sub(previous);
        const after = next.clone().sub(current);

        if (
            before.length() <= precision.absoluteLength ||
            after.length() <= precision.absoluteLength
        ) {
            invalid("degenerate-geometry", "Collapsed contour edge");
        }

        before.normalize();
        after.normalize();

        const left = new THREE.Vector2(-before.y, before.x);
        const right = new THREE.Vector2(-after.y, after.x);
        const denominator = 1 + left.dot(right);

        if (denominator <= Math.sin(precision.angle)) {
            invalid("unsupported-topology", "Contour offset has an unbounded miter");
        }

        const shift = left.add(right).multiplyScalar(offset / denominator);

        if (!Number.isFinite(shift.x) || !Number.isFinite(shift.y)) {
            invalid("degenerate-geometry", "Contour offset is non-finite");
        }

        result.push(current.clone().add(shift));
    }

    let winding: "clockwise" | "counterclockwise";

    try {
        winding = contourWinding(result);
    } catch {
        invalid("degenerate-geometry", "Contour offset collapsed its outline");
    }

    if (winding !== contourWinding(original)) {
        invalid("unsupported-topology", "Contour offset inverted its outline");
    }

    return result;
}

/**
 * Extrude a polygon or sampled profile through shared loft/planar-cap
 * operations. Layer offsets retain every contour station and hole loop.
 * Surfaces are labelled "outer", "inner-N", "cap-start" and "cap-end".
 */
export function extrudeContour(
    profile: Profile2 | SampledProfile2,
    {
        frame,
        depth,
        caps = true,
        layers = [
            { position: 0, contourOffset: 0 },
            { position: 1, contourOffset: 0 }
        ],
        precision
    }: ExtrudeOptions
): GeometryResult {
    const policy = resolvePrecision(precision);
    assertAffineTransform(frame, "extrudeContour", policy);

    const x = new THREE.Vector3().setFromMatrixColumn(frame, 0);
    const y = new THREE.Vector3().setFromMatrixColumn(frame, 1);
    const z = new THREE.Vector3().setFromMatrixColumn(frame, 2);

    if (
        [x, y, z].some(axis =>
            Math.abs(axis.length() - 1) > policy.angle
        ) ||
        Math.abs(x.dot(y)) > policy.angle ||
        Math.abs(y.dot(z)) > policy.angle ||
        Math.abs(x.dot(z)) > policy.angle ||
        x.clone().cross(y).dot(z) < 1 - policy.angle ||
        !Number.isFinite(depth) ||
        depth <= policy.absoluteLength ||
        layers.length < 2 ||
        layers[0]?.position !== 0 ||
        layers.at(-1)?.position !== 1 ||
        layers.some((layer, i) =>
            !Number.isFinite(layer.position) ||
            !Number.isFinite(layer.contourOffset) ||
            (i > 0 && layer.position <= layers[i - 1]!.position)
        )
    ) {
        invalid("invalid-input", "Invalid extrusion frame, depth or layers");
    }

    const outer = pointsOf(profile.outer, "clockwise", policy);
    const holes = (profile.holes ?? []).map(hole =>
        pointsOf(hole, "counterclockwise", policy)
    );
    const origin = new THREE.Vector3().setFromMatrixPosition(frame);

    const sections: Section3[] = layers.map(layer => {
        const along = origin.clone().addScaledVector(
            z, depth * layer.position
        );

        const position = (loop: readonly THREE.Vector2[]) => ({
            // Positive-depth walls require counterclockwise outer rings.
            // Keep the input/offset sampling convention unchanged, then
            // reverse the authored traversal before lofting.
            points: offsetContour(
                loop, layer.contourOffset, policy
            ).reverse().map(point => along.clone()
                .addScaledVector(x, point.x)
                .addScaledVector(y, point.y)),
            closed: true
        });

        return {
            outer: position(outer),
            ...(holes.length ? { inner: holes.map(position) } : {})
        };
    });

    let result: GeometryResult;

    try {
        result = loftSectionWalls(sections, { precision: policy });

        if (caps) {
            for (const end of ["start", "end"] as const) {
                const index = end === "start" ? 0 : layers.length - 1;
                const uvFrame = frame.clone().setPosition(
                    origin.clone().addScaledVector(z, depth * layers[index]!.position)
                );

                result = capSectionEnd(
                    result,
                    result.boundaries[`${end}-outer`]![0]!,
                    holes.map((_, i) =>
                        result.boundaries[`${end}-inner-${i}`]![0]!
                    ),
                    {
                        region: `cap-${end}`,
                        uvFrame,
                        tessellation: "quad-if-planar",
                        precision: policy
                    }
                );
            }
        }
    } catch (error) {
        if (error instanceof GeometryOperationError) {
            throw new GeometryOperationError(
                "extrudeContour", error.reason, error.message, error.context
            );
        }

        throw error;
    }

    return result;
}
