import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: { host: "0.0.0.0", port: 5173, proxy: { "/online-api": { target: "http://127.0.0.1:3003", changeOrigin: true, rewrite: (path) => path.replace(/^\/online-api/, "/api"), configure: (proxy) => { proxy.on("proxyReq", (req) => req.removeHeader("origin")); } } } },
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
  plugins: [
    tsConfigPaths(),
    tanstackStart({ server: { entry: "server" } }),
    nitro(),
    react(),
    tailwindcss(),
  ],
});

