import { models } from "../models/index.js";

export function resolveRoute(pathname) {
    const slug = pathname.replace(/^\/+|\/+$/g, "");

    if (slug === "") {
        return { type: "home" };
    };

    const model = models.find((entry) => entry.slug === slug);

    if (model) {
        return {
            type: "model",
            model
        };
    }

    return { type: "not-found" };
}