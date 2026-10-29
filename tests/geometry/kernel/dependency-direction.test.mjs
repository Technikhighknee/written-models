import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../src");
const geometry = join(root, "toolbox", "geometry");

function files(directory) {
    return readdirSync(directory, {withFileTypes: true}).flatMap(item => {
        const path = join(directory, item.name);
        return item.isDirectory() ? files(path) :
            item.name.endsWith(".ts") ? [path] : [];
    });
}

function targetOf(file, specifier) {
    const resolved = resolve(dirname(file), specifier);
    return resolved.replace(/\.(?:js|mjs)$/, ".ts");
}

test("the geometry kernel and build/edit/query layers never depend on model recipes or render adapters", () => {
    const violations = [];

    for (const file of files(geometry)) {
        const relativePath = relative(geometry, file).split(sep).join("/");
        const sourceLayer = relativePath.split("/")[0];
        if (!["kernel", "definitions", "build", "edit", "queries", "uv"]
            .includes(sourceLayer)) continue;

        // This is the public API barrel, not a kernel implementation.
        if (relativePath === "kernel/index.ts") continue;

        const source = readFileSync(file, "utf8");
        const imports = [
            ...source.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g),
            ...source.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']/g)
        ];

        for (const match of imports) {
            const target = targetOf(file, match[1]);
            const dependency = relative(root, target).split(sep).join("/");
            const base = "toolbox/geometry/";

            const forbidden = (
                dependency.startsWith("models/") ||
                dependency.startsWith("core/") ||
                dependency.startsWith("materials/") ||
                (sourceLayer === "kernel" ||
                    sourceLayer === "definitions") &&
                    [
                        "build/", "edit/", "queries/",
                        "construction/", "materials/"
                    ].some(part => dependency.startsWith(base + part)) ||
                ["build", "edit", "queries", "uv"].includes(sourceLayer) &&
                    dependency.startsWith(base + "construction/") ||
                ["build", "edit", "queries", "uv", "kernel", "definitions"]
                    .includes(sourceLayer) &&
                    [
                        "mesh/surfaceMesh.ts",
                        "mesh/toBufferGeometry.ts",
                        "mesh/controlOutline.ts"
                    ].some(path => dependency === base + path)
            );
            if (forbidden) violations.push(
                relativePath + " -> " + dependency
            );
        }
    }

    assert.deepEqual(violations, [],
        "Geometry dependencies must point toward the shared source kernel");
});
