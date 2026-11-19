import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

// Page scripts run inside web pages, so their tests read saved pages through a DOM.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
