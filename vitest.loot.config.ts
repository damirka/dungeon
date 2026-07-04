import { defineConfig } from "vitest/config";

// Loot preview runner: `pnpm loot:preview` (see tools/lootPreview.ts).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tools/lootPreview.ts"],
    testTimeout: 600_000,
  },
});
