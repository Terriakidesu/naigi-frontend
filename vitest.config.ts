import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "#platform": fileURLToPath(new URL("./src/platform/web.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Avoid spawning a worker per CPU and starving DOM workers on large hosts.
    maxWorkers: 2,
  },
});
