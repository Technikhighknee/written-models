import * as THREE from "three";
import type {
    Contour3,
    Profile2,
    Section3
} from "../definitions/geometry";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "../kernel/precision";
import {
    finiteFootprintContains,
    type FootprintTriangle
} from "./finiteFootprint";
import { findFacingPatch, type SurfacePatchHit } from "./findFacingPatch";
import { surfaceTriangles, type SurfaceTarget } from "./surfaceTriangles";

export interface SurfaceAttachment {
    target: SurfaceTarget;
    near: THREE.Vector3Like;
}

export interface FittedContact {
    kind: "surface";
    patch: SurfacePatchHit;
}

export interface FittedSections {
    sections: readonly [Section3, Section3];
    startContact: FittedContact;
    endContact: FittedContact;
}

export interface FitBetweenSurfacesOptions {
    start: SurfaceAttachment;
    end: SurfaceAttachment;
    section: Profile2;
    /** World-space hint controlling cross-section rotation about the axis. */
    referenceDirection: THREE.Vector3Like;
    precision?: GeometryPrecision;
}

function failure(
    reason: "invalid-input" | "outside-contact-patch" | "degenerate-geometry",
    message: string
): never {
    throw new GeometryOperationError("fitBetweenSurfaces", reason, message);
}

function worldVector(value: THREE.Vector3Like): THREE.Vector3 {
    if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
        failure("invalid-input", "Expected a finite world-space vector");
    }
    return new THREE.Vector3(value.x, value.y, value.z);
}

function selectedSurface(
    attachment: SurfaceAttachment,
    patch: SurfacePatchHit,
    precision: GeometryPrecision
): FootprintTriangle[] {
    const inverse = patch.frame.clone().invert();
    const selected = new Set(patch.faces.map(face =>
        `${face.kind}:${face.index}`
    ));

    return surfaceTriangles(
        attachment.target, precision, "fitBetweenSurfaces"
    ).filter(triangle =>
        selected.has(`${triangle.face.kind}:${triangle.face.index}`)
    ).map(triangle => triangle.points.map(point => {
        const local = point.clone().applyMatrix4(inverse);
        return new THREE.Vector2(local.x, local.y);
    }) as [THREE.Vector2, THREE.Vector2, THREE.Vector2]);
}

function projectedSection(
    profile: Profile2,
    attachment: SurfaceAttachment,
    patch: SurfacePatchHit,
    anchor: THREE.Vector3,
    across: THREE.Vector3,
    upward: THREE.Vector3,
    axis: THREE.Vector3,
    precision: GeometryPrecision
): Section3 {
    const normal = patch.contact.normal;
    const divisor = normal.dot(axis);
    if (Math.abs(divisor) <= Math.sin(precision.angle)) {
        failure("invalid-input", "Member axis is parallel to its contact plane");
    }

    const inverse = patch.frame.clone().invert();
    const outlines = [
        profile.outer,
        ...(profile.holes ?? [])
    ].map(contour => {
        if (!contour.closed || contour.points.length < 3) {
            failure("invalid-input", "Member section requires closed contours");
        }

        return contour.points.map(point => {
            if (!point || ![point.x, point.y].every(Number.isFinite)) {
                failure("invalid-input", "Nonfinite section point");
            }

            const base = anchor.clone()
                .addScaledVector(across, point.x)
                .addScaledVector(upward, point.y);
            const travel = normal.dot(
                patch.contact.point.clone().sub(base)
            ) / divisor;
            const contact = base.addScaledVector(axis, travel);

            if (!contact.toArray().every(Number.isFinite)) {
                failure("degenerate-geometry", "Nonfinite plane intersection");
            }
            return contact;
        });
    });

    const footprint: Profile2 = {
        outer: {
            points: outlines[0]!.map(point => {
                const local = point.clone().applyMatrix4(inverse);
                return new THREE.Vector2(local.x, local.y);
            }),
            closed: true
        },
        ...(outlines.length < 2 ? {} : {
            holes: outlines.slice(1).map(points => ({
                points: points.map(point => {
                    const local = point.clone().applyMatrix4(inverse);
                    return new THREE.Vector2(local.x, local.y);
                }),
                closed: true
            }))
        })
    };

    if (!finiteFootprintContains(
        selectedSurface(attachment, patch, precision),
        footprint, precision
    )) {
        failure(
            "outside-contact-patch",
            "Full fitted section exceeds the finite support or crosses a hole"
        );
    }

    const contour = (points: THREE.Vector3[]): Contour3 => ({
        points,
        closed: true
    });

    return {
        outer: contour(outlines[0]!),
        ...(outlines.length < 2 ? {} : {
            inner: outlines.slice(1).map(contour)
        })
    };
}

/**
 * Fit a 2D member profile to both finite authored support patches.
 * Each corner is intersected along the common member axis with its
 * supporting plane. The complete filled section must be covered by
 * the actual, connected supporting triangles; sampling corners alone
 * is insufficient for concavities or holes.
 */
export function fitBetweenSurfaces({
    start,
    end,
    section,
    referenceDirection,
    precision
}: FitBetweenSurfacesOptions): FittedSections {
    const policy = resolvePrecision(precision);
    if (!start?.target || !end?.target || !section?.outer) {
        failure("invalid-input", "Expected two surfaces and a member profile");
    }

    const startNear = worldVector(start.near);
    const endNear = worldVector(end.near);
    const hint = worldVector(referenceDirection);
    const axis = endNear.clone().sub(startNear);
    const length = axis.length();

    if (!(length > lengthTolerance(policy, length))) {
        failure("degenerate-geometry", "Member endpoints coincide");
    }
    axis.divideScalar(length);

    const across = hint.addScaledVector(axis, -hint.dot(axis));
    if (
        !(across.lengthSq() > 0) ||
        across.length() / worldVector(referenceDirection).length() <=
            Math.sin(policy.angle)
    ) {
        failure("invalid-input", "Reference direction is parallel to member axis");
    }
    across.normalize();
    const upward = new THREE.Vector3().crossVectors(axis, across);

    const startPatch = findFacingPatch(
        start.target, startNear, axis, policy
    );
    const endPatch = findFacingPatch(
        end.target, endNear, axis.clone().negate(), policy
    );

    const first = projectedSection(
        section, start, startPatch, startNear,
        across, upward, axis, policy
    );
    const last = projectedSection(
        section, end, endPatch, endNear,
        across, upward, axis, policy
    );

    for (const [firstLoop, lastLoop] of [
        [first.outer, last.outer],
        ...(first.inner ?? []).map((loop, index) => [
            loop, last.inner![index]!
        ])
    ] as const) {
        for (let i = 0; i < firstLoop.points.length; i++) {
            const a = worldVector(firstLoop.points[i]!);
            const b = worldVector(lastLoop.points[i]!);

            if (b.sub(a).dot(axis) <= policy.absoluteLength) {
                failure("degenerate-geometry", "Member end planes cross or reverse");
            }
        }
    }

    return {
        sections: [first, last],
        startContact: { kind: "surface", patch: startPatch },
        endContact: { kind: "surface", patch: endPatch }
    };
}
