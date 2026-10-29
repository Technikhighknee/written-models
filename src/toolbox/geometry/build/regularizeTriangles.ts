import * as THREE from "three";
import type { GeometryPrecision } from "../kernel/precision";

type Triangle = [number, number, number];

function edgeKey(a: number, b: number): string {
    return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

/** Improve internal chart-space triangles without splitting authored rims. */
export export function regularizeTriangles(
    uv: readonly THREE.Vector2[],
    triangles: Triangle[],
    protectedEdges: ReadonlySet<string>,
    precision: GeometryPrecision
): void {
    const area = (a: number, b: number, c: number): number => {
        const first = uv[a]!;
        const second = uv[b]!;
        const third = uv[c]!;
        return (second.x - first.x) * (third.y - first.y) -
            (second.y - first.y) * (third.x - first.x);
    };
    const maxPasses = 24;

    for (let pass = 0; pass < maxPasses; pass++) {
        const uses = new Map<string, {
            face: number;
            from: number;
            to: number;
            opposite: number;
        }[]>();

        triangles.forEach((face, index) => {
            for (let edge = 0; edge < 3; edge++) {
                const from = face[edge]!;
                const to = face[(edge + 1) % 3]!;
                const opposite = face[(edge + 2) % 3]!;
                const key = edgeKey(from, to);
                const recorded = uses.get(key) ?? [];
                recorded.push({ face: index, from, to, opposite });
                uses.set(key, recorded);
            }
        });

        const touched = new Set<number>();
        let changed = false;

        for (const [key, entries] of uses) {
            if (
                protectedEdges.has(key) ||
                entries.length !== 2 ||
                touched.has(entries[0]!.face) ||
                touched.has(entries[1]!.face)
            ) continue;

            const [first, second] = entries;
            const a = first!.from;
            const b = first!.to;
            const c = first!.opposite;
            const d = second!.opposite;

            if (
                second!.from !== b || second!.to !== a ||
                new Set([a, b, c, d]).size !== 4
            ) continue;

            const sign = Math.sign(area(a, b, c));
            const newAreaA = area(c, a, d);
            const newAreaB = area(c, d, b);
            const tolerance = precision.absoluteLength ** 2;

            if (
                !sign ||
                newAreaA * sign <= tolerance ||
                newAreaB * sign <= tolerance
            ) continue;

            const x = [a, b, c].map(id => uv[id]!.x - uv[d]!.x);
            const y = [a, b, c].map(id => uv[id]!.y - uv[d]!.y);
            const length = x.map((value, i) =>
                value * value + y[i]! * y[i]!
            );
            const determinant =
                length[0]! * (x[1]! * y[2]! - y[1]! * x[2]!) -
                length[1]! * (x[0]! * y[2]! - y[0]! * x[2]!) +
                length[2]! * (x[0]! * y[1]! - y[0]! * x[1]!);

            const edgeScale = Math.max(
                uv[a]!.distanceToSquared(uv[b]!),
                uv[c]!.distanceToSquared(uv[d]!)
            );
            if (determinant * sign <=
                precision.relativeLength * edgeScale * edgeScale) {
                continue;
            }

            triangles[first!.face] = [c, a, d];
            triangles[second!.face] = [c, d, b];
            touched.add(first!.face);
            touched.add(second!.face);
            changed = true;
        }

        if (!changed) break;
    }
}

