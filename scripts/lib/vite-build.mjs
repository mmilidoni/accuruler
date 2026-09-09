import { build } from "vite";
import { rmSync } from "node:fs";

// MV3 background service workers and scripting.executeScript files are classic
// scripts, not ES modules, so each entry is bundled standalone (IIFE, no shared
// chunks) and referenced by a fixed filename from manifest.json. Each entry is
// a separate build pass: the first empties outDir/ and copies public/
// (manifest.json, icons/); the later ones must not wipe that output. Separate
// passes also keep shared modules (e.g. storage.ts) inlined per entry so the
// classic content script never ends up with import statements.
function entryConfig(name, input, outDir, emptyOutDir) {
  return {
    publicDir: "public",
    build: {
      outDir,
      emptyOutDir,
      target: "es2022",
      rollupOptions: {
        input: { [name]: input },
        output: {
          format: "iife",
          entryFileNames: "[name].js",
        },
      },
    },
  };
}

export async function buildExtension(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  await build({
    ...entryConfig("background", "src/background.ts", outDir, true),
    logLevel: "warn",
  });
  await build({
    ...entryConfig("content", "src/content/index.ts", outDir, false),
    logLevel: "warn",
  });
  await build({
    ...entryConfig("options", "src/options.ts", outDir, false),
    logLevel: "warn",
  });
}