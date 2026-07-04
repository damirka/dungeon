import { describe, expect, it } from "vitest";
import { comparePolicies, estimateReactWinRate, randomPolicy, simulateReactRun, skilledPolicy } from "./index";

describe("React engine tactical sim", () => {
  it("replays a run deterministically by seed (both policies)", () => {
    expect(simulateReactRun(12345)).toEqual(simulateReactRun(12345));
    expect(simulateReactRun(12345, 2000, randomPolicy)).toEqual(simulateReactRun(12345, 2000, randomPolicy));
  });

  it("accounts for every run: wins + deaths + timeouts = runs", () => {
    for (const policy of [skilledPolicy, randomPolicy]) {
      const summary = estimateReactWinRate(30, 424242, policy);
      expect(summary.wins + summary.deaths + summary.timeouts).toBe(summary.runs);
      expect(summary.deaths).toBe(Object.values(summary.deathsByLevel).reduce((sum, count) => sum + count, 0));
    }
  });

  it("keeps depth metrics structurally sound", () => {
    const summary = estimateReactWinRate(40, 9000);
    // deeper floors can never be reached more often than shallower ones
    expect(summary.reachL2Rate).toBeGreaterThanOrEqual(summary.reachL3Rate);
    expect(summary.reachL3Rate).toBeGreaterThanOrEqual(summary.reachL4Rate);
    expect(summary.reachL4Rate).toBeGreaterThanOrEqual(summary.reachL5Rate);
    expect(summary.reachL1BossRate).toBeGreaterThanOrEqual(summary.reachL2BossRate);
    expect(summary.reachL2BossRate).toBeGreaterThanOrEqual(summary.reachL3BossRate);
    expect(summary.reachL3BossRate).toBeGreaterThanOrEqual(summary.reachL4BossRate);
    expect(summary.reachL4BossRate).toBeGreaterThanOrEqual(summary.reachL5BossRate);
    // a boss can only be cleared if it was reached
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(summary[`reachL${level}BossRate`]).toBeGreaterThanOrEqual(summary[`clearL${level}BossRate`]);
    }
    // winning means clearing the L5 boss
    expect(summary.winRate).toBe(summary.clearL5BossRate);
    expect(Object.values(summary.actions).reduce((sum, count) => sum + count, 0)).toBeGreaterThan(0);
  });

  it("paired-seed comparison builds identical dungeons per seed", () => {
    const comparison = comparePolicies(5, 777, skilledPolicy, randomPolicy);
    expect(comparison.a.runs).toBe(5);
    expect(comparison.b.runs).toBe(5);
    expect(comparison.seedsOnlyAWon + comparison.seedsOnlyBWon).toBeLessThanOrEqual(5);
    expect(comparison.pairedWinDelta).toBeCloseTo(comparison.a.winRate - comparison.b.winRate, 10);
  });

  // Locked balance snapshot for a fixed seed. This is the fast-tier drift gate:
  // any engine change that shifts combat, loot, or room generation flips this.
  // If the change is a *deliberate* balance pass, re-lock it (vitest -u) and run
  // `pnpm sim:balance` to refresh data/balance_metrics_latest.json.
  it("locks the 40-run skilled summary for seed 9000", () => {
    const { deathsByRoomKind: _drop, ...summary } = estimateReactWinRate(40, 9000);
    expect(summary).toMatchInlineSnapshot(`
      {
        "actions": {
          "ability": 200,
          "attack": 2634,
          "bash": 611,
          "end": 0,
          "guard": 579,
          "heavy": 1539,
          "sweep": 2,
        },
        "avgRoomsCleared": 28.4,
        "clearL1BossRate": 1,
        "clearL2BossRate": 0.975,
        "clearL3BossRate": 0.85,
        "clearL4BossRate": 0.075,
        "clearL5BossRate": 0,
        "deaths": 40,
        "deathsByLevel": {
          "L2": 1,
          "L3": 5,
          "L4": 31,
          "L5": 3,
        },
        "policy": "skilled",
        "reachL1BossRate": 1,
        "reachL2BossRate": 0.975,
        "reachL2Rate": 1,
        "reachL3BossRate": 0.875,
        "reachL3Rate": 0.975,
        "reachL4BossRate": 0.55,
        "reachL4Rate": 0.85,
        "reachL5BossRate": 0.05,
        "reachL5Rate": 0.075,
        "roomsP50": 31,
        "roomsP75": 31,
        "roomsP90": 31,
        "roomsP95": 35,
        "roomsP99": 39,
        "runs": 40,
        "seed": 9000,
        "timeouts": 0,
        "winRate": 0,
        "wins": 0,
      }
    `);
  });
});
