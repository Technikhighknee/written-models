import * as THREE from "three";

import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";

const SEGMENTS = 32;
const WATER_HEIGHT = 0.30;

// A single circular cross-section, not a collection of individual stones.
// Mortar joints, stone courses and weathering belong in the texture.
const PROFILE = [
    { radius: 0.748, height: 0.01 },
    { radius: 0.748, height: 0.607 },
    { radius: 0.473, height: 0.607 },
    { radius: 0.473, height: WATER_HEIGHT }
] as const;

export default {
    slug: "village-well",
    title: "Village Well",
    description: "Well, well, well.",
    category: "architecture" as const,
    create
};

function create(): THREE.Mesh {
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const lengths = [0];

    for (let i = 1; i < PROFILE.length; i++) {
        const previous = PROFILE[i - 1]!;
        const current = PROFILE[i]!;
        lengths.push(lengths[i - 1]! + Math.hypot(
            current.radius - previous.radius,
            current.height - previous.height
        ));
    }

    const point = (radius: number, height: number, angle: number) =>
        new THREE.Vector3(
            Math.sin(angle) * radius,
            height,
            Math.cos(angle) * radius
        );

    for (const ring of PROFILE) {
        for (let i = 0; i < SEGMENTS; i++) {
            builder.addVertex(point(ring.radius, ring.height, i * 2 * Math.PI / SEGMENTS));
        }
    }

    const vertex = (ring: number, i: number) =>
        ring * SEGMENTS + i % SEGMENTS;
    const uv = (ring: number, i: number) =>
        new THREE.Vector2(
            i * 2 * Math.PI / SEGMENTS * PROFILE[ring]!.radius,
            lengths[ring]!
        );

    for (let ring = 0; ring < PROFILE.length - 1; ring++) {
        for (let i = 0; i < SEGMENTS; i++) {
            builder.addIndexedFace([
                vertex(ring, i),
                vertex(ring, i + 1),
                vertex(ring + 1, i + 1),
                vertex(ring + 1, i)
            ], [
                uv(ring, i),
                uv(ring, i + 1),
                uv(ring + 1, i + 1),
                uv(ring + 1, i)
            ], "stone", `stone-section-${ring}`);
        }
    }

    // The flat water face closes the opening below the rim in the same mesh.
    const center = builder.addVertex(new THREE.Vector3(0, WATER_HEIGHT, 0));
    const bottomRing = PROFILE.length - 1;

    for (let i = 0; i < SEGMENTS; i++) {
        const a = vertex(bottomRing, i);
        const b = vertex(bottomRing, i + 1);
        const angleA = i * 2 * Math.PI / SEGMENTS;
        const angleB = (i + 1) * 2 * Math.PI / SEGMENTS;
        const radius = PROFILE[bottomRing]!.radius;

        builder.addIndexedFace([center, a, b], [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(Math.sin(angleA) * radius, Math.cos(angleA) * radius),
            new THREE.Vector2(Math.sin(angleB) * radius, Math.cos(angleB) * radius)
        ], "water");
    }

    return surfaceMesh({
        name: "VillageWell",
        geometry: geometryResult(builder.build()),
        // Preview colors only. No stone courses are modeled in geometry.
        materials: {
            stone: new THREE.MeshStandardMaterial({
                color: "#a3a3a3",
                roughness: 1
            }),
            water: new THREE.MeshStandardMaterial({
                color: "#879aa2",
                roughness: 0.8
            })
        }
    });
}
