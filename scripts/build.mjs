import { buildExtension } from "./lib/vite-build.mjs";

await buildExtension("dist");
console.log("AccuRuler build complete -> dist/");