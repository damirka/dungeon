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
  TACTICAL,
  abilityAvailable,
  advanceRoom,
  applyAction,
  beginRun,
  biomeForLevel,
  buildDungeon,
  canAffordAction,
  clamp,
  doubleStrikeChance,
  expectedIncomingDamage,
  expectedPlayerDamage,
  fmt,
  humanChance,
  humanDamage,
  humanDamageRange,
  humanGain,
  humanHp,
  humanMana,
  humanStat,
  interruptChance,
  newGame,
  pct,
  playerBaseDamage,
  playerCritChance,
  playerHitChance,
  actionManaCost,
  type Player,
} from "./index";

// A self-contained deterministic RNG so combat can be replayed exactly. The
// engine reaches for Math.random() directly (combat rolls + enemy intent), so
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

// ---------------------------------------------------------------------------
// Shared-contract constants for the canonical React engine. A failure here
// means someone changed player-facing balance numbers and should make that
// change deliberately.
// ---------------------------------------------------------------------------
describe("balance constants contract", () => {
  it("pins the core combat numbers", () => {
    expect(COMBAT.basePlayerHitChance).toBe(0.57);
    expect(COMBAT.critMultiplier).toBe(1.8);
    expect(COMBAT.maxCritChance).toBe(0.55);
    expect(COMBAT.damageVariance).toBe(0.12);
  });

  it("pins mana economy + action costs", () => {
    expect(TACTICAL.maxMana).toBe(4);
    expect(TACTICAL.startingMana).toBe(4);
    expect(TACTICAL.manaRegenPerRound).toBe(1);
    expect(actionManaCost("attack")).toBe(0);
    expect(actionManaCost("heavy")).toBe(2);
    expect(actionManaCost("quick")).toBe(1);
    expect(actionManaCost("sweep")).toBe(2);
    expect(actionManaCost("guard")).toBe(0);
    expect(actionManaCost("ability")).toBe(ABILITY.manaCost);
    expect(ABILITY.manaCost).toBe(2);
  });

  it("pins the widened action identity numbers", () => {
    expect(TACTICAL.attackDamageMultiplier).toBe(1);
    expect(TACTICAL.heavyDamageMultiplier).toBe(1.6);
    expect(TACTICAL.heavyHitModifier).toBe(-0.2);
    expect(TACTICAL.heavyEvasionHitPenaltyMax).toBe(0.08);
    expect(TACTICAL.attackGlancingDamageMultiplier).toBe(0.35);
    expect(TACTICAL.heavyGlancingDamageMultiplier).toBe(0.14);
    expect(TACTICAL.quickGlancingDamageMultiplier).toBe(0.3);
    expect(TACTICAL.quickDamageMultiplier).toBe(0.45);
    expect(TACTICAL.quickHitModifier).toBe(0.1);
    expect(TACTICAL.quickCritModifier).toBe(0.025);
    expect(TACTICAL.quickQualityBonus).toBe(0.07);
  });

  it("pins base stats, dungeon shape, and enemy curve anchors", () => {
    expect(STATS.baseHp).toBe(10);
    expect(STATS.baseStrength).toBe(5);
    expect(STATS.baseDexterity).toBe(5);
    expect(DUNGEON.levels).toBe(5);
    expect(DUNGEON.encountersPerLevel).toBe(7);
    expect(ENEMY_CURVE.baseHp).toBe(8.9);
    expect(ENEMY_CURVE.bossHpMultiplier).toBe(3.55);
    expect(LOOT.wearableSlotLimit).toBe(4);
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
    expect(fmt(Number.POSITIVE_INFINITY)).toBe("0.0");
  });

  it("pct renders whole-number percentages", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.333)).toBe("33%");
    expect(pct(1)).toBe("100%");
  });

  it("human-facing formatters hide fractional balance internals", () => {
    expect(humanHp(8.27)).toBe("8");
    expect(humanHp(0.35)).toBe("<1");
    expect(humanMana(3.6)).toBe("4");
    expect(humanStat(5.49)).toBe("5");
    expect(humanGain(0.42)).toBe("+1");
    expect(humanGain(-0.42)).toBe("-1");
    expect(humanDamage(0.42)).toBe("<1");
    expect(humanDamage(4.3)).toBe("4");
    expect(humanDamageRange(4.3)).toBe("3-5");
    expect(humanChance(0.633)).toBe("65%");
  });

  it("biomeForLevel maps and clamps to 1..5", () => {
    expect(biomeForLevel(1)).toBe("forest");
    expect(biomeForLevel(2)).toBe("sand");
    expect(biomeForLevel(3)).toBe("volcanic");
    expect(biomeForLevel(4)).toBe("castle");
    expect(biomeForLevel(5)).toBe("dungeon");
    expect(biomeForLevel(0)).toBe("forest");
    expect(biomeForLevel(99)).toBe("dungeon");
  });

  it("mana affordability + ability gating", () => {
    const p = basePlayer();
    expect(canAffordAction({ ...p, mana: 2 }, "sweep")).toBe(true);
    expect(canAffordAction({ ...p, mana: 1 }, "sweep")).toBe(false);
    expect(canAffordAction({ ...p, mana: 0 }, "attack")).toBe(true);
    expect(abilityAvailable({ ...p, mana: 2, abilityCharges: 1 })).toBe(true);
    expect(abilityAvailable({ ...p, mana: 2, abilityCharges: 0 })).toBe(false);
    expect(abilityAvailable({ ...p, mana: 1, abilityCharges: 1 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combat formulas — hand-computed expected values from the constants above, so
// these validate the math itself (not just that it is self-consistent).
// ---------------------------------------------------------------------------
describe("combat formulas (deterministic parts)", () => {
  const dungeon = buildDungeon(() => 0);
  // floor-1, first encounter is the authored single-enemy room: a baseline
  // raider with evasion 3.7 and accuracy 0.64.
  const enemy = dungeon[1].enemies[0];

  it("the reference enemy has the expected baseline stats", () => {
    expect(enemy.level).toBe(1);
    expect(enemy.evasion).toBe(3.7);
    expect(enemy.accuracy).toBe(0.64);
  });

  it("playerBaseDamage = (1 + str^1) * weaponMult", () => {
    // base str 5, iron sword mult 1 -> (1 + 5) * 1 = 6
    expect(playerBaseDamage(basePlayer())).toBeCloseTo(6, 6);
  });

  it("playerHitChance for the base swordsman vs the reference enemy", () => {
    // 0.57 + 0.062*5^0.62 - 0.038*3.7^0.55 ≈ 0.6601
    expect(playerHitChance(basePlayer(), enemy, "attack")).toBeCloseTo(0.6601, 3);
  });

  it("playerCritChance for the base swordsman vs the reference enemy", () => {
    // 0.03 + 0.024*5^0.72 - 0.006*sqrt(3.7) ≈ 0.0949
    expect(playerCritChance(basePlayer(), enemy, "attack")).toBeCloseTo(0.0949, 3);
  });

  it("doubleStrike + interrupt scale with dexterity", () => {
    // 0.01 + 5*0.004 = 0.03 ; 0.09 + 5*0.0075 = 0.1275
    expect(doubleStrikeChance(basePlayer())).toBeCloseTo(0.03, 6);
    expect(interruptChance(basePlayer())).toBeCloseTo(0.1275, 6);
  });
});

// ---------------------------------------------------------------------------
// Dungeon construction — randomized room order/pairs, strict structure, and the
// level-gating the user requires (floor 1 only features LVL 1 enemies, etc.).
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
      first
        .filter((r) => r.kind === "encounter")
        .map((r) => [r.level, r.slot, r.powerLevel, r.enemies.map((e) => e.archetype).join("+")])
    ).not.toEqual(
      different
        .filter((r) => r.kind === "encounter")
        .map((r) => [r.level, r.slot, r.powerLevel, r.enemies.map((e) => e.archetype).join("+")])
    );
  });

  it("opens every floor with an explore-only entrance", () => {
    expect(dungeon[0]).toMatchObject({ kind: "entrance", slot: 0, level: 1, enemies: [] });
  });

  for (let level = 1; level <= DUNGEON.levels; level += 1) {
    it(`floor ${level}: entrance + 7 encounters + boss, all enemies level ${level}`, () => {
      const floor = dungeon.filter((r) => r.level === level);
      expect(floor.filter((r) => r.kind === "entrance")).toHaveLength(1);
      expect(floor.filter((r) => r.kind === "encounter")).toHaveLength(DUNGEON.encountersPerLevel);
      const bosses = floor.filter((r) => r.kind === "boss");
      expect(bosses).toHaveLength(1);
      expect(bosses[0]).toMatchObject({ isBoss: true, slot: DUNGEON.encountersPerLevel + 1 });
      expect(bosses[0].enemies[0].tags).toContain("boss");

      // every enemy on this floor is scaled to this floor's level
      for (const room of floor) for (const e of room.enemies) expect(e.level).toBe(level);
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
    const mixedPairs = dungeon.filter((r) => r.kind === "encounter" && new Set(r.enemies.map((e) => e.archetype)).size > 1);
    expect(mixedPairs.length).toBeGreaterThan(0);
  });

  it("locks the per-floor boss names", () => {
    const bossNames = dungeon.filter((r) => r.isBoss).map((r) => r.enemies[0].name);
    expect(bossNames).toEqual([
      "Bramble Warden",
      "Dune Tyrant",
      "Emberforged Colossus",
      "Iron Castellan",
      "Lord of the Hollow",
    ]);
  });

  it("gates mage-support to floors >= 2 (never on floor 1)", () => {
    const archByLevel = new Map<number, Set<string>>();
    for (const room of dungeon)
      for (const e of room.enemies) {
        if (!archByLevel.has(room.level)) archByLevel.set(room.level, new Set());
        archByLevel.get(room.level)!.add(e.archetype);
      }
    expect(archByLevel.get(1)!.has("mage")).toBe(false);
    const laterFloorsHaveMage = [2, 3, 4, 5].some((l) => archByLevel.get(l)?.has("mage"));
    expect(laterFloorsHaveMage).toBe(true);
    // sanity: mage archetype is a real, tagged support profile
    expect(ARCHETYPES.mage.tags).toContain("mage-support");
  });
});

// ---------------------------------------------------------------------------
// State-machine transitions + immutability of the action API.
// ---------------------------------------------------------------------------
describe("game state machine", () => {
  it("newGame seeds a fresh title-screen state", () => {
    const s = newGame();
    expect(s.phase).toBe("title");
    expect(s.roomIndex).toBe(0);
    expect(s.dungeon).toHaveLength(45);
    expect(s.player).toMatchObject({ hp: 10, maxHp: 10, mana: 4, strength: 5, dexterity: 5 });
    expect(s.player.items).toHaveLength(0);
    expect(s.player.stash).toHaveLength(0);
  });

  it("beginRun lands on the entrance (combat phase, no foes yet)", () => {
    const s = beginRun(newGame());
    expect(s.phase).toBe("combat");
    expect(s.roomIndex).toBe(0);
    expect(s.enemies).toHaveLength(0);
  });

  it("advanceRoom steps the entrance into the first real encounter", () => {
    const s = advanceRoom(beginRun(newGame()));
    expect(s.roomIndex).toBe(1);
    expect(s.phase).toBe("combat");
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0].level).toBe(1);
  });

  it("applyAction is pure: it returns a new state and never mutates the input", () => {
    vi.spyOn(Math, "random").mockImplementation(makeRng(7));
    const before = advanceRoom(beginRun(newGame()));
    const snapshot = structuredClone(before);
    const after = applyAction(before, "attack");
    expect(after).not.toBe(before);
    // the previous state is untouched (deep-equal to its pre-call snapshot)
    expect(before).toEqual(snapshot);
    // the action actually advanced the round / dealt damage in the new state
    expect(after.enemies[0].hp).toBeLessThanOrEqual(before.enemies[0].hp);
  });
});

