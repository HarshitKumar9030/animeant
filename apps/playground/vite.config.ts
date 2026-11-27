import { resolve } from "node:path";
import { defineConfig } from "vite";

// Relative asset paths, so the build works on any static host or subpath
// (GitHub Pages serves it under /animeant/).
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, "index.html"), three: resolve(__dirname, "3d.html"), film: resolve(__dirname, "film.html") },
    },
  },
});
