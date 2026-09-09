// Packages dist/ into a single zip (release/accuruler-<version>.zip) that is
// valid for both Chrome Web Store and Firefox AMO. Chrome/Edge ignore
// browser_specific_settings; AMO signs the upload.
import webExt from "web-ext";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildExtension } from "./lib/vite-build.mjs";

const DIST = "dist";
const RELEASE_DIR = "release";

await buildExtension(DIST);

const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
mkdirSync(RELEASE_DIR, { recursive: true });

const { extensionPath } = await webExt.cmd.build(
  {
    sourceDir: DIST,
    artifactsDir: RELEASE_DIR,
    overwriteDest: true,
  },
  { shouldExitProgram: false },
);

console.log(
  `Packaged ${manifest.name} v${manifest.version} -> ${extensionPath} (CWS + AMO ready)`,
);