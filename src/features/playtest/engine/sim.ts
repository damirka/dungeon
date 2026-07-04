import {
  abilityAvailable,
  advanceRoom,
  applyAction,
  bashAvailable,
  beginRun,
  canAffordAction,
  expectedIncomingDamage,
  expectedPlayerDamage,
  guardBlockAmount,
  newGame,
  resolveLoot,
  selectTarget,
  type EffectKey,
  type Enemy,
  type GameState,
  type PlayerAction,
  type Room,
} from "./core";
import { recommendedLootIndex } from "./loot";

export interface SimRunResult {
  won: boolean;
  /** Hit the step guard without winning or dying (should be rare; flags stalemates). */
  timedOut: boolean;
  roomsCleared: number;
  highestLevel: number;
  reachedBosses: number[];
  clearedBosses: number[];
  deathRoom: Pick<Room, "level" | "kind" | "slot" | "powerLevel" | "elite"> | null;
  actions: Record<PlayerAction, number>;
  effectTriggers: Partial<Record<EffectKey, number>>;
}

export interface SimSummary {
  runs: number;
  seed: number;
  policy: string;
  wins: number;
  deaths: number;
  timeouts: number;
  winRate: number;
  avgRoomsCleared: number;
  roomsP50: number;
  roomsP75: number;
  roomsP90: number;
  roomsP95: number;
  roomsP99: number;
  reachL2Rate: number;
  reachL3Rate: number;
  reachL4Rate: number;
  reachL5Rate: number;
  reachL1BossRate: number;
  reachL2BossRate: number;
  reachL3BossRate: number;
  reachL4BossRate: number;
  reachL5BossRate: number;
  clearL1BossRate: number;
  clearL2BossRate: number;
  clearL3BossRate: number;
  clearL4BossRate: number;
  clearL5BossRate: number;
  deathsByLevel: Record<string, number>;
  deathsByRoomKind: Record<string, number>;
  actions: Record<PlayerAction, number>;
}

