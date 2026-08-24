import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: `${projectRoot}static-spa`,
  publicDir: `${projectRoot}public`,
  plugins: [react()],
  build: {
    outDir: `${projectRoot}pages-dist`,
    emptyOutDir: true,
    sourcemap: false,
  },
});
