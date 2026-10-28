import * as THREE from "three";
import { GeometryOperationError } from "../kernel/GeometryResult";
import { lengthTolerance, resolvePrecision, type GeometryPrecision } from "../kernel/precision";

export type PlanarTriangle = [number, number, number];

/**
 * Triangulate an already sampled outer contour with optional holes.
 * Every authored boundary edge survives, including collinear stations
 * that earcut would otherwise omit. No new boundary vertices are made.
 *
 * The input follows ShapeUtils winding: clockwise outer, CCW holes.
 * Triangle indices refer to the flattened input order.
 */
export function triangulateProfile(
    contours: readonly (readonly THREE.Vector2Like[])[],
    precision?: GeometryPrecision
): PlanarTriangle[] {
    const policy = resolvePrecision(precision);
    const flat = contours.flat().map(p => new THREE.Vector2(p.x, p.y));

    if (
        contours.length === 0 ||
        contours.some(loop => loop.length < 3) ||
        flat.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))
    ) {
        throw new GeometryOperationError(
            "triangulateProfile", "invalid-input", "Invalid planar contours"
        );
    }

    const extent = new THREE.Box2().setFromPoints(flat)
        .getSize(new THREE.Vector2()).length();
    const tolerance = lengthTolerance(policy, extent);
    const triangles = THREE.ShapeUtils.triangulateShape(
        contours[0]!.map(p => new THREE.Vector2(p.x, p.y)),
        contours.slice(1).map(loop => loop.map(p => new THREE.Vector2(p.x, p.y)))
    );

    if (!triangles.length) {
        throw new GeometryOperationError(
            "triangulateProfile", "unsupported-topology",
            "Planar profile could not be triangulated"
        );
    }

    const result: PlanarTriangle[] = [];

    function split([a, b, c]: PlanarTriangle): void {
        const indices = [a, b, c];

        for (let edge = 0; edge < 3; edge++) {
            const from = indices[edge]!;
            const to = indices[(edge + 1) % 3]!;
            const opposite = indices[(edge + 2) % 3]!;
            const p = flat[from]!;
            const q = flat[to]!;
            const delta = q.clone().sub(p);
            const lengthSquared = delta.lengthSq();

            if (!(lengthSquared > tolerance * tolerance)) {
                throw new GeometryOperationError(
                    "triangulateProfile", "degenerate-geometry",
                    "Collapsed cap triangle edge"
                );
            }

            const between = flat.flatMap((point, index) => {
                if (index === from || index === to || index === opposite) {
                    return [];
                }

                const offset = point.clone().sub(p);
                const t = offset.dot(delta) / lengthSquared;
                const distance = Math.abs(
                    offset.x * delta.y - offset.y * delta.x
                ) / Math.sqrt(lengthSquared);

                return t > 0 && t < 1 && distance <= tolerance
                    ? [{ index, t }] : [];
            }).sort((left, right) => left.t - right.t);

            if (!between.length) continue;

            let previous = from;

            for (const station of between) {
                split([previous, station.index, opposite]);
                previous = station.index;
            }

            split([previous, to, opposite]);
            return;
        }

        result.push([a, b, c]);
    }

    for (const triangle of triangles) {
        const [a, b, c] = triangle;
        if (a === undefined || b === undefined || c === undefined) {
            throw new GeometryOperationError(
                "triangulateProfile", "invalid-topology",
                "Incomplete cap triangle"
            );
        }

        split([a, b, c]);
    }

    return result;
}
