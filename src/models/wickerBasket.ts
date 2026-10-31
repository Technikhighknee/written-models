import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { basketFinish } from "../material-system/recipes";
import { disk, paintedMesh, turnedSurface } from "./components/paintedForms";

export default {
    slug: "painted-basket",
    title: "Wicker Basket",
    description: "An open basket, with over-under wicker authored in the material.",
    category: "vessels" as const,
    create
};

function create() {
    const atlas = basketFinish();
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const sides = 24;
    turnedSurface(builder, [
        { radius: 0.255, y: 0.025 },
        { radius: 0.348, y: 0.545 },
        { radius: 0.311, y: 0.545 },
        { radius: 0.230, y: 0.115 }
    ], [
        { panel: "weave", fromV: 0, toV: 1 },
        { panel: "weave", fromV: 0.93, toV: 1 },
        { panel: "inside", fromV: 1, toV: 0 }
    ], sides, atlas);
    disk(builder, 0.115, 0.230, sides, atlas, "inside");

    return paintedMesh("PaintedWickerBasket", builder, atlas);
}