export function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function withRandom<T>(rng: () => number, fn: () => T): T {
  const original = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function aliveEnemyIndexes(s: GameState): number[] {
  return s.enemies.map((enemy, index) => ({ enemy, index })).filter(({ enemy }) => enemy.hp > 0).map(({ index }) => index);
}

function enemyPriority(enemy: Enemy): number {
  let score = 0;
  if (enemy.tags.includes("boss")) score += 5;
  if (enemy.tags.includes("mage-support")) score += 3;
  if (enemy.intent === "heal" || enemy.intent === "shield") score += 2.5;
  if (enemy.tags.includes("hp-check")) score += 1.1;
  if (enemy.tags.includes("burst-check")) score += 0.8;
  score += (enemy.intentDamage || 0) * 0.08;
  return score;
}

function chooseTargetIndex(s: GameState): number {
  const alive = aliveEnemyIndexes(s);
  if (!alive.length) return 0;
  return alive.reduce((best, index) => {
    const enemy = s.enemies[index];
    const bestEnemy = s.enemies[best];
    const damage = expectedPlayerDamage(s, enemy, "attack");
    const bestDamage = expectedPlayerDamage(s, bestEnemy, "attack");
    const score = enemyPriority(enemy) + damage / Math.max(1, enemy.hp) + (enemy.hp <= damage * 1.1 ? 1.5 : 0);
    const bestScore = enemyPriority(bestEnemy) + bestDamage / Math.max(1, bestEnemy.hp) + (bestEnemy.hp <= bestDamage * 1.1 ? 1.5 : 0);
    return score > bestScore ? index : best;
  }, alive[0]);
}

function isPriorityThreat(enemy: Enemy | undefined): boolean {
  return Boolean(enemy?.tags.some((tag) => tag === "boss" || tag === "elite" || tag === "tank" || tag === "hp-check"));
}

function bestSingleTargetDamage(s: GameState, target: Enemy): number {
  const actions: PlayerAction[] = ["attack", "heavy"];
  return Math.max(
    ...actions.map((action) => (canAffordAction(s.player, action) ? expectedPlayerDamage(s, target, action) : 0))
  );
}

/**
 * Greedy per-action policy for the stamina-turn model. The engine resolves the
 * enemy turn automatically once stamina hits 0, so this is called once per
 * action, not once per round. Priorities: secure kills, deny the biggest
 * telegraphed hit, block lethal damage, then spend remaining stamina on the
 * most efficient attack.
 */
export function chooseSimAction(s: GameState): PlayerAction {
  const p = s.player;
  const target = s.enemies[s.selected] && s.enemies[s.selected].hp > 0 ? s.enemies[s.selected] : s.enemies[chooseTargetIndex(s)];
  const alive = aliveEnemyIndexes(s).map((index) => s.enemies[index]);
  const incoming = expectedIncomingDamage(s);
  const attack = expectedPlayerDamage(s, target, "attack");
  const heavy = canAffordAction(p, "heavy") ? expectedPlayerDamage(s, target, "heavy") : 0;
  const targetEffectiveHp = target.hp + (target.block || 0);

  // Kill-secure: never pass up a lethal hit on the current target.
  if (targetEffectiveHp <= attack * 0.95) return "attack";
  if (heavy > 0 && targetEffectiveHp <= heavy * 0.95) return "heavy";

  // Deny with Bash — 2 stamina AND charge-limited, so save it for bosses/elites.
  // Against trash it must prevent near-lethal damage that a cheap Guard can't.
  if (bashAvailable(p) && target && !target.denied && !target.steadied) {
    const threat = target.intentDamage || 0;
    if (isPriorityThreat(target)) {
      if (threat >= 4 && threat >= incoming * 0.5) return "bash";
    } else if (threat >= p.hp * 0.4 && threat > guardBlockAmount(p) * 2) {
      return "bash";
    }
  }

  // Riposte is the once-per-room premium: spend it only on boss/elite pressure.
  if (abilityAvailable(p) && !s.riposteArmed && incoming >= p.hp * 0.25 && isPriorityThreat(target)) return "ability";

  // Guard when the telegraphed damage is lethal, or whenever a guard converts
  // efficiently (absorbs most of its block) and no kill is on the table —
  // trading 1 stamina to erase a Heavy is how boss fights are survived.
  if (canAffordAction(p, "guard") && incoming > 0) {
    const guardBlock = guardBlockAmount(p);
    const afterGuard = expectedIncomingDamage(s, guardBlock);
    const lethalNow = incoming >= p.hp;
    if (lethalNow && afterGuard < p.hp) return "guard";
    const absorbed = incoming - afterGuard;
    if (absorbed >= guardBlock * 0.9 && incoming >= p.hp * 0.12 && targetEffectiveHp > attack) return "guard";
    // cheap mitigation: last stamina point, nothing dies this action anyway
    if (p.stamina === 1 && incoming >= p.hp * 0.3 && afterGuard < incoming) return "guard";
  }

  // Sweep wide rooms.
  if (alive.length >= 2 && canAffordAction(p, "sweep")) {
    const sweepTotal = alive.reduce((sum, enemy) => sum + expectedPlayerDamage(s, enemy, "sweep"), 0);
    const bestSingle = Math.max(...alive.map((enemy) => bestSingleTargetDamage(s, enemy)));
    if (alive.length >= 3 || sweepTotal >= bestSingle * 1.15) return "sweep";
  }

  // Heavy only when it out-damages two attacks (axe payoff) or breaks a guard.
  if (heavy > 0 && (heavy >= attack * 1.9 || (target.intent === "guard" && heavy >= attack))) return "heavy";
  return "attack";
}

// ----------------------------------------------------------------------------
// Policies. The skilled policy is the greedy-EV heuristic above; the random
// policy is the design gate for "random play survives most of L1 but rarely
// passes the L1 boss". Both draw from the run's seeded Math.random stream, so
// runs stay pure functions of the seed. Note the skilled policy consumes no
// RNG, so its seeds replay identically to the pre-policy-abstraction sim.
// ----------------------------------------------------------------------------

export interface SimPolicy {
  name: string;
  chooseTarget(s: GameState): number;
  chooseAction(s: GameState): PlayerAction;
  chooseLoot(s: GameState): number | "skip";
}

export const skilledPolicy: SimPolicy = {
  name: "skilled",
  chooseTarget: chooseTargetIndex,
  chooseAction: chooseSimAction,
  chooseLoot: (s) => {
    const choice = recommendedLootIndex(s);
    return choice >= 0 ? choice : "skip";
  },
};

/**
 * The player-suggested principle under test: ALWAYS bash a live heavy
 * telegraph (re-rolling it into hopefully something smaller), otherwise play
 * the normal skilled policy.
 */
export const bashHeavyPolicy: SimPolicy = {
  name: "bash-heavy",
  chooseTarget: (s) => {
    if (bashAvailable(s.player)) {
      const heavyIndex = s.enemies.findIndex((enemy) => enemy.hp > 0 && enemy.intent === "heavy" && !enemy.steadied);
      if (heavyIndex >= 0) return heavyIndex;
    }
    return chooseTargetIndex(s);
  },
  chooseAction: (s) => {
    const target = s.enemies[s.selected];
    if (target && target.hp > 0 && target.intent === "heavy" && !target.steadied && bashAvailable(s.player)) return "bash";
    return chooseSimAction(s);
  },
  chooseLoot: skilledPolicy.chooseLoot,
};

const RANDOM_ACTIONS: PlayerAction[] = ["attack", "heavy", "sweep", "bash", "guard", "ability", "end"];

export const randomPolicy: SimPolicy = {
  name: "random",
  chooseTarget: (s) => {
    const alive = aliveEnemyIndexes(s);
    return alive[Math.floor(Math.random() * alive.length)] ?? 0;
  },
  chooseAction: (s) => {
    // Uniform over currently-resolvable actions, so every pick advances the turn.
    const options = RANDOM_ACTIONS.filter((action) => {
      if (action === "ability") return abilityAvailable(s.player) && !s.riposteArmed;
      if (action === "bash") return bashAvailable(s.player);
      return canAffordAction(s.player, action);
    });
    return options[Math.floor(Math.random() * options.length)] || "attack";
  },
  chooseLoot: (s) => {
    const roll = Math.floor(Math.random() * (s.draft.length + 1));
    return roll >= s.draft.length ? "skip" : roll;
  },
};

export function simulateReactRun(
  seed: number,
  maxSteps = 2000,
  policy: SimPolicy = skilledPolicy,
  /** Optional pre-run mutation (e.g. inject a starting item for effect audits). */
  prepare?: (state: GameState) => GameState
): SimRunResult {
  return withRandom(makeSeededRng(seed), () => {
    let state = beginRun(prepare ? prepare(newGame()) : newGame());
    const reachedBosses = new Set<number>();
    const clearedBosses = new Set<number>();
    let guard = 0;

    while (guard++ < maxSteps && state.phase !== "won" && state.phase !== "dead") {
      const room = state.dungeon[state.roomIndex];
      if (room?.isBoss) reachedBosses.add(room.level);

      if (state.phase === "combat") {
        if (!aliveEnemyIndexes(state).length) {
          state = advanceRoom(state);
          continue;
        }
        const targetIndex = policy.chooseTarget(state);
        state = selectTarget(state, targetIndex);
        const beforeRoom = state.dungeon[state.roomIndex];
        const beforeCleared = state.stats.roomsCleared;
        state = applyAction(state, policy.chooseAction(state));
        if (beforeRoom?.isBoss && state.stats.roomsCleared > beforeCleared) clearedBosses.add(beforeRoom.level);
        continue;
      }

      if (state.phase === "loot") {
        state = resolveLoot(state, policy.chooseLoot(state));
      }
    }

    const deathRoom = state.phase === "dead" ? state.dungeon[state.roomIndex] || null : null;
    return {
      won: state.phase === "won",
      timedOut: state.phase !== "won" && state.phase !== "dead",
      roomsCleared: state.stats.roomsCleared,
      highestLevel: state.stats.highestLevel,
      reachedBosses: [...reachedBosses].sort((a, b) => a - b),
      clearedBosses: [...clearedBosses].sort((a, b) => a - b),
      deathRoom: deathRoom
        ? { level: deathRoom.level, kind: deathRoom.kind, slot: deathRoom.slot, powerLevel: deathRoom.powerLevel, elite: deathRoom.elite }
        : null,
      actions: state.stats.actions,
      effectTriggers: state.stats.effectTriggers,
    };
  });
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] || 0) + 1;
}

