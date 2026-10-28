import { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
    appType: "custom",
    server: { middlewareMode: true },
    logLevel: "silent"
});

after(() => vite.close());

export const sourceModule = path => vite.ssrLoadModule(`/src/${path}`);
export const toolbox = path => sourceModule(`toolbox/${path}`);
