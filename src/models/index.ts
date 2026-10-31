import type { Object3D } from "three";
import type { ModelCategorySlug } from "./categories";

import table from "./table";
import barrel from "./barrel";
import sandingpaper from "./sandingpaper";
import plank from "./plank";
import dagger from "./dagger";
import beerMug from "./beerMug";
import tavernChair from "./tavernChair";
import tavernBench from "./tavernBench";
import well from "./well";
import crate from "./crate";
import paintedBarrel from "./paintedBarrel";
import woodenBucket from "./woodenBucket";
import wickerBasket from "./wickerBasket";

export interface ModelDefinition {
    slug: string;
    title: string;
    description: string;
    category: ModelCategorySlug;
    create: () => Object3D
}

export const models: readonly ModelDefinition[] = [
    table,
    barrel,
    sandingpaper,
    plank,
    dagger,
    beerMug,
    tavernChair,
    tavernBench,
    well,
    crate,
    paintedBarrel,
    woodenBucket,
    wickerBasket
];
