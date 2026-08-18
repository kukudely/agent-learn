import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/steps/**/*.test.ts", "node_modules/**", "dist/**"],
  },
});
