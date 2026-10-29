import * as THREE from "three";
import type {
    Contour3,
    Profile2,
    Section3
} from "../definitions/geometry";
import { triangulateProfile } from "../build/triangulateProfile";
import { GeometryOperationError } from "../kernel/GeometryResult";
import {
    assertAffineTransform,
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

export interface AuthoredPlanarSupport {
    /** Rigid XY-to-world frame; the local +Z axis is its outward normal. */
    frame: THREE.Matrix4;
    footprint: Profile2;
}

export type SurfaceAttachment =
    | {
        target: SurfaceTarget;
        near: THREE.Vector3Like;
        authoredPlane?: never;
    }
    | {
        authoredPlane: AuthoredPlanarSupport;
        near: THREE.Vector3Like;
        target?: never;
    };

export type FittedContact =
    | { kind: "surface"; patch: SurfacePatchHit }
    | {
        kind: "authored-plane";
        support: AuthoredPlanarSupport;
        point: THREE.Vector3;
        normal: THREE.Vector3;
    };

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
    target: SurfaceTarget,
    patch: SurfacePatchHit,
    precision: GeometryPrecision
): FootprintTriangle[] {
    const inverse = patch.frame.clone().invert();
    const selected = new Set(patch.faces.map(face =>
        `${face.kind}:${face.index}`
    ));

    return surfaceTriangles(
        target, precision, "fitBetweenSurfaces"
    ).filter(triangle =>
        selected.has(`${triangle.face.kind}:${triangle.face.index}`)
    ).map(triangle => triangle.points.map(point => {
        const local = point.clone().applyMatrix4(inverse);
        return new THREE.Vector2(local.x, local.y);
    }) as [THREE.Vector2, THREE.Vector2, THREE.Vector2]);
}

interface ResolvedSupport {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    frame: THREE.Matrix4;
    footprint: FootprintTriangle[];
    contact: FittedContact;
}

/**
 * The two contact kinds resolve into the same finite triangle footprint.
 * An authored support is not an infinite plane, even if its frame is valid.
 */
function resolveSupport(
    attachment: SurfaceAttachment,
    near: THREE.Vector3,
    facing: THREE.Vector3,
    precision: GeometryPrecision
): ResolvedSupport {
    const hasSurface = !!attachment.target;
    const hasPlane = !!attachment.authoredPlane;

    if (hasSurface === hasPlane) {
        failure("invalid-input", "Choose exactly one contact support kind");
    }

    if (hasSurface) {
        const patch = findFacingPatch(
            attachment.target!, near, facing, precision
        );
        return {
            point: patch.contact.point,
            normal: patch.contact.normal,
            frame: patch.frame,
            footprint: selectedSurface(attachment.target!, patch, precision),
            contact: { kind: "surface", patch }
        };
    }

    const support = attachment.authoredPlane!;
    if (
        !(support.frame instanceof THREE.Matrix4) ||
        !support.footprint?.outer
    ) {
        failure("invalid-input", "Expected an authored planar frame and footprint");
    }
    assertAffineTransform(support.frame, "fitBetweenSurfaces", precision);

    const e = support.frame.elements;
    const x = new THREE.Vector3(e[0], e[1], e[2]);
    const y = new THREE.Vector3(e[4], e[5], e[6]);
    const z = new THREE.Vector3(e[8], e[9], e[10]);

    if (
        [x, y, z].some(axis =>
            Math.abs(axis.length() - 1) > precision.angle
        ) ||
        Math.abs(x.dot(y)) > precision.angle ||
        Math.abs(x.dot(z)) > precision.angle ||
        Math.abs(y.dot(z)) > precision.angle ||
        x.clone().cross(y).dot(z) < 1 - precision.angle
    ) {
        failure("invalid-input", "Authored planar frame must be rigid and right-handed");
    }
    if (z.dot(facing) <= 0) {
        failure("invalid-input", "Authored contact normal faces away from the member");
    }

    const contours = [
        support.footprint.outer,
        ...(support.footprint.holes ?? [])
    ];
    if (contours.some(contour =>
        !contour?.closed ||
        !Array.isArray(contour.points) ||
        contour.points.some(point =>
            !point || ![point.x, point.y].every(Number.isFinite))
    )) {
        failure("invalid-input", "Invalid authored footprint contours");
    }

    const ids = triangulateProfile(
        contours.map(contour => contour.points), precision
    );
    const points = contours.flatMap(contour => contour.points.map(p =>
        new THREE.Vector2(p.x, p.y)
    ));
    const footprint: FootprintTriangle[] = ids.map(face =>
        face.map(index => points[index]!) as [
            THREE.Vector2, THREE.Vector2, THREE.Vector2
        ]
    );
    const world = points.map(point =>
        new THREE.Vector3(point.x, point.y, 0).applyMatrix4(support.frame)
    );

    const nearest = new THREE.Vector3();
    const candidate = new THREE.Vector3();
    let distance = Infinity;

    for (const face of ids) {
        const triangle = new THREE.Triangle(
            world[face[0]]!, world[face[1]]!, world[face[2]]!
        );
        triangle.closestPointToPoint(near, candidate);
        const squared = candidate.distanceToSquared(near);

        if (squared < distance) {
            distance = squared;
            nearest.copy(candidate);
        }
    }

    return {
        point: nearest,
        normal: z,
        frame: support.frame.clone(),
        footprint,
        contact: {
            kind: "authored-plane",
            support,
            point: nearest.clone(),
            normal: z.clone()
        }
    };
}

function projectedSection(
    profile: Profile2,
    support: ResolvedSupport,
    anchor: THREE.Vector3,
    across: THREE.Vector3,
    upward: THREE.Vector3,
    axis: THREE.Vector3,
    precision: GeometryPrecision
): Section3 {
    const normal = support.normal;
    const divisor = normal.dot(axis);
    if (Math.abs(divisor) <= Math.sin(precision.angle)) {
        failure("invalid-input", "Member axis is parallel to its contact plane");
    }

    const inverse = support.frame.clone().invert();
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
                support.point.clone().sub(base)
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
        support.footprint,
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
 * Fit a 2D member profile to two finite surface or authored-plane supports.
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

    const startSupport = resolveSupport(
        start, startNear, axis, policy
    );
    const endSupport = resolveSupport(
        end, endNear, axis.clone().negate(), policy
    );

    const first = projectedSection(
        section, startSupport, startNear,
        across, upward, axis, policy
    );
    const last = projectedSection(
        section, endSupport, endNear,
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
        startContact: startSupport.contact,
        endContact: endSupport.contact
    };
}
