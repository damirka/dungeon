import { defineConfig } from "vitest/config";

// Paired-seed policy A/B runner: `pnpm sim:policies` (see tools/policyCompare.ts).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tools/policyCompare.ts"],
    testTimeout: 3_600_000,
  },
});
