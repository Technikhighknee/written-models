import { models } from "../models/index";
import type { ModelDefinition } from "../models/index";

export type Route =
    | { type: "home" }
    | { type: "model", model: ModelDefinition }
    | { type: "not-found" };

export function resolveRoute(pathname: string): Route {
    const slug = pathname.replace(/^\/+|\/+$/g, "");

    if (slug === "") {
        return { type: "home" };
    };

    const model = models.find(
        entry => entry.slug === slug
    );

    if (model) {
        return {
            type: "model",
            model
        };
    }

    return { type: "not-found" };
}
