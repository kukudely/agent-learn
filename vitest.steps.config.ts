import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/steps/**/*.test.ts"],
    sequence: {
      concurrent: false,
    },
    testTimeout: 15_000,
  },
});