function rate(count: number, runs: number): number {
  return runs ? count / runs : 0;
}

function percentile(sorted: number[], pct: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * pct) - 1));
  return sorted[index];
}

function summarizeResults(results: SimRunResult[], runs: number, seed: number, policyName: string): SimSummary {
  const rooms = results.map((result) => result.roomsCleared).sort((a, b) => a - b);
  const deathsByLevel: Record<string, number> = {};
  const deathsByRoomKind: Record<string, number> = {};
  const actions: Record<PlayerAction, number> = { attack: 0, heavy: 0, sweep: 0, bash: 0, guard: 0, ability: 0, end: 0 };

  for (const result of results) {
    if (result.deathRoom) {
      increment(deathsByLevel, `L${result.deathRoom.level}`);
      increment(
        deathsByRoomKind,
        result.deathRoom.elite
          ? "encounter-elite"
          : `${result.deathRoom.kind}${result.deathRoom.powerLevel ? `-P${result.deathRoom.powerLevel}` : ""}`
      );
    }
    for (const action of Object.keys(actions) as PlayerAction[]) actions[action] += result.actions[action] || 0;
  }

  const wins = results.filter((result) => result.won).length;
  const timeouts = results.filter((result) => result.timedOut).length;

  return {
    runs,
    seed,
    policy: policyName,
    wins,
    deaths: runs - wins - timeouts,
    timeouts,
    winRate: rate(wins, runs),
    avgRoomsCleared: rooms.reduce((sum, value) => sum + value, 0) / Math.max(1, runs),
    roomsP50: percentile(rooms, 0.5),
    roomsP75: percentile(rooms, 0.75),
    roomsP90: percentile(rooms, 0.9),
    roomsP95: percentile(rooms, 0.95),
    roomsP99: percentile(rooms, 0.99),
    reachL2Rate: rate(results.filter((result) => result.highestLevel >= 2).length, runs),
    reachL3Rate: rate(results.filter((result) => result.highestLevel >= 3).length, runs),
    reachL4Rate: rate(results.filter((result) => result.highestLevel >= 4).length, runs),
    reachL5Rate: rate(results.filter((result) => result.highestLevel >= 5).length, runs),
    reachL1BossRate: rate(results.filter((result) => result.reachedBosses.includes(1)).length, runs),
    reachL2BossRate: rate(results.filter((result) => result.reachedBosses.includes(2)).length, runs),
    reachL3BossRate: rate(results.filter((result) => result.reachedBosses.includes(3)).length, runs),
    reachL4BossRate: rate(results.filter((result) => result.reachedBosses.includes(4)).length, runs),
    reachL5BossRate: rate(results.filter((result) => result.reachedBosses.includes(5)).length, runs),
    clearL1BossRate: rate(results.filter((result) => result.clearedBosses.includes(1)).length, runs),
    clearL2BossRate: rate(results.filter((result) => result.clearedBosses.includes(2)).length, runs),
    clearL3BossRate: rate(results.filter((result) => result.clearedBosses.includes(3)).length, runs),
    clearL4BossRate: rate(results.filter((result) => result.clearedBosses.includes(4)).length, runs),
    clearL5BossRate: rate(results.filter((result) => result.clearedBosses.includes(5)).length, runs),
    deathsByLevel,
    deathsByRoomKind,
    actions,
  };
}

