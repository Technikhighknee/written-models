import type { Object3D } from "three";

import table from "./table";
import barrel from "./barrel";
import sandingpaper from "./sandingpaper";

export interface ModelDefinition {
    slug: string;
    title: string;
    description: string;
    create: () => Object3D
}

export const models: readonly ModelDefinition[] = [
    table,
    barrel,
    sandingpaper
];
