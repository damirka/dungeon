import { defineConfig } from "vitest/config";

// Dedicated config for the engine unit tests. We deliberately do NOT reuse
// vite.config.ts: the app config loads the React/Tailwind/dev-server plugins
// (and the mapper API plugin) which the pure-logic engine tests never need.
// The engine is plain TypeScript with no JSX, so esbuild transforms suffice.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
