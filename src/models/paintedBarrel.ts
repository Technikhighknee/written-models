import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { barrelFinish } from "../material-system/recipes";
import { disk, paintedMesh, turnedSurface } from "./components/paintedForms";

export default {
    slug: "painted-barrel",
    title: "Painted Barrel",
    description: "Staves, iron hoops and wear carried by a painted surface.",
    category: "vessels" as const,
    create
};

function create() {
    const atlas = barrelFinish();
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const sides = 24;
    turnedSurface(builder, [
        { radius: 0.325, y: 0.025 },
        { radius: 0.405, y: 0.25 },
        { radius: 0.405, y: 0.855 },
        { radius: 0.325, y: 1.08 }
    ], [
        { panel: "staves", fromV: 0, toV: 0.21 },
        { panel: "staves", fromV: 0.21, toV: 0.79 },
        { panel: "staves", fromV: 0.79, toV: 1 }
    ], sides, atlas);
    disk(builder, 1.08, 0.325, sides, atlas, "head");
    disk(builder, 0.025, 0.325, sides, atlas, "head", "down");

    return paintedMesh("PaintedBarrel", builder, atlas);
}
