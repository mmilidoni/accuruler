// Same bundles as the production build, but the manifest additionally grants
// <all_urls> host permissions so automated tests can inject the content script
// without a user gesture (activeTab is only granted by a real action click).
import { buildExtension } from "./lib/vite-build.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const outDir = "dist-test";
await buildExtension(outDir);

const manifestPath = `${outDir}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.host_permissions = ["<all_urls>"];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`AccuRuler test build complete -> ${outDir}/ (host_permissions: <all_urls>)`);