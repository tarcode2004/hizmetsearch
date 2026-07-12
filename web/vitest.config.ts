import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Component/unit test config (T5 citation-chip suite). Kept separate from
// vite.config.ts so the app build config stays untouched; aliases must
// mirror it.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@convex": path.resolve(__dirname, "../convex/_generated"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
