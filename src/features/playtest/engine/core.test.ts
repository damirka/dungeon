import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ABILITY,
  ARCHETYPES,
  COMBAT,
  DUNGEON,
  ENEMY_CURVE,
  LOOT,
  POWER_BANDS,
  STATS,
  STATUS,
  TACTICAL,
  abilityAvailable,
  actionDamage,
  actionStaminaCost,
  advanceRoom,
  applyAction,
  beginRun,
  biomeForLevel,
  buildDungeon,
  canAffordAction,
  clamp,
  enemyIntentDamage,
  expectedIncomingDamage,
  fmt,
  guardBlockAmount,
  humanChance,
  humanDamage,
  humanGain,
  humanHp,
  generateLootDraft,
  humanStamina,
  humanStat,
  newGame,
  pct,
  playerCritChance,
  playerDodgeChance,
  recalculatePlayerFromGear,
  riposteParryIndex,
  resolveLoot,
  skipTrainingBudget,
  strengthDamageBonus,
  type EffectKey,
  type Enemy,
  type Item,
  type Player,
} from "./index";

// A self-contained deterministic RNG so combat can be replayed exactly. The
// engine reaches for Math.random() directly (crit rolls + enemy intent), so
// stubbing Math.random with this turns a run into a pure function of the seed.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function basePlayer(): Player {
  return newGame().player;
}

// Craft a combat-ready enemy with a telegraphed intent + exact number.
function withIntent(enemy: Enemy, intent: Enemy["intent"], overrides: Partial<Enemy> = {}): Enemy {
  const next = { ...enemy, ...overrides, intent };
  next.intentDamage = enemyIntentDamage(next, intent);
  return next;
}

