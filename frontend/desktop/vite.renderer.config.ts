import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  plugins: [tsconfigPaths(), tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"] },
  build: { outDir: process.env.STOCKWISE_WEB_BUILD ? "dist-web" : "dist-desktop", emptyOutDir: true },
});
