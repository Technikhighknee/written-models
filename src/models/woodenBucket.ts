import { AuthoredMeshBuilder } from "../toolbox/geometry/mesh/AuthoredMeshBuilder";
import { bucketFinish } from "../material-system/recipes";
import { disk, paintedMesh, turnedSurface } from "./components/paintedForms";

export default {
    slug: "painted-bucket",
    title: "Wooden Bucket",
    description: "A simple hollow wooden pail with painted staves and bindings.",
    category: "vessels" as const,
    create
};

function create() {
    const atlas = bucketFinish();
    const builder = new AuthoredMeshBuilder({ weld: "none" });
    const sides = 20;
    turnedSurface(builder, [
        { radius: 0.245, y: 0.016 },
        { radius: 0.320, y: 0.575 },
        { radius: 0.288, y: 0.575 },
        { radius: 0.220, y: 0.085 }
    ], [
        { panel: "staves", fromV: 0, toV: 1 },
        { panel: "staves", fromV: 0.97, toV: 1 },
        { panel: "staves", fromV: 1, toV: 0.08 }
    ], sides, atlas);
    disk(builder, 0.085, 0.220, sides, atlas, "floor");

    return paintedMesh("PaintedWoodenBucket", builder, atlas);
}
