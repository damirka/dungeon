import { defineConfig } from "vitest/config";

// Effect audit runner: `pnpm sim:effects`. For every gear-effect class, runs
// paired-seed simulations (with vs without a starting item bearing only that
// effect) and reports trigger counts + win/rooms lift. Kept out of the regular
// vitest config so `pnpm test:engine` stays fast.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tools/simEffectAudit.ts"],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
});
