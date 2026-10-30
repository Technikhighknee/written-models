import { models } from "../models/index";
import type { ModelDefinition } from "../models/index";
import { categories } from "../models/categories";
import type { ModelCategory } from "../models/categories";

export type Route =
    | { type: "home" }
    | { type: "all-models" }
    | { type: "category"; category: ModelCategory }
    | { type: "model"; model: ModelDefinition }
    | { type: "not-found" };

export function resolveRoute(pathname: string): Route {
    const slug = pathname.replace(/^\/+|\/+$/g, "");

    if (slug === "") return { type: "home" };
    if (slug === "models") return { type: "all-models" };

    const match = /^categories\/([^/]+)$/.exec(slug);
    if (match) {
        const category = categories.find(item => item.slug === match[1]);
        return category ? { type: "category", category } : { type: "not-found" };
    }

    const model = models.find(entry => entry.slug === slug);
    return model ? { type: "model", model } : { type: "not-found" };
}
