import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // The DB tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
