import { defineConfig } from "vitest/config";

// Slow-tier balance batch runner: `pnpm sim:balance`. Kept out of the regular
// vitest config (src/**/*.test.ts) so `pnpm test:engine` stays fast. Runs
// tools/simBalanceReport.ts, which simulates SIM_RUNS runs per policy and
// rewrites data/balance_metrics_latest.json.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tools/simBalanceReport.ts"],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
});
