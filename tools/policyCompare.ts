/**
 * Paired-seed policy A/B — `pnpm sim:policies`.
 *
 * Runs the skilled baseline against a challenger policy on IDENTICAL dungeon
 * seeds and reports the paired lift. Used to test player-suggested principles
 * (e.g. "always bash a heavy telegraph") against the greedy baseline.
 *
 * Options: SIM_POLICY_RUNS=600 SIM_SEED=920000 pnpm sim:policies
 */
import { expect, it } from "vitest";
import { bashHeavyPolicy, comparePolicies, skilledPolicy } from "../src/features/playtest/engine";

const RUNS = Math.max(50, Number(process.env.SIM_POLICY_RUNS || 600));
const SEED = Number(process.env.SIM_SEED || 920000);

it(`compares skilled vs bash-heavy over ${RUNS} paired seeds`, () => {
  const result = comparePolicies(RUNS, SEED, skilledPolicy, bashHeavyPolicy);
  const row = (name: string, s: typeof result.a) =>
    // eslint-disable-next-line no-console
    console.log(
      `${name.padEnd(12)} win ${(s.winRate * 100).toFixed(2)}% | rooms ${s.avgRoomsCleared.toFixed(1)} | ` +
        `reach L4 ${(s.reachL4Rate * 100).toFixed(1)}% L5 ${(s.reachL5Rate * 100).toFixed(1)}% | bash uses ${s.actions.bash}`
    );
  row(result.a.policy, result.a);
  row(result.b.policy, result.b);
  // eslint-disable-next-line no-console
  console.log(
    `paired: winΔ ${(result.pairedWinDelta * 100).toFixed(2)}pts | roomsΔ ${result.pairedRoomsDeltaMean.toFixed(2)} | ` +
      `seeds only ${result.a.policy} won: ${result.seedsOnlyAWon} | only ${result.b.policy} won: ${result.seedsOnlyBWon}`
  );
  expect(result.a.runs).toBe(RUNS);
});