// ---------------------------------------------------------------------------
// Shared-contract constants for the telegraphed-tactics model. A failure here
// means someone changed player-facing balance numbers and should make that
// change deliberately (then re-lock the sim snapshot + rerun `pnpm sim:balance`).
// ---------------------------------------------------------------------------
describe("balance constants contract", () => {
  it("pins the crit model (the only attack roll)", () => {
    expect(COMBAT.baseCritChance).toBe(0.05);
    expect(COMBAT.critChancePerDexterity).toBe(0.02);
    expect(COMBAT.maxCritChance).toBe(0.5);
    expect(COMBAT.critMultiplier).toBe(2);
    expect(COMBAT.maxCombatRounds).toBe(200);
  });

  it("pins the stamina economy + action costs", () => {
    expect(TACTICAL.maxStamina).toBe(3);
    expect(actionStaminaCost("attack")).toBe(1);
    expect(actionStaminaCost("heavy")).toBe(2);
    expect(actionStaminaCost("sweep")).toBe(2);
    expect(actionStaminaCost("bash")).toBe(2);
    expect(actionStaminaCost("guard")).toBe(1);
    expect(actionStaminaCost("dodge")).toBe(1);
    expect(actionStaminaCost("end")).toBe(0);
    expect(actionStaminaCost("ability")).toBe(ABILITY.staminaCost);
    expect(ABILITY.staminaCost).toBe(2);
    expect(TACTICAL.bashChargesPerRoom).toBe(2);
    expect(TACTICAL.dodgeBaseChance).toBe(0.3);
    expect(TACTICAL.dodgeChancePerDexterity).toBe(0.03);
    expect(TACTICAL.maxDodgeChance).toBe(0.65);
    expect(TACTICAL.dodgeFailDamageTakenMultiplier).toBe(1.25);
  });

  it("pins action identities and telegraphed intent multipliers", () => {
    expect(TACTICAL.heavyDamageMultiplier).toBe(2);
    expect(TACTICAL.sweepDamageMultiplier).toBe(0.6);
    expect(TACTICAL.bashDamageMultiplier).toBe(0.5);
    expect(TACTICAL.strikeIntentMultiplier).toBe(1);
    expect(TACTICAL.heavyIntentMultiplier).toBe(1.6);
    expect(TACTICAL.pierceIntentMultiplier).toBe(0.75);
    expect(TACTICAL.aimedDamageMultiplier).toBe(1.5);
    expect(COMBAT.guardBaseBlock).toBe(4);
  });

  it("pins base stats, dungeon shape, and enemy curve anchors", () => {
    expect(STATS.baseHp).toBe(30);
    expect(STATS.baseStrength).toBe(5);
    expect(STATS.baseDexterity).toBe(5);
    expect(DUNGEON.levels).toBe(5);
    expect(DUNGEON.encountersPerLevel).toBe(7);
    expect(ENEMY_CURVE.baseHp).toBe(16);
    expect(ENEMY_CURVE.baseDamage).toBe(4);
    // growth raised to 1.52 when Riposte became a true one-attack negation and
    // Dodge landed (2026-07-04) — the new defensive toolkit had pushed the
    // skilled bot from 3.5% to 26% wins; this pulls it back to ~4%
    expect(ENEMY_CURVE.hpGrowth).toBe(1.54);
    expect(ENEMY_CURVE.damageGrowth).toBe(1.54);
    expect(ENEMY_CURVE.bossHpMultiplier).toBe(3.4);
    expect(ENEMY_CURVE.bossDamageMultiplier).toBe(1.35);
    expect(LOOT.wearableSlotLimit).toBe(6);
    expect(LOOT.stashSlotLimit).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — exact values, no RNG.
// ---------------------------------------------------------------------------
describe("pure helpers", () => {
  it("clamp bounds in both directions", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it("fmt formats and guards non-finite", () => {
    expect(fmt(3.14159, 2)).toBe("3.14");
    expect(fmt(2)).toBe("2.0");
    expect(fmt(Number.NaN)).toBe("0.0");
  });

  it("pct renders whole-number percentages", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(1)).toBe("100%");
  });

  it("human-facing formatters round to whole numbers", () => {
    expect(humanHp(8.27)).toBe("8");
    expect(humanHp(0.35)).toBe("<1");
    expect(humanStamina(3)).toBe("3");
    expect(humanStat(5.49)).toBe("5");
    expect(humanGain(2)).toBe("+2");
    expect(humanGain(-2)).toBe("-2");
    expect(humanDamage(4)).toBe("4");
    expect(humanChance(0.633)).toBe("65%");
  });

  it("biomeForLevel maps and clamps to 1..5", () => {
    expect(biomeForLevel(1)).toBe("forest");
    expect(biomeForLevel(5)).toBe("dungeon");
    expect(biomeForLevel(0)).toBe("forest");
    expect(biomeForLevel(99)).toBe("dungeon");
  });

  it("stamina affordability + ability gating", () => {
    const p = basePlayer();
    expect(canAffordAction({ ...p, stamina: 2 }, "sweep")).toBe(true);
    expect(canAffordAction({ ...p, stamina: 1 }, "sweep")).toBe(false);
    expect(canAffordAction({ ...p, stamina: 0 }, "end")).toBe(true);
    expect(abilityAvailable({ ...p, stamina: 2, abilityCharges: 1 })).toBe(true);
    expect(abilityAvailable({ ...p, stamina: 2, abilityCharges: 0 })).toBe(false);
    expect(abilityAvailable({ ...p, stamina: 1, abilityCharges: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combat formulas — hand-computed integers from the constants above, so these
// validate the math itself (not just that it is self-consistent).
// ---------------------------------------------------------------------------
describe("combat formulas (exact integers)", () => {
  const dungeon = buildDungeon(() => 0);
  // floor-1, first encounter is the authored single-enemy room: a baseline
  // raider with 16 HP and 4 damage.
  const enemy = dungeon[1].enemies[0];
  const state = () => ({ ...newGame(), round: 2, enemies: [enemy] });

  it("the reference enemy has the expected integer stats", () => {
    expect(enemy.level).toBe(1);
    expect(enemy.maxHp).toBe(16);
    expect(enemy.damage).toBe(4);
  });

  it("action damage: attack 4, heavy 8, sweep 2, bash 2 for the base swordsman", () => {
    const s = state();
    expect(actionDamage(s, enemy, "attack")).toBe(4);
    expect(actionDamage(s, enemy, "heavy")).toBe(8);
    expect(actionDamage(s, enemy, "sweep")).toBe(2);
    expect(actionDamage(s, enemy, "bash")).toBe(2);
    expect(actionDamage(s, enemy, "guard")).toBe(0);
  });

  it("strength adds flat damage in steps of 2", () => {
    const p = basePlayer();
    expect(strengthDamageBonus(p)).toBe(0);
    expect(strengthDamageBonus({ ...p, strength: 9 })).toBe(2);
    expect(strengthDamageBonus({ ...p, strength: 10.9 })).toBe(2);
  });

  it("crit chance = 5% base + 2% per DEX above 5", () => {
    const p = basePlayer();
    expect(playerCritChance(p)).toBeCloseTo(0.05, 6);
    expect(playerCritChance({ ...p, dexterity: 10 })).toBeCloseTo(0.15, 6);
  });

  it("guard block = 4 base + 1 per 2 DEX above 5 + gear", () => {
    const p = basePlayer();
    expect(guardBlockAmount(p)).toBe(4);
    expect(guardBlockAmount({ ...p, dexterity: 9 })).toBe(6);
    expect(guardBlockAmount({ ...p, blockBonus: 3 })).toBe(7);
  });

  it("telegraphed intent numbers: strike 4, heavy 6, pierce 3, aimed strike 6", () => {
    expect(enemyIntentDamage(enemy, "strike")).toBe(4);
    expect(enemyIntentDamage(enemy, "heavy")).toBe(6);
    expect(enemyIntentDamage(enemy, "pierce")).toBe(3);
    expect(enemyIntentDamage({ ...enemy, aimed: true }, "strike")).toBe(6);
    expect(enemyIntentDamage(enemy, "guard")).toBe(0);
    expect(enemyIntentDamage(enemy, "aim")).toBe(0);
  });

  it("expectedIncomingDamage is exact: block pool absorbs, pierce bypasses, denied skips", () => {
    const striker = withIntent(enemy, "strike"); // 4
    const piercer = withIntent(enemy, "pierce"); // 3, ignores block
    const denied = withIntent(enemy, "heavy", { denied: true }); // skipped
    const s = { ...newGame(), enemies: [striker, piercer, denied] };
    s.player.block = 3;
    // striker: 4 - 3 block = 1; piercer: 3 straight through; denied: 0
    expect(expectedIncomingDamage(s)).toBe(4);
    // one guard (+4 block) fully absorbs the striker, pierce still lands
    expect(expectedIncomingDamage(s, guardBlockAmount(s.player))).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Dungeon construction — randomized room order/pairs, strict structure, and
// level-gating (floor 1 only features level-1 enemies, etc.).
// ---------------------------------------------------------------------------
describe("buildDungeon structure", () => {
  const dungeon = buildDungeon(makeRng(111));

  it("produces 5 floors of entrance + 7 encounters + boss = 45 rooms", () => {
    expect(dungeon).toHaveLength(DUNGEON.levels * (DUNGEON.encountersPerLevel + 2));
    expect(dungeon).toHaveLength(45);
  });

  it("is deterministic for the same seed and varies with different seeds", () => {
    const first = buildDungeon(makeRng(111));
    const second = buildDungeon(makeRng(111));
    const different = buildDungeon(makeRng(112));
    expect(first).toEqual(second);
    expect(
      first.filter((r) => r.kind === "encounter").map((r) => [r.level, r.slot, r.powerLevel, r.enemies.map((e) => e.archetype).join("+")])
    ).not.toEqual(
      different.filter((r) => r.kind === "encounter").map((r) => [r.level, r.slot, r.powerLevel, r.enemies.map((e) => e.archetype).join("+")])
    );
  });

  it("opens every floor with an explore-only entrance", () => {
    expect(dungeon[0]).toMatchObject({ kind: "entrance", slot: 0, level: 1, enemies: [] });
  });

  for (let level = 1; level <= DUNGEON.levels; level += 1) {
    it(`floor ${level}: entrance + 7 encounters + boss, all enemies level ${level} with integer stats`, () => {
      const floor = dungeon.filter((r) => r.level === level);
      expect(floor.filter((r) => r.kind === "entrance")).toHaveLength(1);
      expect(floor.filter((r) => r.kind === "encounter")).toHaveLength(DUNGEON.encountersPerLevel);
      const bosses = floor.filter((r) => r.kind === "boss");
      expect(bosses).toHaveLength(1);
      expect(bosses[0]).toMatchObject({ isBoss: true, slot: DUNGEON.encountersPerLevel + 1 });
      expect(bosses[0].enemies[0].tags).toContain("boss");
      for (const room of floor)
        for (const e of room.enemies) {
          expect(e.level).toBe(level);
          expect(Number.isInteger(e.maxHp)).toBe(true);
          expect(Number.isInteger(e.damage)).toBe(true);
          expect(e.maxHp).toBeGreaterThanOrEqual(2);
          expect(e.damage).toBeGreaterThanOrEqual(1);
        }
    });
  }

  it("uses power bands to vary solo, pair, and group encounters", () => {
    const floor1Encounters = dungeon.filter((r) => r.level === 1 && r.kind === "encounter");
    expect(floor1Encounters[0]).toMatchObject({ powerLevel: 1 });
    expect(floor1Encounters[0].enemies).toHaveLength(POWER_BANDS[1].enemyCount);
    const enemyCounts = new Set(dungeon.filter((r) => r.kind === "encounter").map((r) => r.enemies.length));
    expect(enemyCounts.has(1)).toBe(true);
    expect(enemyCounts.has(2)).toBe(true);
    expect(enemyCounts.has(3)).toBe(true);
  });

  it("guarantees one mid-floor elite encounter per floor", () => {
    for (let level = 1; level <= DUNGEON.levels; level += 1) {
      const elites = dungeon.filter((r) => r.level === level && r.elite);
      expect(elites).toHaveLength(1);
      const room = elites[0];
      expect(room.slot).toBe(DUNGEON.eliteEncounterSlot + 1); // halfway through 7
      expect(room.enemies).toHaveLength(1);
      const foe = room.enemies[0];
      expect(foe.tags).toContain("elite");
      expect(foe.name.startsWith("Elite ")).toBe(true);
      // heavier than any regular enemy on the floor, lighter than the boss
      const boss = dungeon.find((r) => r.level === level && r.isBoss)!.enemies[0];
      const regulars = dungeon
        .filter((r) => r.level === level && r.kind === "encounter" && !r.elite)
        .flatMap((r) => r.enemies);
      expect(foe.maxHp).toBeGreaterThan(Math.max(...regulars.map((e) => e.maxHp)));
      expect(foe.maxHp).toBeLessThan(boss.maxHp);
    }
  });

  it("caps every encounter at 3 enemies and rolls squeezed triples", () => {
    const encounters = dungeon.filter((r) => r.kind === "encounter");
    for (const room of encounters) expect(room.enemies.length).toBeLessThanOrEqual(3);
    // pair bands (power 3-4) sometimes roll 3 squeezed enemies
    const midTriples = encounters.filter((r) => !r.elite && (r.powerLevel === 3 || r.powerLevel === 4) && r.enemies.length === 3);
    expect(midTriples.length).toBeGreaterThan(0);
  });

  it("locks the per-floor boss names", () => {
    const bossNames = dungeon.filter((r) => r.isBoss).map((r) => r.enemies[0].name);
    expect(bossNames).toEqual(["Bramble Warden", "Dune Tyrant", "Emberforged Colossus", "Iron Castellan", "Lord of the Hollow"]);
  });

  it("gates mage-support to floors >= 2 (never on floor 1)", () => {
    const archByLevel = new Map<number, Set<string>>();
    for (const room of dungeon)
      for (const e of room.enemies) {
        if (!archByLevel.has(room.level)) archByLevel.set(room.level, new Set());
        archByLevel.get(room.level)!.add(e.archetype);
      }
    expect(archByLevel.get(1)!.has("mage")).toBe(false);
    expect([2, 3, 4, 5].some((l) => archByLevel.get(l)?.has("mage"))).toBe(true);
    expect(ARCHETYPES.mage.tags).toContain("mage-support");
  });
});

// ---------------------------------------------------------------------------
// State-machine transitions + immutability of the action API.
// ---------------------------------------------------------------------------
describe("game state machine", () => {
  afterEach(() => vi.restoreAllMocks());

  it("newGame seeds a fresh title-screen state", () => {
    const s = newGame();
    expect(s.phase).toBe("title");
    expect(s.dungeon).toHaveLength(45);
    expect(s.player).toMatchObject({ hp: 30, maxHp: 30, stamina: 3, block: 0, strength: 5, dexterity: 5 });
    expect(s.riposteArmed).toBe(false);
  });

  it("beginRun lands on the entrance; advanceRoom enters the first encounter with telegraphs set", () => {
    const s = advanceRoom(beginRun(newGame()));
    expect(s.roomIndex).toBe(1);
    expect(s.phase).toBe("combat");
    expect(s.enemies).toHaveLength(1);
    const foe = s.enemies[0];
    expect(foe.intentDamage).toBe(enemyIntentDamage(foe, foe.intent));
  });

  it("applyAction is pure: it returns a new state and never mutates the input", () => {
    vi.spyOn(Math, "random").mockImplementation(makeRng(7));
    const before = advanceRoom(beginRun(newGame()));
    const snapshot = structuredClone(before);
    const after = applyAction(before, "attack");
    expect(after).not.toBe(before);
    expect(before).toEqual(snapshot);
    expect(after.enemies[0].hp).toBeLessThan(before.enemies[0].hp);
  });
});

// ---------------------------------------------------------------------------
// Stamina turn flow: several actions per round, enemy turn on end/exhaustion.
// ---------------------------------------------------------------------------
describe("stamina turns", () => {
  afterEach(() => vi.restoreAllMocks());

  function combatState(enemyOverrides: Partial<Enemy> = {}) {
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "strike", { hp: 50, maxHp: 50, ...enemyOverrides });
    return { ...base, enemies: [foe], selected: 0 };
  }

  it("actions spend stamina without ending the round; enemies wait", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // no crits, stable intents
    const s0 = combatState();
    const s1 = applyAction(s0, "attack");
    expect(s1.player.stamina).toBe(2);
    expect(s1.round).toBe(1);
    expect(s1.player.hp).toBe(30); // enemy has not acted
    expect(s1.enemies[0].hp).toBe(46); // exactly 4 damage
  });

  it("spending the last stamina point auto-resolves the enemy turn and refreshes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let s = combatState();
    s = applyAction(s, "attack");
    s = applyAction(s, "attack");
    s = applyAction(s, "attack"); // third point spent -> enemy turn
    expect(s.round).toBe(2);
    expect(s.player.stamina).toBe(3);
    expect(s.player.hp).toBe(26); // ate the telegraphed strike 4
    expect(s.enemies[0].hp).toBe(38); // three attacks of exactly 4
  });

  it("end turn resolves enemies immediately and telegraphs new exact intents", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let s = combatState();
    s = applyAction(s, "end");
    expect(s.round).toBe(2);
    expect(s.player.hp).toBe(26);
    const foe = s.enemies[0];
    expect(foe.intentDamage).toBe(enemyIntentDamage(foe, foe.intent));
  });

  it("guard adds exact block that absorbs the telegraphed number; pierce ignores it", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let s = combatState();
    s = applyAction(s, "guard");
    expect(s.player.block).toBe(4);
    s = applyAction(s, "end");
    expect(s.player.hp).toBe(30); // strike 4 fully blocked

    let p = combatState({ intent: "pierce" });
    p = { ...p, enemies: [withIntent(p.enemies[0], "pierce")] };
    p = applyAction(p, "guard");
    p = applyAction(p, "end");
    expect(p.player.hp).toBe(27); // pierce 3 bypasses the 4 block
  });

  it("the round cap kills a stalled fight", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let s = combatState();
    s = { ...s, round: COMBAT.maxCombatRounds, player: { ...s.player, stamina: 1 } };
    s = applyAction(s, "attack"); // exhausts stamina -> enemy turn -> over the cap
    expect(s.phase).toBe("dead");
    expect(s.log.some((entry) => entry.text.includes("Exhaustion"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Denial: Bash skips the target's telegraphed action; steadied prevents locks.
// ---------------------------------------------------------------------------
describe("bash denial", () => {
  afterEach(() => vi.restoreAllMocks());

  function duel() {
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "strike", { hp: 50, maxHp: 50 });
    return { ...base, enemies: [foe], selected: 0 };
  }

  it("bash stops the attack THIS round and the next telegraph is a fresh roll", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // baseline re-roll -> strike
    let s = duel();
    s = { ...s, enemies: [withIntent(s.enemies[0], "heavy", { hp: 50, maxHp: 50 })] }; // Heavy 6 telegraphed
    s = applyAction(s, "bash");
    expect(s.enemies[0].denied).toBe(true);
    expect(s.enemies[0].steadied).toBe(true);
    expect(s.enemies[0].hp).toBe(48); // bash deals floor(4 * 0.5) = 2
    s = applyAction(s, "end");
    expect(s.player.hp).toBe(30); // the heavy never landed
    expect(s.enemies[0].intent).toBe("strike"); // and it does NOT come back — fresh roll
    expect(s.enemies[0].intentDamage).toBe(4);
  });

  it("a denied boss advances its script — the stopped heavy never returns as-is", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const base = advanceRoom(beginRun(newGame()));
    const bossSource = newGame().dungeon.find((r) => r.isBoss)!.enemies[0];
    const boss = withIntent({ ...bossSource }, "heavy", { hp: 200, maxHp: 200 });
    let s = { ...base, enemies: [boss], selected: 0 };
    s = applyAction(s, "bash");
    expect(s.enemies[0].scriptShift).toBe(1);
    expect(s.enemies[0].denied).toBe(true);
    s = applyAction(s, "end"); // boss skips; round 2 rolls script[(2-1+1)%6]
    expect(s.player.hp).toBe(30);
    expect(s.enemies[0].intent).toBe("pierce");
  });

  it("bash is charge-limited: the third bash in one fight is refused", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let s = duel();
    s = applyAction(s, "bash"); // charge 1 (turn ends at 0 stamina? no: 3-2=1 left)
    s = applyAction(s, "end");
    s = applyAction(s, "bash"); // charge 2
    expect(s.player.bashCharges).toBe(0);
    s = applyAction(s, "end");
    const hpBefore = s.enemies[0].hp;
    const staminaBefore = s.player.stamina;
    s = applyAction(s, "bash"); // refused: no charges
    expect(s.enemies[0].hp).toBe(hpBefore);
    expect(s.player.stamina).toBe(staminaBefore);
    expect(s.log.some((entry) => entry.text.includes("No Bash charges"))).toBe(true);
  });

  it("a steadied target cannot be re-rolled: bash is damage only", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let s = duel();
    s = { ...s, enemies: [withIntent(s.enemies[0], "heavy", { hp: 50, maxHp: 50, steadied: true })] };
    s = applyAction(s, "bash");
    expect(s.enemies[0].intent).toBe("heavy"); // plan NOT re-rolled
    expect(s.log.some((entry) => entry.text.includes("holds firm"))).toBe(true);
  });

  it("steadied persists through the skipped round and clears once it acts", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let s = duel();
    s = applyAction(s, "bash"); // denied + steadied
    s = applyAction(s, "end"); // skipped round: steadied persists
    expect(s.enemies[0].steadied).toBe(true);
    s = applyAction(s, "end"); // it acts on the fresh plan
    expect(s.enemies[0].steadied).toBe(false); // deniable again (charges permitting)
  });
});

// ---------------------------------------------------------------------------
// Crits: the only attack roll. rng 0 always crits; rng ~1 never does.
// ---------------------------------------------------------------------------
describe("crits", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a crit doubles the exact damage", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // crit roll 0 < 0.05
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "strike", { hp: 50, maxHp: 50 });
    const s = applyAction({ ...base, enemies: [foe], selected: 0 }, "attack");
    expect(s.enemies[0].hp).toBe(42); // 4 * 2 = 8
    expect(s.log.some((entry) => entry.text.includes("crit"))).toBe(true);
  });
});

// Regression: a Riposte counter that lands the killing blow during the enemy
// turn must still clear the room (no lock with phase stuck on "combat").
describe("riposte", () => {
  afterEach(() => vi.restoreAllMocks());

  it("negates the attack entirely, and a counter kill clears the room", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // no crits
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "strike", { hp: 3, maxHp: 10 });
    let s = { ...base, enemies: [foe], selected: 0, player: { ...base.player, hp: 30, stamina: 3, abilityCharges: 1 } };
    s = applyAction(s, "ability");
    expect(s.riposteArmed).toBe(true);
    s = applyAction(s, "end");
    // the strike (4) is negated whole; the counter deals 4 and kills the foe
    expect(s.stats.damageTaken).toBe(0);
    expect(s.enemies[0].hp).toBe(0);
    expect(s.phase).toBe("loot");
  });

  it("the stance holds across rounds until an attack actually comes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.86); // enemies keep rolling guard
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "guard", { hp: 50, maxHp: 50 });
    let s = { ...base, enemies: [foe], selected: 0, player: { ...base.player, stamina: 3, abilityCharges: 1 } };
    s = applyAction(s, "ability");
    s = applyAction(s, "end");
    // no attack came — the armed stance survives into the next round
    expect(s.riposteArmed).toBe(true);
    expect(s.player.abilityCharges).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Golden combat run — a fixed RNG seed makes a full encounter reproducible, so
// any unintended change to combat resolution flips this snapshot.
// ---------------------------------------------------------------------------
describe("golden combat run", () => {
  afterEach(() => vi.restoreAllMocks());

  function runEncounter(seed: number) {
    vi.spyOn(Math, "random").mockImplementation(makeRng(seed));
    let s = advanceRoom(beginRun(newGame())); // floor 1, first encounter
    let guard = 0;
    while (s.phase === "combat" && guard < 60) {
      s = applyAction(s, "attack");
      guard += 1;
    }
    return {
      phase: s.phase,
      actions: guard,
      playerHp: Number(s.player.hp.toFixed(2)),
      enemyHp: s.enemies.map((e) => Number(e.hp.toFixed(2))),
      clearedRoom: s.stats.roomsCleared,
    };
  }

  it("the same seed replays identically", () => {
    const a = runEncounter(20240629);
    vi.restoreAllMocks();
    const b = runEncounter(20240629);
    expect(a).toEqual(b);
  });

  it("locks the full outcome snapshot for seed 20240629", () => {
    expect(runEncounter(20240629)).toMatchInlineSnapshot(`
      {
        "actions": 4,
        "clearedRoom": 1,
        "enemyHp": [
          0,
        ],
        "phase": "loot",
        "playerHp": 27.28,
      }
    `);
  });
});

// ---------------------------------------------------------------------------
// Item effects — one deterministic test per effect class. Each proves the
// mechanic fires (and counts in stats.effectTriggers) under a fixed RNG.
// ---------------------------------------------------------------------------
describe("item effects (every class)", () => {
  afterEach(() => vi.restoreAllMocks());

  function withGear(effects: { key: EffectKey; value: number }[], enemyOverrides: Partial<Enemy> = {}) {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // no crits, stable intents
    let base = advanceRoom(beginRun(newGame()));
    const gear: Item = {
      kind: "focus",
      slot: "focus",
      name: "Test Focus",
      desc: "",
      power: 10,
      isUnique: false,
      rarity: "legendary",
      effects,
    };
    base = { ...base, player: { ...base.player, items: [gear] } };
    recalculatePlayerFromGear(base);
    // re-enter the room so start-of-combat hooks fire with the gear equipped
    base = { ...base, roomIndex: base.roomIndex - 1 };
    let s = advanceRoom(base);
    if (Object.keys(enemyOverrides).length) {
      const foe = { ...s.enemies[0], ...enemyOverrides };
      foe.intentDamage = enemyIntentDamage(foe, foe.intent);
      s = { ...s, enemies: [foe], selected: 0 };
    }
    return s;
  }

  it("thorns damages the attacker when its attack resolves", () => {
    let s = withGear([{ key: "thorns", value: 3 }], { intent: "strike", hp: 50, maxHp: 50 });
    s = applyAction(s, "end");
    expect(s.enemies[0].hp).toBe(47);
    expect(s.stats.effectTriggers.thorns).toBe(1);
  });

  it("battle_start_block raises block as combat opens", () => {
    const s = withGear([{ key: "battle_start_block", value: 6 }]);
    expect(s.player.block).toBe(6);
    expect(s.stats.effectTriggers.battle_start_block).toBe(1);
  });

  it("battle_start_bolt hits every enemy as combat opens", () => {
    const s = withGear([{ key: "battle_start_bolt", value: 5 }]);
    for (const enemy of s.enemies) expect(enemy.hp).toBe(enemy.maxHp - 5);
    expect(s.stats.effectTriggers.battle_start_bolt).toBe(1);
  });

  it("stamina_on_kill refunds stamina when a kill lands", () => {
    let s = withGear([{ key: "stamina_on_kill", value: 1 }], { intent: "strike", hp: 1, maxHp: 50 });
    s = applyAction(s, "attack"); // kill for 1 stamina, refund brings it back
    expect(s.player.stamina).toBe(3);
    expect(s.stats.effectTriggers.stamina_on_kill).toBe(1);
  });

  it("heal_on_kill restores HP on a kill", () => {
    let s = withGear([{ key: "heal_on_kill", value: 4 }], { intent: "strike", hp: 1, maxHp: 50 });
    s = { ...s, player: { ...s.player, hp: 20 } };
    s = applyAction(s, "attack");
    // 20 + 4 effect heal, plus the sub-1 training heal from clearing the room
    expect(s.player.hp).toBeGreaterThanOrEqual(24);
    expect(s.player.hp).toBeLessThan(25);
    expect(s.stats.effectTriggers.heal_on_kill).toBe(1);
  });

  it("heal_on_clear restores HP when the room clears", () => {
    let s = withGear([{ key: "heal_on_clear", value: 4 }], { intent: "strike", hp: 1, maxHp: 50 });
    s = { ...s, player: { ...s.player, hp: 20 } };
    s = applyAction(s, "attack");
    expect(s.phase).toBe("loot");
    // 20 + 4 effect heal, plus the sub-1 training heal from clearing the room
    expect(s.player.hp).toBeGreaterThanOrEqual(24);
    expect(s.player.hp).toBeLessThan(25);
    expect(s.stats.effectTriggers.heal_on_clear).toBe(1);
  });

  it("deny_bonus adds flat damage to Bash", () => {
    const s = withGear([{ key: "deny_bonus", value: 3 }], { intent: "strike", hp: 50, maxHp: 50 });
    // bash = floor(4 * 0.5) + 3 = 5
    expect(actionDamage(s, s.enemies[0], "bash")).toBe(5);
  });

  it("counter_bonus adds flat damage to the Riposte counter", () => {
    const s = withGear([{ key: "counter_bonus", value: 4 }], { intent: "strike", hp: 50, maxHp: 50 });
    // counter = round(4 * 1) + 4 = 8
    expect(actionDamage(s, s.enemies[0], "ability")).toBe(8);
  });

  it("guard_pierce_block lets block absorb pierce", () => {
    let s = withGear([{ key: "guard_pierce_block", value: 1 }], { intent: "pierce", hp: 50, maxHp: 50 });
    s = applyAction(s, "guard"); // +4 block vs pierce 3
    s = applyAction(s, "end");
    expect(s.player.hp).toBe(30);
    expect(s.stats.effectTriggers.guard_pierce_block).toBe(1);
  });

  it("max_stamina raises the per-turn budget", () => {
    const s = withGear([{ key: "max_stamina", value: 1 }]);
    expect(s.player.maxStamina).toBe(4);
    expect(s.player.stamina).toBe(4);
  });

  it("potion_boost amplifies potion healing", () => {
    let s = withGear([{ key: "potion_boost", value: 6 }], { intent: "strike", hp: 1, maxHp: 50 });
    s = { ...s, player: { ...s.player, hp: 10 } };
    s = applyAction(s, "attack"); // clear the room -> loot phase
    expect(s.phase).toBe("loot");
    const potion: Item = {
      kind: "consumable", slot: "consumable", effect: "restore_hp", value: 5,
      name: "Crimson Vial", desc: "", power: 1, isUnique: false, rarity: "common", tier: 1,
    };
    s = { ...s, draft: [potion] };
    s = resolveLoot(s, 0);
    // 10 hp + potion 5 + boost 6 = 21
    expect(Math.round(s.player.hp)).toBe(21);
    expect(s.stats.effectTriggers.potion_boost).toBe(1);
  });

  it("crit_chance raises the crit roll ceiling", () => {
    const s = withGear([{ key: "crit_chance", value: 0.16 }]);
    expect(playerCritChance(s.player)).toBeCloseTo(0.21, 6);
  });

  it("crit_splash arcs crit damage to every other enemy", () => {
    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0); // force the crit
    let base = advanceRoom(beginRun(newGame()));
    const gear: Item = {
      kind: "focus", slot: "focus", name: "Test Focus", desc: "", power: 10,
      isUnique: false, rarity: "legendary", effects: [{ key: "crit_splash", value: 4 }],
    };
    base = { ...base, player: { ...base.player, items: [gear] } };
    recalculatePlayerFromGear(base);
    const foe = (over: Partial<Enemy>) => {
      const e = { ...base.enemies[0], ...over };
      e.intentDamage = enemyIntentDamage(e, e.intent);
      return e;
    };
    let s = { ...base, enemies: [foe({ hp: 50, maxHp: 50 }), foe({ hp: 50, maxHp: 50 })], selected: 0 };
    s = applyAction(s, "attack"); // crit for 8 on target, splash 4 on the other
    expect(s.enemies[0].hp).toBe(42);
    expect(s.enemies[1].hp).toBe(46);
    expect(s.stats.effectTriggers.crit_splash).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The Heavy combo (Exposed) and the all-attacker Riposte.
// ---------------------------------------------------------------------------
describe("heavy exposes + riposte counters all", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pins the combo constant", () => {
    expect(TACTICAL.exposedBonusDamage).toBe(3);
  });

  it("a landed Heavy exposes the target; follow-up hits gain +3 until the round ends", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // no crits, stable intents
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "strike", { hp: 50, maxHp: 50 });
    let s = { ...base, enemies: [foe], selected: 0 };
    s = applyAction(s, "heavy"); // 8 damage + exposes
    expect(s.enemies[0].exposed).toBe(true);
    expect(s.enemies[0].hp).toBe(42);
    s = applyAction(s, "attack"); // 4 + 3 exposed = 7; last stamina -> round ends
    expect(s.enemies[0].hp).toBe(35);
    expect(s.enemies[0].exposed).toBe(false); // combo window closes with the round
  });

  it("riposte negates only the BIGGEST attack and counters that one attacker", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const base = advanceRoom(beginRun(newGame()));
    const strikeFoe = withIntent(base.enemies[0], "strike", { hp: 50, maxHp: 50 }); // telegraphs 4
    const heavyFoe = withIntent(base.enemies[0], "heavy", { hp: 50, maxHp: 50 }); // telegraphs 6 — the big one
    let s = { ...base, enemies: [strikeFoe, heavyFoe], selected: 0 };
    s = applyAction(s, "ability"); // armed, no block granted
    s = applyAction(s, "end");
    // the heavy (6) is negated whole and its owner countered for 4;
    // the plain strike (4) still lands in full
    expect(s.stats.damageTaken).toBe(4);
    expect(s.enemies[0].hp).toBe(50);
    expect(s.enemies[1].hp).toBe(46);
    expect(s.riposteArmed).toBe(false); // fired — once per encounter
  });
});

// ---------------------------------------------------------------------------
// Heavy crushes block (and the shield gear that restores full block vs heavy).
// ---------------------------------------------------------------------------
describe("heavy crushes block", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pins the crush constant", () => {
    expect(TACTICAL.heavyBlockEfficiency).toBe(0.5);
  });

  it("expected incoming is exact: every 2 block stops 1 heavy damage", () => {
    const dungeon = buildDungeon(() => 0);
    const heavyFoe = withIntent(dungeon[1].enemies[0], "heavy"); // telegraphs 6
    const s = { ...newGame(), enemies: [heavyFoe] };
    s.player.block = 6;
    expect(expectedIncomingDamage(s)).toBe(3); // floor(6 * 0.5) = 3 absorbed
  });

  it("resolution matches: a guarded heavy still bites", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "heavy", { hp: 50, maxHp: 50 }); // 6
    let s = { ...base, enemies: [foe], selected: 0 };
    s = applyAction(s, "guard"); // +4 block
    s = applyAction(s, "end");
    // heavy 6 vs 4 block at half efficiency: absorbs floor(4*0.5)=2 -> take 4
    expect(s.player.hp).toBe(26);
  });

  it("guard_heavy_block gear makes block fully effective against heavy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let base = advanceRoom(beginRun(newGame()));
    const gear: Item = {
      kind: "focus", slot: "focus", name: "Test Bulwark", desc: "", power: 10,
      isUnique: false, rarity: "legendary", effects: [{ key: "guard_heavy_block", value: 1 }],
    };
    base = { ...base, player: { ...base.player, items: [gear] } };
    recalculatePlayerFromGear(base);
    const foe = withIntent(base.enemies[0], "heavy", { hp: 50, maxHp: 50 }); // 6
    let s = { ...base, enemies: [foe], selected: 0 };
    s = applyAction(s, "guard"); // +4 block, fully effective
    s = applyAction(s, "end");
    expect(s.player.hp).toBe(28); // 6 - 4 = 2
    expect(s.stats.effectTriggers.guard_heavy_block).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Loot QoL: skip-to-train and per-floor rarity floors.
// ---------------------------------------------------------------------------
describe("loot QoL", () => {
  afterEach(() => vi.restoreAllMocks());

  it("skipping a draft converts into permanent training", () => {
    vi.spyOn(Math, "random").mockImplementation(makeRng(9));
    let s = advanceRoom(beginRun(newGame()));
    s = { ...s, enemies: [withIntent(s.enemies[0], "strike", { hp: 1, maxHp: 16 })], selected: 0 };
    s = applyAction(s, "attack"); // kill -> loot phase
    expect(s.phase).toBe("loot");
    const budgetBefore = s.trainingBudget;
    const strengthBefore = s.player.strength;
    const after = resolveLoot(s, "skip");
    expect(after.trainingBudget).toBeCloseTo(budgetBefore + skipTrainingBudget(1), 6);
    expect(after.player.strength).toBeGreaterThan(strengthBefore);
  });

  it("floor 4+ drafts never roll common junk (rarity floor)", () => {
    vi.spyOn(Math, "random").mockImplementation(makeRng(5));
    const s = newGame();
    const room = s.dungeon.find((r) => r.level === 4 && r.kind === "encounter" && !r.elite)!;
    for (let i = 0; i < 30; i += 1) {
      s.levelPool = { level: 4, remaining: 999 };
      for (const item of generateLootDraft(s, room)) {
        expect(item.power).toBeGreaterThanOrEqual(LOOT.minOptionPowerByLevel[4]);
        expect(item.rarity).not.toBe("common");
        expect(item.rarity).not.toBe("uncommon");
        // every non-consumable carries its catalog sprite (weapons included)
        if (item.kind !== "consumable") expect(item.sprite).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Riposte the ultimate block: it eats even a crushing Heavy whole, ignoring
// block math entirely, and the HUD's expected-incoming agrees.
// ---------------------------------------------------------------------------
describe("riposte vs heavy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("an armed riposte negates a heavy entirely — no crush math applies", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // no crits
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "heavy", { hp: 50, maxHp: 50 }); // telegraphs 6
    let s = { ...base, enemies: [foe], selected: 0 };
    s = applyAction(s, "ability"); // parry armed
    s = applyAction(s, "guard"); // stamina 0 -> enemy turn
    expect(s.player.hp).toBe(30);
    expect(s.stats.damageTaken).toBe(0); // negated whole — no crush math ran
    expect(s.enemies[0].hp).toBe(46); // 50 - 4 counter
  });

  it("expected incoming excludes the parried (biggest) attack while armed", () => {
    const dungeon = buildDungeon(() => 0);
    const heavyFoe = withIntent(dungeon[1].enemies[0], "heavy"); // 6 — parried
    const strikeFoe = withIntent(dungeon[1].enemies[0], "strike"); // 4 — still lands
    const s = { ...newGame(), enemies: [heavyFoe, strikeFoe], riposteArmed: true };
    s.player.block = 0;
    expect(riposteParryIndex(s)).toBe(0);
    expect(expectedIncomingDamage(s)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Dodge: the DEX gamble — one roll, all or nothing.
// ---------------------------------------------------------------------------
describe("dodge", () => {
  afterEach(() => vi.restoreAllMocks());

  it("scales with DEX and is hard-capped", () => {
    const p = newGame().player;
    expect(playerDodgeChance(p)).toBeCloseTo(0.3); // base DEX
    expect(playerDodgeChance({ ...p, dexterity: p.dexterity + 5 })).toBeCloseTo(0.45);
    expect(playerDodgeChance({ ...p, dexterity: p.dexterity + 50 })).toBe(TACTICAL.maxDodgeChance);
  });

  it("a successful dodge slips EVERY attack that round", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.2); // 0.2 < 0.3 -> dodge succeeds
    const base = advanceRoom(beginRun(newGame()));
    const foe = (intent: "strike" | "heavy") => withIntent(base.enemies[0], intent, { hp: 50, maxHp: 50 });
    let s = { ...base, enemies: [foe("strike"), foe("heavy")], selected: 0 };
    s = applyAction(s, "dodge"); // 1 STA
    expect(s.player.stamina).toBe(2);
    expect(s.player.dodging).toBe(true);
    s = applyAction(s, "end");
    expect(s.stats.damageTaken).toBe(0);
    expect(s.player.dodging).toBe(false); // the gamble covers exactly one enemy turn
  });

  it("a failed dodge means getting caught mid-step: every hit lands amplified", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // 0.4 > 0.3 -> dodge fails
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "strike", { hp: 50, maxHp: 50 }); // telegraphs 4
    let s = { ...base, enemies: [foe], selected: 0 };
    s = applyAction(s, "dodge");
    s = applyAction(s, "end");
    expect(s.stats.damageTaken).toBe(5); // round(4 * 1.25) — the gamble's downside
    expect(s.player.dodging).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Guard fatigue: consecutive guarding rounds decay the block gained.
// ---------------------------------------------------------------------------
describe("guard fatigue", () => {
  afterEach(() => vi.restoreAllMocks());

  it("pins the fatigue constants", () => {
    expect(COMBAT.guardFatigueDecay).toBe(3);
    expect(COMBAT.guardFatigueFloor).toBe(2);
  });

  it("guarding every round decays the block; a round off resets it", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "guard", { hp: 90, maxHp: 90 }); // passive foe
    let s = { ...base, enemies: [foe], selected: 0 };

    s = applyAction(s, "guard");
    expect(s.player.block).toBe(4); // round 1: full guard
    s = applyAction(s, "end");

    s = applyAction(s, "guard");
    expect(s.player.block).toBe(2); // round 2: 4 - 3 decayed, floored at 2
    s = applyAction(s, "end");

    s = applyAction(s, "attack"); // round 3: no guard — arm recovers
    s = applyAction(s, "end");

    s = applyAction(s, "guard");
    expect(s.player.block).toBe(4); // full strength again
  });

  it("burst guarding within ONE round is not penalized", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const base = advanceRoom(beginRun(newGame()));
    const foe = withIntent(base.enemies[0], "guard", { hp: 90, maxHp: 90 });
    let s = { ...base, enemies: [foe], selected: 0 };
    s = applyAction(s, "guard");
    s = applyAction(s, "guard");
    expect(s.player.block).toBe(8); // 2 x 4, same-round stacking at full value
  });
});

// ---------------------------------------------------------------------------
// Opening bolt softens but never kills.
// ---------------------------------------------------------------------------
describe("opening bolt no-kill floor", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a bolt bigger than an enemy's HP leaves it alive at 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    let base = beginRun(newGame());
    const gear: Item = {
      kind: "focus", slot: "focus", name: "Test Orb", desc: "", power: 10,
      isUnique: false, rarity: "legendary", effects: [{ key: "battle_start_bolt", value: 5 }],
    };
    base = { ...base, player: { ...base.player, items: [gear] } };
    recalculatePlayerFromGear(base);
    // shrink the first encounter's enemy below the bolt value
    base.dungeon[1] = {
      ...base.dungeon[1],
      enemies: [{ ...base.dungeon[1].enemies[0], maxHp: 3, hp: 3 }],
    };
    const s = advanceRoom(base);
    expect(s.phase).toBe("combat"); // the room was NOT pre-cleared
    expect(s.enemies[0].hp).toBe(1); // softened to the floor, not killed
  });
});

// ---------------------------------------------------------------------------
// Afflictions: poison / bleed / sunder — applied through block on every hit,
// ticking outside the block system, cleansed by enemy heals.
// ---------------------------------------------------------------------------
describe("afflictions", () => {
  afterEach(() => vi.restoreAllMocks());

  function afflictedRoom(effects: { key: EffectKey; value: number }[], foes: Partial<Enemy>[]) {
    vi.spyOn(Math, "random").mockReturnValue(0.4); // no crits, stable intents
    const base = advanceRoom(beginRun(newGame()));
    const gear: Item = {
      kind: "focus", slot: "focus", name: "Test Focus", desc: "", power: 10,
      isUnique: false, rarity: "legendary", effects,
    };
    let s = { ...base, player: { ...base.player, items: [gear] } };
    recalculatePlayerFromGear(s);
    const enemies = foes.map((over) => {
      const foe = { ...base.enemies[0], ...over };
      foe.intentDamage = enemyIntentDamage(foe, foe.intent);
      return foe;
    });
    return { ...s, enemies, selected: 0 };
  }

  it("pins the status constants", () => {
    expect(STATUS.maxStacks).toBe(9);
    expect(STATUS.poisonDecayPerTick).toBe(1);
    expect(STATUS.bleedDecayPerTick).toBe(1);
    expect(STATUS.sunderDecayPerRound).toBe(1);
  });

  it("poison stacks per hit, ticks at YOUR turn start past block, then fades by 1", () => {
    let s = afflictedRoom([{ key: "poison_on_hit", value: 2 }], [{ intent: "strike", hp: 50, maxHp: 50 }]);
    s = applyAction(s, "attack"); // 4 dmg, poison 2
    expect(s.enemies[0].poison).toBe(2);
    s = applyAction(s, "attack"); // poison 4
    s = applyAction(s, "attack"); // poison 6, stamina 0 -> round resolves
    // 50 - 12 direct - 6 poison tick = 32; stacks fade to 5
    expect(s.enemies[0].hp).toBe(32);
    expect(s.enemies[0].poison).toBe(5);
    expect(s.stats.effectTriggers.poison_on_hit).toBe(3);
  });

  it("bleed ticks BEFORE the enemy acts — a bleeding foe can die without swinging", () => {
    let s = afflictedRoom([{ key: "bleed_on_hit", value: 3 }], [{ intent: "strike", hp: 6, maxHp: 50 }]);
    s = applyAction(s, "attack"); // 4 dmg -> 2 hp, bleed 3
    expect(s.enemies[0].bleed).toBe(3);
    s = applyAction(s, "end");
    // bleed 3 kills it before its strike lands
    expect(s.stats.damageTaken).toBe(0);
    expect(s.enemies[0].hp).toBe(0);
    expect(s.phase).toBe("loot");
  });

  it("sunder saps the live telegraph immediately and fades each round", () => {
    let s = afflictedRoom([{ key: "sunder_on_hit", value: 2 }], [{ intent: "strike", hp: 60, maxHp: 60 }]);
    expect(s.enemies[0].intentDamage).toBe(4);
    s = applyAction(s, "attack"); // sunder 2 -> telegraph drops NOW
    expect(s.enemies[0].sunder).toBe(2);
    expect(s.enemies[0].intentDamage).toBe(2);
    s = applyAction(s, "end");
    s = applyAction(s, "end");
    // it hit for the sapped 2, then sunder faded 2 -> 1 -> 0 across round ends
    expect(s.stats.damageTaken).toBeGreaterThan(0);
    expect(s.enemies[0].sunder).toBeLessThan(2);
  });

  it("an enemy heal CLEANSES every affliction from its target", () => {
    let s = afflictedRoom([], [
      { intent: "guard", hp: 50, maxHp: 50 },
      { intent: "heal", hp: 40, maxHp: 40, archetype: "mage", tags: ["mage-support"] },
    ]);
    s.enemies[0].poison = 4;
    s.enemies[0].bleed = 2;
    s.enemies[0].sunder = 1;
    s = applyAction(s, "end");
    expect(s.enemies[0].poison).toBe(0);
    expect(s.enemies[0].sunder).toBe(0);
    // bleed ticked once before the heal acted, then the cleanse wiped the rest
    expect(s.enemies[0].bleed).toBe(0);
  });

  it("sweep applies afflictions to EVERY enemy it touches", () => {
    let s = afflictedRoom([{ key: "poison_on_hit", value: 2 }], [
      { intent: "guard", hp: 50, maxHp: 50 },
      { intent: "guard", hp: 50, maxHp: 50 },
      { intent: "guard", hp: 50, maxHp: 50 },
    ]);
    s = applyAction(s, "sweep");
    expect(s.enemies.map((e) => e.poison)).toEqual([2, 2, 2]);
  });

  it("stacks cap at STATUS.maxStacks", () => {
    let s = afflictedRoom([{ key: "poison_on_hit", value: 4 }], [{ intent: "guard", hp: 200, maxHp: 200 }]);
    s = applyAction(s, "attack");
    s = applyAction(s, "attack");
    s = applyAction(s, "attack"); // 12 would exceed the cap
    expect(s.enemies[0].poison).toBeLessThanOrEqual(STATUS.maxStacks);
  });
});
