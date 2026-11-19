import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    fs: { allow: [".."] },
    proxy: { "/ws": { target: "ws://localhost:3000", ws: true } },
  },
});
