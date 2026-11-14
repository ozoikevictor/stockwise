import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
// Reuse the project's existing installed build tools; no second npm install needed.
const projectRequire = createRequire(path.join(root, "../frontend/package.json"));
const { build } = await import(pathToFileURL(projectRequire.resolve("vite")).href);
await build({
  configFile: false,
  root,
  resolve: { alias: { zod: projectRequire.resolve("zod") } },
  build: {
    ssr: path.join(root, "src/index.ts"),
    target: "node22",
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
    rollupOptions: { output: { format: "cjs", entryFileNames: "backend.cjs" } },
  },
  ssr: { noExternal: true },
});
