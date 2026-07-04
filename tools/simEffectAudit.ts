/**
 * Per-effect sim verification — `pnpm sim:effects`.
 *
 * For every gear-effect class, runs SIM_EFFECT_RUNS paired-seed simulations:
 * the same dungeon seeds played with and without a starting item that carries
 * ONLY that effect (at its epic-tier magnitude). Reports:
 *   - triggers: how many times the effect actually fired across all runs
 *   - winDelta / roomsDelta: paired lift vs the bare baseline
 * Writes data/effect_audit_latest.json and asserts every effect fired at
 * least once, so a silently-dead effect class fails the audit.
 *
 * Options: SIM_EFFECT_RUNS=120 SIM_SEED=920000 pnpm sim:effects
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  EFFECT_LABELS,
  recalculatePlayerFromGear,
  simulateReactRun,
  skilledPolicy,
  type EffectKey,
  type GameState,
  type Item,
  type SimRunResult,
} from "../src/features/playtest/engine";

const RUNS = Math.max(10, Number(process.env.SIM_EFFECT_RUNS || 120));
const SEED = Number(process.env.SIM_SEED || 920000);
const OUT = resolve(process.cwd(), "data/effect_audit_latest.json");

// epic-tier magnitude for each class (what a strong drop feels like mid-run)
const AUDIT_VALUES: Record<EffectKey, number> = {
  thorns: 3,
  battle_start_block: 4,
  battle_start_bolt: 3,
  stamina_on_kill: 1,
  heal_on_kill: 2,
  heal_on_clear: 2,
  deny_bonus: 3,
  counter_bonus: 4,
  guard_pierce_block: 1,
  guard_heavy_block: 1,
  max_stamina: 1,
  potion_boost: 4,
  crit_chance: 0.08,
  crit_splash: 3,
};

function withEffectItem(key: EffectKey, value: number) {
  return (state: GameState): GameState => {
    const gear: Item = {
      kind: "focus",
      slot: "focus",
      name: `Audit ${key}`,
      desc: "",
      power: 7.5,
      isUnique: false,
      rarity: "epic",
      effects: [{ key, value }],
    };
    state.player.items = [gear];
    recalculatePlayerFromGear(state);
    return state;
  };
}

function summarize(results: SimRunResult[]) {
  return {
    wins: results.filter((r) => r.won).length,
    rooms: results.reduce((sum, r) => sum + r.roomsCleared, 0) / results.length,
  };
}

it(`audits every effect class over ${RUNS} paired seeds`, () => {
  const baseline: SimRunResult[] = Array.from({ length: RUNS }, (_, i) => simulateReactRun(SEED + i * 7919, 2000, skilledPolicy));
  const base = summarize(baseline);

  const rows = (Object.keys(AUDIT_VALUES) as EffectKey[]).map((key) => {
    const value = AUDIT_VALUES[key];
    const runs = Array.from({ length: RUNS }, (_, i) =>
      simulateReactRun(SEED + i * 7919, 2000, skilledPolicy, withEffectItem(key, value))
    );
    const triggers = runs.reduce((sum, r) => sum + (r.effectTriggers[key] || 0), 0);
    const s = summarize(runs);
    return {
      effect: key,
      label: EFFECT_LABELS[key],
      audit_value: value,
      triggers,
      triggers_per_run: Number((triggers / RUNS).toFixed(2)),
      win_rate: Number((s.wins / RUNS).toFixed(4)),
      win_delta: Number(((s.wins - base.wins) / RUNS).toFixed(4)),
      rooms_delta: Number((s.rooms - base.rooms).toFixed(2)),
    };
  });

  const report = {
    runs: RUNS,
    seed: SEED,
    baseline: { win_rate: Number((base.wins / RUNS).toFixed(4)), avg_rooms: Number(base.rooms.toFixed(2)) },
    note: "Paired seeds: identical dungeons with vs without a single-effect starting item at epic magnitude.",
    effects: rows,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  // eslint-disable-next-line no-console
  console.log(`wrote ${OUT}`);
  // eslint-disable-next-line no-console
  for (const row of rows) {
    console.log(
      `${row.effect.padEnd(20)} triggers/run ${String(row.triggers_per_run).padStart(6)} | win ${row.win_rate} (Δ ${row.win_delta}) | rooms Δ ${row.rooms_delta}`
    );
  }

  // every class must actually fire; passive stat-style effects are asserted
  // through their sim-visible consequences instead of a trigger counter
  const passive: EffectKey[] = ["crit_chance", "max_stamina", "deny_bonus", "counter_bonus"];
  for (const row of rows) {
    if (passive.includes(row.effect)) continue;
    expect(row.triggers, `${row.effect} never fired in ${RUNS} runs`).toBeGreaterThan(0);
  }
  // passive classes must at least move outcomes vs baseline (any direction)
  for (const key of passive) {
    const row = rows.find((r) => r.effect === key)!;
    expect(Math.abs(row.rooms_delta) + Math.abs(row.win_delta), `${key} shows zero sim impact`).toBeGreaterThan(0);
  }
});
