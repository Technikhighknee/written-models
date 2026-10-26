import * as THREE from "three";
import type { MeshData, QuadFace } from "../../geometry/mesh/MeshData";
import { toBufferGeometry } from "../../geometry/mesh/toBufferGeometry";

export interface RevolveShellOptions {
    thickness: number,
    radialSegments?: number;
    roundedRims?: boolean;
    rimSegments?: number;
}


export function revolveShell(
    profile: readonly THREE.Vector2[],
    {
        thickness,
        radialSegments = 32,
        roundedRims = false,
        rimSegments = 8
    }: RevolveShellOptions
): THREE.BufferGeometry {
    if (
        !Number.isFinite(thickness) ||
        thickness <= 0 ||
        profile.length < 2 ||
        profile.some((p, i) => 
            p.x <= thickness ||
            (i > 0 && p.y <= profile[i - 1]!.y)
        )
    ) {
        throw new RangeError("Invalid shell profile");
    }

    if (!Number.isInteger(rimSegments) || rimSegments < 2) {
        throw new RangeError("Invalid rim segments");
    }

    const innerProfile = [...profile]
        .reverse()
        .map(p => new THREE.Vector2(
            p.x - thickness,
            p.y
        ));
    
    let section: THREE.Vector2[];

    if (roundedRims) {
        const topRim = createRoundedRim(
            profile.at(-1)!, 
            thickness, 
            true, 
            rimSegments
        );

        const bottomRim = createRoundedRim(
            profile[0]!,
            thickness,
            false,
            rimSegments
        );

        section = [
            ...profile,
            ...topRim,
            ...innerProfile.slice(1),
            ...bottomRim
        ];
    } else {
        section = [
            ...profile,
            ...innerProfile,
            profile[0]!.clone()
        ];
    }
    
    if (!Number.isInteger(radialSegments) || radialSegments < 3) {
        throw new RangeError("Invalid shell radial segments");
    }

    // The profile's last point is the closure of its first point.
    // Keep one vertex per genuine cross-section station.
    const contour = section.slice();
    const start = contour[0]!;
    const end = contour.at(-1)!;
    if (start.distanceTo(end) < 1e-12) contour.pop();

    const vertices: THREE.Vector3[] = [];
    const quads: QuadFace[] = [];
    const count = contour.length;
    const step = 2 * Math.PI / radialSegments;
    const perimeter = [0];

    for (let j = 0; j < count; j++) {
        const a = contour[j]!;
        const b = contour[(j + 1) % count]!;
        const length = a.distanceTo(b);
        if (!(length > 0)) {
            throw new RangeError("Collapsed shell profile segment");
        }
        perimeter.push(perimeter[j]! + length);
    }

    for (let i = 0; i < radialSegments; i++) {
        const theta = step * i;
        for (const p of contour) {
            vertices.push(new THREE.Vector3(
                p.x * Math.sin(theta), p.y, p.x * Math.cos(theta)
            ));
        }
    }

    for (let i = 0; i < radialSegments; i++) {
        const nextI = (i + 1) % radialSegments;
        for (let j = 0; j < count; j++) {
            const nextJ = (j + 1) % count;
            const a = i * count + j;
            const b = nextI * count + j;
            const c = nextI * count + nextJ;
            const d = i * count + nextJ;
            const circumRadius = (contour[j]!.x + contour[nextJ]!.x) / 2;

            quads.push({
                corners: [a, b, c, d],
                surface: "shell",
                smoothingGroup: "shell",
                uvs: [
                    new THREE.Vector2(i * step * circumRadius, perimeter[j]!),
                    new THREE.Vector2((i + 1) * step * circumRadius, perimeter[j]!),
                    new THREE.Vector2((i + 1) * step * circumRadius, perimeter[j + 1]!),
                    new THREE.Vector2(i * step * circumRadius, perimeter[j + 1]!)
                ]
            });
        }
    }

    const mesh: MeshData = { vertices, quads };
    return toBufferGeometry(mesh, { shell: 0 });
}

function createRoundedRim(
    point: THREE.Vector2,
    thickness: number,
    top: boolean,
    segments: number
): THREE.Vector2[] {
    const radius = thickness / 2;
    const centerX = point.x - radius;
    const startAngle = top ? 0 : Math.PI;

    const points: THREE.Vector2[] = [];

    for (let i = 1; i <= segments; i++) {
        const angle = startAngle + (i / segments) * Math.PI;

        points.push(new THREE.Vector2(
            centerX + Math.cos(angle) * radius,
            point.y + Math.sin(angle) * radius
        ));
    }

    return points;
}