export function estimateReactWinRate(runs: number, seed = 920000, policy: SimPolicy = skilledPolicy): SimSummary {
  const results = Array.from({ length: runs }, (_, index) => simulateReactRun(seed + index * 7919, 2000, policy));
  return summarizeResults(results, runs, seed, policy.name);
}

export interface PolicyComparison {
  runs: number;
  seed: number;
  a: SimSummary;
  b: SimSummary;
  /** winRate(a) - winRate(b) over identical dungeon seeds. */
  pairedWinDelta: number;
  /** mean roomsCleared(a) - roomsCleared(b), paired per seed. */
  pairedRoomsDeltaMean: number;
  seedsOnlyAWon: number;
  seedsOnlyBWon: number;
}

/**
 * Paired-seed comparison: the same seed builds the same dungeon regardless of
 * policy (construction consumes the RNG stream before any policy decision), so
 * per-seed deltas cancel dungeon-layout variance. Use this instead of comparing
 * two independent estimateReactWinRate() calls — it resolves much smaller
 * differences at the same run count. For engine-constant variants, run
 * `pnpm sim:balance` with the same seed on both versions and diff the output.
 */
export function comparePolicies(runs: number, seed = 920000, a: SimPolicy = skilledPolicy, b: SimPolicy = randomPolicy): PolicyComparison {
  const pairs = Array.from({ length: runs }, (_, index) => {
    const runSeed = seed + index * 7919;
    return { a: simulateReactRun(runSeed, 2000, a), b: simulateReactRun(runSeed, 2000, b) };
  });
  const aResults = pairs.map((pair) => pair.a);
  const bResults = pairs.map((pair) => pair.b);
  return {
    runs,
    seed,
    a: summarizeResults(aResults, runs, seed, a.name),
    b: summarizeResults(bResults, runs, seed, b.name),
    pairedWinDelta: rate(pairs.filter((pair) => pair.a.won).length - pairs.filter((pair) => pair.b.won).length, runs),
    pairedRoomsDeltaMean: pairs.reduce((sum, pair) => sum + (pair.a.roomsCleared - pair.b.roomsCleared), 0) / Math.max(1, runs),
    seedsOnlyAWon: pairs.filter((pair) => pair.a.won && !pair.b.won).length,
    seedsOnlyBWon: pairs.filter((pair) => pair.b.won && !pair.a.won).length,
  };
}
