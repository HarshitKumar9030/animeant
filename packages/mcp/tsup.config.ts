import { defineConfig } from "tsup";

// One self-contained file: core is bundled in, the SDK and zod stay as dependencies.
export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node20",
  clean: true,
  noExternal: ["@animeant/core"],
  banner: { js: "#!/usr/bin/env node" },
});
