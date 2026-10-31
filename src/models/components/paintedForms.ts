import * as THREE from "three";

import { AuthoredMeshBuilder } from "../../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult } from "../../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../../toolbox/geometry/mesh/surfaceMesh";
import type { PaintedAtlas } from "../../material-system/paint";

export interface Section {
    radius: number;
    y: number;
}

export interface Strip {
    panel: string;
    fromV: number;
    toV: number;
}

export function turnedSurface(
    builder: AuthoredMeshBuilder,
    sections: readonly Section[],
    strips: readonly Strip[],
    sides: number,
    atlas: PaintedAtlas
): void {
    if (sections.length < 2 || strips.length !== sections.length - 1 ||
        !Number.isInteger(sides) || sides < 3 ||
        sections.some(s => s.radius <= 0 || !Number.isFinite(s.y))) {
        throw new RangeError("Invalid turned surface");
    }

    const vertices: number[][] = sections.map(section =>
        Array.from({ length: sides }, (_, i) => {
            const theta = i * Math.PI * 2 / sides;
            return builder.addVertex(new THREE.Vector3(
                Math.sin(theta) * section.radius,
                section.y,
                Math.cos(theta) * section.radius
            ));
        })
    );

    for (let row = 0; row < strips.length; row++) {
        const strip = strips[row]!;
        for (let i = 0; i < sides; i++) {
            const next = (i + 1) % sides;
            const u0 = i / sides;
            const u1 = (i + 1) / sides;
            builder.addIndexedFace([
                vertices[row]![i]!,
                vertices[row]![next]!,
                vertices[row + 1]![next]!,
                vertices[row + 1]![i]!
            ], [
                atlas.uv(strip.panel, u0, strip.fromV),
                atlas.uv(strip.panel, u1, strip.fromV),
                atlas.uv(strip.panel, u1, strip.toV),
                atlas.uv(strip.panel, u0, strip.toV)
            ], "painted");
        }
    }
}

export function disk(
    builder: AuthoredMeshBuilder,
    y: number,
    radius: number,
    sides: number,
    atlas: PaintedAtlas | undefined,
    panel: string,
    facing: "up" | "down" = "up"
): void {
    const center = builder.addVertex(new THREE.Vector3(0, y, 0));
    const rim = Array.from({ length: sides }, (_, i) => {
        const angle = i * Math.PI * 2 / sides;
        return builder.addVertex(new THREE.Vector3(
            Math.sin(angle) * radius, y, Math.cos(angle) * radius
        ));
    });

    const uv = (id: number) => {
        if (id === center) {
            return atlas ? atlas.uv(panel, 0.5, 0.5) : new THREE.Vector2(0.5, 0.5);
        }
        const p = (id - rim[0]!) * Math.PI * 2 / sides;
        const u = 0.5 + Math.sin(p) * 0.48;
        const v = 0.5 + Math.cos(p) * 0.48;
        return atlas ? atlas.uv(panel, u, v) : new THREE.Vector2(u, v);
    };

    for (let i = 0; i < sides; i++) {
        const a = rim[i]!;
        const b = rim[(i + 1) % sides]!;
        const corners = facing === "up" ? [center, a, b] : [center, b, a];
        builder.addIndexedFace(corners, corners.map(uv),
            atlas ? "painted" : panel);
    }
}

export function paintedMesh(
    name: string,
    builder: AuthoredMeshBuilder,
    atlas: PaintedAtlas,
    otherMaterials: Readonly<Record<string, THREE.Material>> = {}
): THREE.Mesh {
    return surfaceMesh({
        name,
        geometry: geometryResult(builder.build()),
        materials: { painted: atlas.material, ...otherMaterials }
    });
}

export function paintedBox(
    name: string,
    width: number,
    height: number,
    depth: number,
    atlas: PaintedAtlas,
    panel: string
): THREE.Mesh {
    const builder = new AuthoredMeshBuilder({ weld: "position" });
    const x = width / 2;
    const z = depth / 2;

    const faces: readonly (readonly THREE.Vector3[])[] = [
        [
            new THREE.Vector3(-x, 0, z), new THREE.Vector3(x, 0, z),
            new THREE.Vector3(x, height, z), new THREE.Vector3(-x, height, z)
        ],
        [
            new THREE.Vector3(x, 0, -z), new THREE.Vector3(-x, 0, -z),
            new THREE.Vector3(-x, height, -z), new THREE.Vector3(x, height, -z)
        ],
        [
            new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0, -z),
            new THREE.Vector3(x, height, -z), new THREE.Vector3(x, height, z)
        ],
        [
            new THREE.Vector3(-x, 0, -z), new THREE.Vector3(-x, 0, z),
            new THREE.Vector3(-x, height, z), new THREE.Vector3(-x, height, -z)
        ],
        [
            new THREE.Vector3(-x, height, z), new THREE.Vector3(x, height, z),
            new THREE.Vector3(x, height, -z), new THREE.Vector3(-x, height, -z)
        ],
        [
            new THREE.Vector3(-x, 0, -z), new THREE.Vector3(x, 0, -z),
            new THREE.Vector3(x, 0, z), new THREE.Vector3(-x, 0, z)
        ]
    ];

    for (const face of faces) {
        builder.addFace(face, [
            atlas.uv(panel, 0, 0), atlas.uv(panel, 1, 0),
            atlas.uv(panel, 1, 1), atlas.uv(panel, 0, 1)
        ], "painted");
    }

    return paintedMesh(name, builder, atlas);
}
