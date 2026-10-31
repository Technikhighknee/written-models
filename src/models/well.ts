import * as THREE from "three";

import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { wellFinish } from "../material-system/recipes";
import { disk, paintedMesh, turnedSurface } from "./components/paintedForms";

export default {
    slug: "village-well",
    title: "Village Well",
    description: "Well, well, well.",
    category: "architecture" as const,
    create
};

function create(): THREE.Mesh {
    const atlas = wellFinish();
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const sides = 32;

    turnedSurface(builder, [
        { radius: 0.748, y: 0.01 },
        { radius: 0.748, y: 0.607 },
        { radius: 0.473, y: 0.607 },
        { radius: 0.473, y: 0.30 }
    ], [
        { panel: "wall", fromV: 0, toV: 1 },
        { panel: "rim", fromV: 0, toV: 1 },
        { panel: "inside", fromV: 1, toV: 0 }
    ], sides, atlas);

    disk(builder, 0.30, 0.473, sides, atlas, "water");

    return paintedMesh("VillageWell", builder, atlas);
}
