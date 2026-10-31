import { crateFinish } from "../material-system/recipes";
import { paintedBox } from "./components/paintedForms";

export default {
    slug: "painted-crate",
    title: "Wooden Crate",
    description: "A braced cargo crate, painted onto twelve triangles.",
    category: "vessels" as const,
    create
};

function create() {
    return paintedBox("PaintedCrate", 0.86, 0.78, 0.78,
        crateFinish(), "planks");
}
