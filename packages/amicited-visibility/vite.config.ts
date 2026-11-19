import "vite-plus/test/config";
import { defineConfig } from "vite-plus";

// Engine page scripts run against saved answers in jsdom; everything else runs in Node.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.dom.test.ts"],
        },
      },
      { test: { name: "dom", environment: "jsdom", include: ["src/**/*.dom.test.ts"] } },
    ],
  },
});
