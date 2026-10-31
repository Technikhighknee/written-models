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

    // The hoops lie on the flat outside rim of each end face, not on
    // the vertical barrel wall. The wooden heads sit slightly recessed.
    const headRadius = 0.343;
    const rimRadius = 0.370;
    const bottom = 0.025;
    const top = 1.08;
    const inset = 0.030;

    turnedSurface(builder, [
        { radius: headRadius, y: bottom + inset },
        { radius: headRadius, y: bottom },
        { radius: rimRadius, y: bottom },
        { radius: 0.405, y: 0.25 },
        { radius: 0.405, y: 0.855 },
        { radius: rimRadius, y: top },
        { radius: headRadius, y: top },
        { radius: headRadius, y: top - inset }
    ], [
        { panel: "staves", fromV: 0.05, toV: 0.02 },
        { panel: "endHoop", fromV: 0, toV: 1 },
        { panel: "staves", fromV: 0, toV: 0.21 },
        { panel: "staves", fromV: 0.21, toV: 0.79 },
        { panel: "staves", fromV: 0.79, toV: 1 },
        { panel: "endHoop", fromV: 1, toV: 0 },
        { panel: "staves", fromV: 0.98, toV: 0.95 }
    ], sides, atlas);

    disk(builder, top - inset, headRadius, sides, atlas, "head");
    disk(builder, bottom + inset, headRadius, sides, atlas, "head", "down");

    return paintedMesh("PaintedBarrel", builder, atlas);
}
