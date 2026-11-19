import { defineConfig } from "vite-plus";

// Store policy forbids extensions from running code they did not ship, so the background
// bundles every page script; minifying would rename what Playwright and the extension share.
export default defineConfig({
  pack: {
    entry: ["src/background.ts"],
    format: "iife",
    platform: "browser",
    outDir: "dist",
    dts: false,
    minify: false,
    clean: true,
    outputOptions: { codeSplitting: false },
    deps: { alwaysBundle: () => true },
  },
});
