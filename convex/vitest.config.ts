import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
    // The convex `_generated/` stub directory has placeholder types that
    // would error under strict TS — exclude it from test transforms.
    exclude: ["node_modules", "_generated"],
  },
});
