import * as THREE from "three";

import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { geometryResult } from "../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { wellFinish } from "../material-system/recipes";

const SIDES = 18;
const OUTER_RADIUS = 0.70;
const INNER_RADIUS = 0.53;
const TOP = 0.50;
const WATER = 0.42;

// Deliberately small changes to the outline: old masonry isn't a lathed cylinder.
const EDGE_VARIATION = [
    0.006, -0.005, 0.010, 0.003, -0.011, -0.004,
    0.008, 0.014, 0.001, -0.007, 0.005, 0.012,
    -0.004, -0.010, 0.003, 0.011, -0.003, -0.008
] as const;

export default {
    slug: "village-well",
    title: "Village Well",
    description: "Well, well, well.",
    category: "architecture" as const,
    create
};

function create(): THREE.Mesh {
    const atlas = wellFinish();
    const mesh = new AuthoredMeshBuilder({ weld: "none" });

    // The same outline is shared by the wall, top, shaft and water.
    // Stone courses and the individual blocks remain entirely in the atlas.
    const rings = [
        { radius: OUTER_RADIUS, y: 0.01, variation: 1 },
        { radius: OUTER_RADIUS, y: TOP, variation: 1 },
        { radius: INNER_RADIUS, y: TOP, variation: 0.4 },
        { radius: INNER_RADIUS, y: WATER, variation: 0.4 }
    ] as const;

    const vertices = rings.map(ring =>
        Array.from({ length: SIDES }, (_, i) => {
            const angle = i * Math.PI * 2 / SIDES;
            const radius = ring.radius + EDGE_VARIATION[i]! * ring.variation;

            return mesh.addVertex(new THREE.Vector3(
                Math.sin(angle) * radius,
                ring.y,
                Math.cos(angle) * radius
            ));
        })
    );

    const panels = ["wall", "rim", "inside"] as const;
    const vDirections = [[0, 1], [0, 1], [1, 0]] as const;

    for (let layer = 0; layer < panels.length; layer++) {
        const panel = panels[layer]!;
        const [v0, v1] = vDirections[layer]!;

        for (let i = 0; i < SIDES; i++) {
            const next = (i + 1) % SIDES;
            mesh.addIndexedFace([
                vertices[layer]![i]!,
                vertices[layer]![next]!,
                vertices[layer + 1]![next]!,
                vertices[layer + 1]![i]!
            ], [
                atlas.uv(panel, i / SIDES, v0),
                atlas.uv(panel, (i + 1) / SIDES, v0),
                atlas.uv(panel, (i + 1) / SIDES, v1),
                atlas.uv(panel, i / SIDES, v1)
            ], "well");
        }
    }

    const center = mesh.addVertex(new THREE.Vector3(0, WATER, 0));
    for (let i = 0; i < SIDES; i++) {
        const next = (i + 1) % SIDES;
        const uv = (index: number) => {
            const angle = index * Math.PI * 2 / SIDES;
            const radius = 0.48 * (
                INNER_RADIUS + EDGE_VARIATION[index]! * 0.4
            ) / INNER_RADIUS;
            return new THREE.Vector2(
                0.5 + Math.sin(angle) * radius,
                0.5 + Math.cos(angle) * radius
            );
        };

        mesh.addIndexedFace([
            center,
            vertices[3]![i]!,
            vertices[3]![next]!
        ], [
            new THREE.Vector2(0.5, 0.5),
            uv(i),
            uv(next)
        ], "water");
    }

    return surfaceMesh({
        name: "VillageWell",
        geometry: geometryResult(mesh.build()),
        materials: {
            well: atlas.material,
            water: new THREE.MeshStandardMaterial({
                name: "WellWater",
                color: "#167ed5",
                roughness: 1,
                metalness: 0
            })
        }
    });
}