// ---------------------------------------------------------------------------
// Golden combat run — a fixed RNG seed makes a full encounter reproducible, so
// any unintended change to combat resolution flips this snapshot. Two runs of
// the same seed must agree, and the captured outcome is locked inline.
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
      rounds: guard,
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

  it("attacking down a level-1 foe ends in the loot phase", () => {
    const result = runEncounter(20240629);
    expect(result.phase).toBe("loot");
    expect(result.clearedRoom).toBe(1);
    expect(result.playerHp).toBeGreaterThan(0);
    expect(result.playerHp).toBeLessThanOrEqual(10);
  });

  it("locks the full outcome snapshot for seed 20240629", () => {
    expect(runEncounter(20240629)).toMatchInlineSnapshot(`
      {
        "clearedRoom": 1,
        "enemyHp": [
          0,
        ],
        "phase": "loot",
        "playerHp": 9.55,
        "rounds": 3,
      }
    `);
  });
});

describe("glancing contact", () => {
  afterEach(() => vi.restoreAllMocks());

  it("player attacks still make progress when the hit roll misses", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const before = advanceRoom(beginRun(newGame()));
    const enemyHp = before.enemies[0].hp;

    const after = applyAction(before, "attack");

    expect(after.enemies[0].hp).toBeLessThan(enemyHp);
    expect(after.stats.damageDealt).toBeGreaterThan(0);
    expect(after.log.some((entry) => entry.text.includes("grazed"))).toBe(true);
  });

  it("enemy attacks always connect", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const before = advanceRoom(beginRun(newGame()));
    const foe = { ...before.enemies[0], intent: "strike" as const, accuracy: 0.25, hp: before.enemies[0].maxHp };
    const state = { ...before, enemies: [foe], player: { ...before.player, hp: before.player.maxHp } };

    expect(expectedIncomingDamage(state, false)).toBeGreaterThan(0);
    expect(expectedPlayerDamage(state, foe, "attack")).toBeGreaterThan(0);

    const after = applyAction(state, "guard");

    expect(after.player.hp).toBeLessThan(state.player.hp);
    expect(after.log.some((entry) => entry.text.includes("dealt"))).toBe(true);
    expect(after.fx.some((event) => event.type === "strike" && event.target === "player" && event.hit)).toBe(true);
  });
});

// Regression: a Riposte counter that lands the killing blow during the enemy
// turn must still clear the room. Before the fix the encounter locked with every
// enemy dead but phase stuck on "combat" and all actions disabled.
describe("riposte kill ends the encounter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a Riposte counter killing the last enemy clears the room (no lock)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // every hit lands; the foe attacks
    let s = advanceRoom(beginRun(newGame()));
    // one near-dead foe poised to strike, so the counter lands the killing blow
    const foe = {
      ...s.enemies[0],
      hp: 0.1,
      shield: 0,
      invisible: false,
      interrupted: false,
      aimed: false,
      intent: "strike" as const,
    };
    s = { ...s, enemies: [foe], selected: 0, player: { ...s.player, hp: 50, mana: 4, abilityCharges: 1 } };

    const after = applyAction(s, "ability");

    expect(after.enemies.every((enemy) => enemy.hp <= 0)).toBe(true);
    expect(after.phase).toBe("loot");
  });
});
