import type { ScalarProfilePoint } from "./monotoneProfile";

/**
 * Interpolate ordered scalar landmarks without introducing curvature.
 * Unlike a smooth profile, straight edges and abrupt changes of slope
 * remain exact; values outside the authored domain are rejected.
 */
export function linearProfile(
    points: readonly ScalarProfilePoint[]
): (position: number) => number {
    if (points.length < 2 ||
        points.some((p, i) =>
            ![p.x, p.y].every(Number.isFinite) ||
            (i > 0 && p.x <= points[i - 1]!.x))) {
        throw new RangeError("Invalid piecewise linear profile");
    }
    return position => {
        if (!Number.isFinite(position) ||
            position < points[0]!.x || position > points.at(-1)!.x) {
            throw new RangeError("Sampling outside profile");
        }
        let index = 1;
        while (index < points.length - 1 &&
            position > points[index]!.x) index++;
        const left = points[index - 1]!;
        const right = points[index]!;
        const t = (position - left.x) / (right.x - left.x);
        return left.y + (right.y - left.y) * t;
    };
}
