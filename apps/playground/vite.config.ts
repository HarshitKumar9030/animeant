import { defineConfig } from "vite";

// Relative asset paths, so the build works on any static host or subpath
// (GitHub Pages serves it under /animeant/).
export default defineConfig({ base: "./" });
