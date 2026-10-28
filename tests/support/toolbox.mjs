import { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
    appType: "custom",
    server: { middlewareMode: true },
    logLevel: "silent"
});

after(() => vite.close());

export const toolbox = path => vite.ssrLoadModule(`/src/toolbox/${path}`);
