import type { Object3D } from "three";

import table from "./table";
import barrel from "./barrel";
import sandingpaper from "./sandingpaper";
import plank from "./plank";
import dagger from "./dagger";

export interface ModelDefinition {
    slug: string;
    title: string;
    description: string;
    create: () => Object3D
}

export const models: readonly ModelDefinition[] = [
    table,
    barrel,
    sandingpaper,
    plank,
    dagger
];
