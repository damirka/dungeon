/**
 * Canonical React/TypeScript tactical engine for the playable game.
 *
 * Model: "telegraphed tactics" (v2).
 * - Small-integer damage math. Attacks always land; the ONLY attack roll is
 *   the crit roll. (A dodge stat for player/enemies is a planned future hook.)
 * - Multi-action player turns under a stamina budget that refreshes each round.
 * - Enemy intents are telegraphed with exact damage numbers a turn ahead.
 * - Flat block absorbs damage (guard, gear, enemy shields). Pierce ignores it.
 * - Bash is the denial action: it forces the target to skip its telegraphed
 *   action. A denied enemy is "steadied" and cannot be denied again until it
 *   completes an action, so single targets cannot be stun-locked.
 * - Randomness lives upstream (dungeon composition, intent selection, loot),
 *   never in whether an attack connects.
 *
 * The engine is framework-agnostic: pure functions operate on a GameState
 * value. `applyAction` deep-clones, mutates a draft, and returns the new state
 * plus transient FX events for the UI. The chance-based v1 engine is archived
 * at archive/engine-chance-v1/.
 */

import { BOSS_BY_LEVEL, CREATURE_NAMES, ENEMY_POOLS, HERO_NAMES, LEVEL_ASSIGNED, LEVEL_POOL_PROFILE_KEYS } from "../../../game/spriteData";
import type { AssignedEnemy } from "../../../game/spriteData";

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------

export const COMBAT = {
  baseCritChance: 0.05,
  critChancePerDexterity: 0.02, // per point above base dexterity
  maxCritChance: 0.5,
  critMultiplier: 2,
  strengthDamageStep: 2, // +1 damage per this many STR above base
  guardBaseBlock: 4,
  guardDexterityStep: 2, // +1 guard block per this many DEX above base
  maxCombatRounds: 200,
} as const;

export const TACTICAL = {
  // player actions
  heavyDamageMultiplier: 2,
  sweepDamageMultiplier: 0.6,
  sweepDexterityStep: 3, // +1 sweep damage per this many DEX above base
  bashDamageMultiplier: 0.5,
  // enemy intents
  strikeIntentMultiplier: 1,
  heavyIntentMultiplier: 1.6,
  // enemy Heavy CRUSHES block: your block absorbs it at this efficiency
  // (every 2 block stops 1 heavy damage) — otherwise heavy is just a fat
  // strike once block gear stacks. Pierce ignores block entirely.
  heavyBlockEfficiency: 0.5,
  pierceIntentMultiplier: 0.75,
  aimedDamageMultiplier: 1.5,
  guardIntentBlockMultiplier: 1.5,
  supportHealMultiplier: 2,
  supportBlockMultiplier: 2,
  supportBlockMaxHpFraction: 0.42,
  supportHealThreshold: 0.76,
  // group composition (multiplies integer stats, then rounds with floors)
  mageSupportHpFactor: 0.46,
  mageSupportDamageFactor: 0.35,
  // stamina economy
  maxStamina: 3,
  attackStaminaCost: 1,
  heavyStaminaCost: 2,
  sweepStaminaCost: 2,
  bashStaminaCost: 2,
  guardStaminaCost: 1,
  endStaminaCost: 0,
  // Bash is charge-limited per encounter (plus denial only DELAYS the intent):
  // without a cap, bash+attack every turn is an unanswerable boss loop.
  bashChargesPerRoom: 2,
  // the Heavy combo: a landed Heavy EXPOSES the target, and every later hit
  // you land this round takes the bonus — Heavy leads, others follow
  exposedBonusDamage: 3,
} as const;

export const STATS = {
  baseHp: 30,
  baseStrength: 5.0,
  baseDexterity: 5.0,
  hpPerPower: 2.2,
  strengthPerPower: 0.5,
  dexterityPerPower: 0.5,
  blockPerPower: 0.4,
} as const;

export const LOOT = {
  baseLuckPool: 9.2,
  luckPoolGrowth: 1.5,
  normalLuckShare: 0.1,
  eliteLuckShare: 0.15,
  bossLuckShare: 0.21,
  luckVariance: 0.22,
  commonCost: 1.0,
  uncommonCost: 1.2,
  rareCost: 3.0,
  veryRareCost: 5.2,
  epicCost: 7.5,
  legendaryCost: 10.25,
  // rarity excitement: how often a draft option rolls above its floor's budget
  luckyOptionChance: 0.16,
  luckyPowerMultiplier: 1.45,
  jackpotOptionChance: 0.045,
  jackpotPowerMultiplier: 2.35,
  uniqueOptionChance: 0.007,
  uniquePowerMultiplier: 3.2,
  focusDraftChance: 0.3,
  earlyFocusDraftBonus: 0.18,
  focusedStatChoiceChance: 0.76,
  minimumUpgradeScore: 0.05,
  trainingGainMultiplier: 0.25,
  // skipping a draft is never dead: it converts into permanent training
  skipTrainingBudgetBase: 0.9,
  skipTrainingBudgetGrowth: 1.3,
  // minimum power a loot option can roll per floor (index = level): later
  // floors stop offering common junk entirely
  minOptionPowerByLevel: [0, 0, 1.2, 1.6, 3.0, 3.6],
  statItemWeight: 0.62,
  weaponItemWeight: 0.38,
  focusItemWeight: 0.14,
  consumableItemWeight: 0.1,
  wearableSlotLimit: 6, // weapon + amulet + charm + relic + shield + focus
  stashSlotLimit: 4,
} as const;

export const DUNGEON = {
  levels: 5,
  encountersPerLevel: 7,
  /** 0-based encounter slot that is ALWAYS the floor's elite fight (3 = halfway). */
  eliteEncounterSlot: 3,
  initialStatBudget: 0,
  statBudgetGainPerEncounter: 1.55,
  statBudgetGainPerLevel: 3.25,
  statBudgetGainGrowth: 1.08,
  postEncounterHealFraction: 0,
  postLevelHealFraction: 0,
  // 0 = training/gear max-HP gains do NOT heal current HP (scarce-HP design)
  currentHpFromMaxHpGainFraction: 0,
} as const;

export const ENEMY_CURVE = {
  baseHp: 16,
  hpGrowth: 1.44,
  baseDamage: 4,
  damageGrowth: 1.42,
  bossHpMultiplier: 3.0,
  bossDamageMultiplier: 1.2,
  // the guaranteed mid-floor elite: a mini-boss at ~60% boss weight
  eliteHpMultiplier: 1.8,
  eliteDamageMultiplier: 1.25,
} as const;

export type ArchetypeKey = "raider" | "brute" | "duelist" | "stalker" | "mage";

export const ARCHETYPES: Record<ArchetypeKey, { name: string; hpFactor: number; damageFactor: number; tags: string[] }> = {
  raider: { name: "Raider", hpFactor: 1.0, damageFactor: 1.0, tags: ["baseline"] },
  brute: { name: "Brute", hpFactor: 1.35, damageFactor: 1.18, tags: ["hp-check"] },
  duelist: { name: "Duelist", hpFactor: 0.86, damageFactor: 0.96, tags: ["dex-check"] },
  stalker: { name: "Stalker", hpFactor: 0.92, damageFactor: 1.28, tags: ["burst-check"] },
  mage: { name: "Mage", hpFactor: 0.82, damageFactor: 0.8, tags: ["mage-support"] },
};

export const ORDER: ArchetypeKey[] = ["raider", "brute", "duelist", "stalker"];
export const BOSS_ORDER: ArchetypeKey[] = ["raider", "duelist", "stalker", "brute", "stalker"];

interface EncounterPowerBand {
  enemyCount: number;
  leadHpFactor: number;
  leadDamageFactor: number;
  supportHpFactor: number;
  supportDamageFactor: number;
  mageChance: number;
  mixedSupportChance: number;
  leadTags: string[];
  /** Chance a 2-enemy band rolls as a squeezed 3-enemy group (3 is the cap). */
  tripleChance?: number;
}

/** Per-enemy stat squeeze applied when a pair band rolls three enemies. */
export const TRIPLE_SQUEEZE_FACTOR = 0.8;

export const POWER_BANDS: Record<number, EncounterPowerBand> = {
  1: {
    enemyCount: 1,
    leadHpFactor: 1,
    leadDamageFactor: 1,
    supportHpFactor: 0,
    supportDamageFactor: 0,
    mageChance: 0,
    mixedSupportChance: 0,
    leadTags: ["opener"],
  },
  2: {
    enemyCount: 2,
    leadHpFactor: 0.66,
    leadDamageFactor: 0.38,
    supportHpFactor: 0.46,
    supportDamageFactor: 0.27,
    mageChance: 0,
    mixedSupportChance: 0.2,
    leadTags: [],
  },
  3: {
    enemyCount: 2,
    leadHpFactor: 0.74,
    leadDamageFactor: 0.44,
    supportHpFactor: 0.52,
    supportDamageFactor: 0.31,
    mageChance: 0.16,
    mixedSupportChance: 0.34,
    leadTags: [],
    tripleChance: 0.22,
  },
  4: {
    enemyCount: 2,
    leadHpFactor: 0.76,
    leadDamageFactor: 0.44,
    supportHpFactor: 0.52,
    supportDamageFactor: 0.3,
    mageChance: 0.22,
    mixedSupportChance: 0.5,
    leadTags: [],
    tripleChance: 0.3,
  },
  5: {
    enemyCount: 3,
    leadHpFactor: 0.68,
    leadDamageFactor: 0.39,
    supportHpFactor: 0.34,
    supportDamageFactor: 0.2,
    mageChance: 0.24,
    mixedSupportChance: 0.58,
    leadTags: ["elite"],
  },
};

export type BiomeId = "forest" | "sand" | "volcanic" | "castle" | "dungeon";

export const BIOME_BY_LEVEL: Record<number, BiomeId> = {
  1: "forest",
  2: "sand",
  3: "volcanic",
  4: "castle",
  5: "dungeon",
};

export function biomeForLevel(level: number, plan?: DungeonPlan | null): BiomeId {
  const clamped = Math.max(1, Math.min(5, level));
  const override = plan?.levels?.[String(clamped)]?.biome;
  if (override && override in BIOME_FLOOR_KEYS) return override as BiomeId;
  return BIOME_BY_LEVEL[clamped];
}

const BIOME_FLOOR_KEYS: Record<BiomeId, true> = { forest: true, sand: true, volcanic: true, castle: true, dungeon: true };

// ----------------------------------------------------------------------------
// Dungeon plan (designer-authored per-floor overrides)
// ----------------------------------------------------------------------------

/**
 * A designer-authored override for one dungeon floor. Everything is optional:
 * an absent field falls back to the engine defaults derived from the creature
 * catalog (LEVEL_ASSIGNED / BOSS_BY_LEVEL). `enemies` REPLACES the floor's
 * roster, which is what lets a floor borrow enemy types normally assigned to a
 * different floor.
 */
export interface DungeonPlanLevel {
  enemies?: AssignedEnemy[];
  boss?: string;
  bossName?: string;
  biome?: string;
  notes?: string;
}

/** Per-floor overrides keyed by level ("1".."5"). Authored in the Dungeon workspace. */
export interface DungeonPlan {
  levels: Record<string, DungeonPlanLevel>;
}

/** Hero sprites must never enter enemy pools or boss slots (design rule). */
function allowedEnemyId(id: string): boolean {
  return Boolean(id) && !(id in HERO_NAMES);
}

function planLevel(plan: DungeonPlan | null | undefined, level: number): DungeonPlanLevel | null {
  return plan?.levels?.[String(level)] ?? null;
}

/** The floor's assigned roster: the plan's roster when present, else the catalog's. */
function assignedForLevel(level: number, plan?: DungeonPlan | null): AssignedEnemy[] {
  const custom = (planLevel(plan, level)?.enemies ?? []).filter((a) => allowedEnemyId(a.id));
  if (custom.length) return custom;
  return LEVEL_ASSIGNED[String(level)] || [];
}

export const ABILITY = {
  id: "riposte",
  name: "Riposte",
  charges: 1,
  staminaCost: 2,
  block: 3,
  counterMultiplier: 1,
  role: "Perfect parry: +3 block, block is fully effective even vs Heavy, and counter EVERY attacker this turn.",
} as const;

export const CHARACTER = {
  id: "balancedSwordsman",
  name: "Balanced Swordsman",
  weights: { hp: 1, strength: 1, dexterity: 1 },
  ability: ABILITY,
  role: "Even growth, Iron Sword, and a counter stance.",
} as const;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type PlayerAction = "attack" | "heavy" | "sweep" | "bash" | "guard" | "ability" | "end";
export type EnemyIntent = "strike" | "heavy" | "pierce" | "aim" | "guard" | "heal" | "shield";
export type Phase = "title" | "intro" | "combat" | "loot" | "dead" | "won";

export interface Weapon {
  name: string;
  damage: number; // base strike damage (integer)
  strikeBonus: number; // extra damage on basic attack
  heavyBonus: number; // extra damage on heavy
  sweepBonus: number; // extra damage on sweep (per target)
  bashBonus: number; // extra damage on bash
  critChance: number; // additive crit chance
  critMultiplierBonus: number; // added to COMBAT.critMultiplier
  blockBonus: number; // added to guard block
  staggerChance: number; // chance attack/heavy also denies the target
  onHitBonusDamage: number; // flat integer added to every attack
  bossBonusDamage: number; // flat integer vs bosses
  executeBonusDamage: number; // flat integer vs targets at/below the threshold
  executeHpThreshold: number;
  firstStrikeBonusDamage: number; // flat integer on the first round of a fight
}

export type ItemRarity = "common" | "uncommon" | "rare" | "very rare" | "epic" | "legendary" | "unique";
export type ItemSlot = "weapon" | "amulet" | "charm" | "relic" | "shield" | "focus" | "consumable";
export type StatKey = "hp" | "strength" | "dexterity" | "block";
export type WeaponStyle = "sword" | "axe" | "rapier";

export interface StatBonus {
  hp: number;
  strength: number;
  dexterity: number;
  block: number;
}

/**
 * Special-effect vocabulary for gear. Values are additive across equipped
 * items; every trigger is counted in `stats.effectTriggers` so the sim can
 * verify each class fires and measure its lift.
 */
export type EffectKey =
  | "thorns" // attacker takes N when its attack resolves against you
  | "battle_start_block" // +N block when combat starts
  | "battle_start_bolt" // deal N to every enemy when combat starts
  | "stamina_on_kill" // refund N stamina when you kill (up to max)
  | "heal_on_kill" // heal N when you kill
  | "heal_on_clear" // heal N when the room is cleared
  | "deny_bonus" // Bash deals +N damage
  | "counter_bonus" // Riposte counter deals +N damage
  | "guard_pierce_block" // your block also absorbs pierce (value 1 = on)
  | "guard_heavy_block" // your block is FULLY effective vs heavy (value 1 = on)
  | "max_stamina" // +N max stamina per turn
  | "potion_boost" // potions restore +N more HP
  | "crit_chance" // +N crit chance (additive, e.g. 0.08)
  | "crit_splash"; // on crit, every OTHER enemy takes N

export interface ItemEffect {
  key: EffectKey;
  value: number;
}

export const EFFECT_LABELS: Record<EffectKey, string> = {
  thorns: "Thorns",
  battle_start_block: "Block at combat start",
  battle_start_bolt: "Bolt all foes at combat start",
  stamina_on_kill: "Stamina on kill",
  heal_on_kill: "Heal on kill",
  heal_on_clear: "Heal on clear",
  deny_bonus: "Bash damage",
  counter_bonus: "Counter damage",
  guard_pierce_block: "Block stops pierce",
  guard_heavy_block: "Block fully stops heavy",
  max_stamina: "Max stamina",
  potion_boost: "Potion power",
  crit_chance: "Crit chance",
  crit_splash: "Crit splash",
};

export type PlayerEffects = Partial<Record<EffectKey, number>>;

export interface Item {
  kind: "stat" | "weapon" | "focus" | "consumable";
  slot: ItemSlot;
  name: string;
  desc: string;
  power: number;
  isUnique: boolean;
  rarity: ItemRarity;
  /** Oryx catalog sprite (assets guide item identity). */
  sprite?: { col: number; row: number };
  // stat item
  stat?: StatKey;
  value?: number;
  // weapon item
  style?: WeaponStyle;
  weapon?: Weapon;
  statBonus?: StatBonus;
  // special effects (trinkets rare+, focus items always)
  effects?: ItemEffect[];
  // consumable
  effect?: "restore_hp";
  tier?: number;
}

export interface Enemy {
  name: string;
  level: number;
  archetype: ArchetypeKey;
  spriteId: string;
  visualSeed: number;
  maxHp: number;
  hp: number;
  damage: number; // base attack damage (integer)
  block: number; // flat absorb; expires after defending one player turn
  blockTurns: number;
  tags: string[];
  intent: EnemyIntent;
  intentDamage: number; // exact telegraphed damage (0 for non-attacks)
  aimed: boolean; // next attack is boosted (set by resolving "aim")
  denied: boolean; // its telegraphed action is delayed to next round
  steadied: boolean; // cannot be denied again until it completes an action
  exposed: boolean; // hit by Heavy this round: later hits gain bonus damage
}

export interface Room {
  level: number;
  isBoss: boolean;
  kind: "entrance" | "encounter" | "boss";
  slot: number; // 0 = entrance, 1..encountersPerLevel = encounters, +1 = boss
  powerLevel?: number;
  /** The floor's guaranteed mid-floor elite fight (mini-boss, better loot). */
  elite?: boolean;
  enemies: Enemy[];
}

export interface Player {
  maxHp: number;
  hp: number;
  maxStamina: number;
  stamina: number;
  block: number; // current block; resets at the start of the player turn
  blockBonus: number; // from gear (block stat items + weapon statBonus)
  strength: number;
  dexterity: number;
  startingWeapon: Weapon;
  weapon: Weapon;
  abilityCharges: number;
  /** Bash uses left this encounter (see TACTICAL.bashChargesPerRoom). */
  bashCharges: number;
  /** Aggregated gear effects (recomputed by recalculatePlayerFromGear). */
  effects: PlayerEffects;
  items: Item[];
  stash: Item[];
  consumed: number;
}

export interface LogEntry {
  text: string;
  cls: string;
}

export type FxEvent =
  | { type: "playerAct"; action: PlayerAction }
  | { type: "strike"; from: "player" | number; target: number | "player"; hit: boolean; crit: boolean; damage: number; label: string }
  | { type: "support"; kind: "heal" | "shield"; from: number; target: number }
  | { type: "enemyDown"; index: number }
  | { type: "interrupt"; index: number }
  | { type: "roomClear" }
  | { type: "playerDown" }
  | { type: "shake"; power: number }
  | { type: "buff"; text: string }; // floating text over the hero (gear effects firing)

export interface GameState {
  phase: Phase;
  roomIndex: number;
  round: number;
  selected: number;
  player: Player;
  riposteArmed: boolean;
  trainingBudget: number;
  levelPool: { level: number; remaining: number } | null;
  enemies: Enemy[];
  draft: Item[];
  log: LogEntry[];
  /** Full run transcript (log is capped for display; this is the whole story). */
  transcript: string[];
  fx: FxEvent[];
  dungeon: Room[];
  stats: {
    actions: Record<PlayerAction, number>;
    damageDealt: number;
    damageTaken: number;
    roomsCleared: number;
    highestLevel: number;
    /** How many times each gear effect fired this run (sim verification). */
    effectTriggers: Partial<Record<EffectKey, number>>;
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

export function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

export function fmt(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.0";
}

export function pct(value: number): string {
  return `${fmt(value * 100, 0)}%`;
}

export const HUMAN = {
  chanceStep: 0.05,
} as const;

export function whole(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function humanHp(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const rounded = whole(value);
  return rounded === 0 ? "<1" : String(rounded);
}

export function humanStamina(value: number): string {
  return String(Math.max(0, whole(value)));
}

export function humanStat(value: number): string {
  return String(Math.max(0, whole(value)));
}

export function humanGain(value: number): string {
  const rounded = whole(Math.abs(value));
  const shown = value !== 0 && rounded === 0 ? 1 : rounded;
  return `${value < 0 ? "-" : "+"}${shown}`;
}

export function humanDamage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1) return "<1";
  return String(whole(value));
}

export function humanChance(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  const stepped = Math.round(clamp(value, 0, 1) / HUMAN.chanceStep) * HUMAN.chanceStep;
  return `${whole(stepped * 100)}%`;
}

const TRANSCRIPT_CAP = 8000;

function log(s: GameState, text: string, cls = ""): void {
  s.log.push({ text, cls });
  if (s.log.length > 80) s.log = s.log.slice(-80);
  // the transcript keeps everything (with room/round context) for run analysis
  const room = s.dungeon[s.roomIndex];
  const where = room ? `F${room.level}·${room.isBoss ? "boss" : room.elite ? "elite" : room.kind === "entrance" ? "entry" : `e${room.slot}`}` : "?";
  if (s.transcript.length < TRANSCRIPT_CAP) s.transcript.push(`[${where} r${s.round}] ${text}`);
}

/** Gear effect fired: log it AND float it over the hero so it is never silent. */
function announceEffect(s: GameState, text: string): void {
  log(s, text, "good");
  s.fx.push({ type: "buff", text });
}

function actionLogName(action: PlayerAction): string {
  if (action === "ability") return CHARACTER.ability.name;
  if (action === "bash") return "Bash";
  return action;
}

// ----------------------------------------------------------------------------
// Enemy + dungeon construction
// ----------------------------------------------------------------------------

// Mirrors the playtest's levelVisualPool: prefer enemies whose catalog
// `dungeon_level` matches this floor, scoped to the archetype's combat profiles.
function levelEnemyPool(level: number, key: ArchetypeKey, plan?: DungeonPlan | null): string[] {
  const assigned = assignedForLevel(level, plan);
  if (!assigned.length) return ENEMY_POOLS[key] || [];
  const regular = assigned.filter((a) => !a.boss);
  const scoped = regular.length ? regular : assigned;
  const profiles = LEVEL_POOL_PROFILE_KEYS[key] || [];
  const matched = scoped.filter((a) => profiles.includes(a.profile));
  return (matched.length ? matched : scoped).map((a) => a.id);
}

function bossPool(level: number, plan?: DungeonPlan | null): string[] {
  const planned = planLevel(plan, level)?.boss;
  if (planned && allowedEnemyId(planned)) return [planned];
  const assigned = assignedForLevel(level, plan);
  const bosses = assigned.filter((a) => a.boss).map((a) => a.id);
  if (bosses.length) return bosses;
  const legacy = BOSS_BY_LEVEL[String(level)];
  return legacy ? [legacy] : [];
}

/**
 * The exact enemy pools the dungeon builder would draw from for a floor —
 * exported so design tools show engine truth instead of re-deriving it.
 */
export function effectiveLevelPools(level: number, plan?: DungeonPlan | null): Record<ArchetypeKey, string[]> {
  return {
    raider: levelEnemyPool(level, "raider", plan),
    brute: levelEnemyPool(level, "brute", plan),
    duelist: levelEnemyPool(level, "duelist", plan),
    stalker: levelEnemyPool(level, "stalker", plan),
    mage: levelEnemyPool(level, "mage", plan),
  };
}

/** The boss candidates the builder would use for a floor (first pool hit wins). */
export function effectiveBossPool(level: number, plan?: DungeonPlan | null): string[] {
  return bossPool(level, plan);
}

function spriteForEnemy(level: number, key: ArchetypeKey, isBoss: boolean, variant: number, plan?: DungeonPlan | null): string {
  const pool = isBoss ? bossPool(level, plan) : levelEnemyPool(level, key, plan);
  if (!pool.length) return "";
  return pool[(level * 7 + variant) % pool.length];
}

function randomVisualVariant(rng: () => number, level: number, slot: number): number {
  return Math.floor(rng() * 10000) + level * 100 + slot;
}

function intHp(value: number): number {
  return Math.max(2, Math.round(value));
}

function intDamage(value: number): number {
  return Math.max(1, Math.round(value));
}

function makeEnemy(level: number, key: ArchetypeKey, isBoss: boolean, variant = 0, plan?: DungeonPlan | null): Enemy {
  const arch = ARCHETYPES[key];
  const levelIndex = level - 1;
  let maxHp = ENEMY_CURVE.baseHp * Math.pow(ENEMY_CURVE.hpGrowth, levelIndex) * arch.hpFactor;
  let damage = ENEMY_CURVE.baseDamage * Math.pow(ENEMY_CURVE.damageGrowth, levelIndex) * arch.damageFactor;
  const tags = [...arch.tags];
  const spriteId = spriteForEnemy(level, key, isBoss, variant, plan);
  const creatureName = CREATURE_NAMES[spriteId] || arch.name;
  let name = creatureName;
  if (isBoss) {
    maxHp *= ENEMY_CURVE.bossHpMultiplier;
    damage *= ENEMY_CURVE.bossDamageMultiplier;
    tags.push("boss");
    const floor = planLevel(plan, level);
    // A plan that swaps the boss also swaps the authored title unless it names one.
    name = floor?.bossName || (floor?.boss ? creatureName : BOSS_NAMES[level] ?? creatureName);
  }
  const hp = intHp(maxHp);
  return {
    name,
    level,
    archetype: key,
    spriteId,
    visualSeed: (level * 31 + variant * 7 + (isBoss ? 999 : 0)) >>> 0,
    maxHp: hp,
    hp,
    damage: intDamage(damage),
    block: 0,
    blockTurns: 0,
    tags,
    intent: "strike",
    intentDamage: 0,
    aimed: false,
    denied: false,
    steadied: false,
    exposed: false,
  };
}

export const BOSS_NAMES: Record<number, string> = {
  1: "Bramble Warden",
  2: "Dune Tyrant",
  3: "Emberforged Colossus",
  4: "Iron Castellan",
  5: "Lord of the Hollow",
};

function normalizedTags(tags: string | string[]): string[] {
  return Array.isArray(tags) ? tags : [tags];
}

function taggedEnemy(enemy: Enemy, tags: string | string[]): Enemy {
  return {
    ...enemy,
    tags: [...enemy.tags, ...normalizedTags(tags)],
  };
}

function scaleEnemy(enemy: Enemy, hpFactor: number, damageFactor: number, tags: string | string[]): Enemy {
  const hp = intHp(enemy.maxHp * hpFactor);
  return {
    ...enemy,
    maxHp: hp,
    hp,
    damage: intDamage(enemy.damage * damageFactor),
    tags: [...enemy.tags, ...normalizedTags(tags)],
    block: 0,
    blockTurns: 0,
    intentDamage: 0,
    aimed: false,
    denied: false,
    steadied: false,
    exposed: false,
  };
}

function weightedArchetypeChoice(weightsByKey: Record<ArchetypeKey, number>, rng: () => number): ArchetypeKey {
  const entries = (Object.entries(weightsByKey) as [ArchetypeKey, number][]).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1]?.[0] || ORDER[0];
}

function powerProfileWeights(powerLevel: number, level: number): Record<ArchetypeKey, number> {
  const lateBias = Math.max(0, level - 1) * 0.06;
  if (powerLevel <= 1) return { raider: 1.25, duelist: 0.85, brute: 0.12, stalker: 0.12, mage: 0 };
  if (powerLevel === 2) return { raider: 0.95, duelist: 0.95, brute: 0.72 + lateBias, stalker: 0.58 + lateBias, mage: 0 };
  if (powerLevel === 3) return { raider: 0.42, duelist: 0.95, brute: 0.95 + lateBias, stalker: 0.88 + lateBias, mage: 0 };
  if (powerLevel === 4) return { raider: 0.18, duelist: 0.85, brute: 1.12 + lateBias, stalker: 1.05 + lateBias, mage: 0 };
  return { raider: 0.08, duelist: 0.64, brute: 1.25 + lateBias, stalker: 1.2 + lateBias, mage: 0 };
}

function encounterPowerLevel(level: number, slot: number, rng: () => number): number {
  if (level === 1 && slot === 0) return 1;
  const slotCount = Math.max(1, DUNGEON.encountersPerLevel - 1);
  let power = 1 + Math.floor((slot / slotCount) * 3) + Math.floor(Math.max(0, level - 2) / 2);
  if (rng() < 0.24) power += rng() < 0.5 ? -1 : 1;
  return Math.round(clamp(power, 1, Math.min(5, level + 2)));
}

function supportArchetypeKey(leadKey: ArchetypeKey, band: EncounterPowerBand, powerLevel: number, rng: () => number): ArchetypeKey {
  if (rng() >= band.mixedSupportChance) return leadKey;
  const weights = powerProfileWeights(powerLevel, 1);
  weights[leadKey] = 0;
  return weightedArchetypeChoice(weights, rng);
}

function bossArchetypeKey(level: number): ArchetypeKey {
  return BOSS_ORDER[(level - 1) % BOSS_ORDER.length];
}

function buildPowerRoom(level: number, slot: number, rng: () => number, plan?: DungeonPlan | null): Room {
  const powerLevel = encounterPowerLevel(level, slot, rng);
  const band = POWER_BANDS[powerLevel] || POWER_BANDS[1];
  const powerTags = [`power-${powerLevel}`];
  const leadKey = weightedArchetypeChoice(powerProfileWeights(powerLevel, level), rng);
  if (band.enemyCount === 1) {
    return {
      level,
      isBoss: false,
      kind: "encounter",
      slot: slot + 1,
      powerLevel,
      enemies: [
        taggedEnemy(makeEnemy(level, leadKey, false, randomVisualVariant(rng, level, slot), plan), [...band.leadTags, ...powerTags]),
      ],
    };
  }

  // pair bands can roll a squeezed 3-enemy group (3 is the hard cap): the same
  // room budget spread across more, weaker bodies
  const triple = band.enemyCount === 2 && (band.tripleChance || 0) > 0 && rng() < (band.tripleChance || 0);
  const enemyCount = triple ? 3 : band.enemyCount;
  const squeeze = triple ? TRIPLE_SQUEEZE_FACTOR : 1;

  const lead = scaleEnemy(
    makeEnemy(level, leadKey, false, randomVisualVariant(rng, level, slot * 2), plan),
    band.leadHpFactor * squeeze,
    band.leadDamageFactor * squeeze,
    ["group-primary", ...band.leadTags, ...powerTags]
  );
  const enemies: Enemy[] = [lead];

  for (let supportIndex = 1; supportIndex < enemyCount; supportIndex += 1) {
    const supportKey = supportArchetypeKey(leadKey, band, powerLevel, rng);
    const useMage = level >= 2 && rng() < band.mageChance;
    const support = makeEnemy(level, useMage ? "mage" : supportKey, false, randomVisualVariant(rng, level, slot * 3 + supportIndex), plan);
    if (useMage) {
      enemies.push(
        scaleEnemy(support, TACTICAL.mageSupportHpFactor * squeeze, TACTICAL.mageSupportDamageFactor * squeeze, [
          "group-support",
          "mage-support",
          ...powerTags,
        ])
      );
    } else {
      const sizeFactor = supportIndex > 1 ? 0.88 : 1;
      enemies.push(
        scaleEnemy(support, band.supportHpFactor * sizeFactor * squeeze, band.supportDamageFactor * sizeFactor * squeeze, [
          "group-support",
          ...powerTags,
        ])
      );
    }
  }

  return { level, isBoss: false, kind: "encounter", slot: slot + 1, powerLevel, enemies };
}

// The guaranteed mid-floor elite: one heavyweight foe at ~2/3 boss weight,
// with a bigger loot share behind it.
function buildEliteRoom(level: number, slot: number, rng: () => number, plan?: DungeonPlan | null): Room {
  const key = weightedArchetypeChoice(powerProfileWeights(4, level), rng);
  const base = makeEnemy(level, key, false, randomVisualVariant(rng, level, slot), plan);
  const elite = scaleEnemy(base, ENEMY_CURVE.eliteHpMultiplier, ENEMY_CURVE.eliteDamageMultiplier, ["elite"]);
  elite.name = `Elite ${base.name}`;
  return { level, isBoss: false, kind: "encounter", slot: slot + 1, powerLevel: 4, elite: true, enemies: [elite] };
}

export function buildDungeon(rng: () => number = Math.random, plan?: DungeonPlan | null): Room[] {
  const rooms: Room[] = [];
  for (let level = 1; level <= DUNGEON.levels; level += 1) {
    // entrance: explore-only, no fight — the "start room" of the floor
    rooms.push({ level, isBoss: false, kind: "entrance", slot: 0, enemies: [] });
    for (let slot = 0; slot < DUNGEON.encountersPerLevel; slot += 1) {
      if (slot === DUNGEON.eliteEncounterSlot) rooms.push(buildEliteRoom(level, slot, rng, plan));
      else rooms.push(buildPowerRoom(level, slot, rng, plan));
    }
    const bossKey = bossArchetypeKey(level);
    rooms.push({ level, isBoss: true, kind: "boss", slot: DUNGEON.encountersPerLevel + 1, enemies: [makeEnemy(level, bossKey, true, level, plan)] });
  }
  return rooms;
}

// ----------------------------------------------------------------------------
// Combat math (all exact integers; crit is the only attack roll)
// ----------------------------------------------------------------------------

export function strengthDamageBonus(p: Player): number {
  return Math.floor(Math.max(0, p.strength - STATS.baseStrength) / COMBAT.strengthDamageStep);
}

export function playerCritChance(p: Player): number {
  const dexBonus = COMBAT.critChancePerDexterity * Math.max(0, p.dexterity - STATS.baseDexterity);
  return clamp(COMBAT.baseCritChance + dexBonus + p.weapon.critChance + (p.effects.crit_chance || 0), 0, COMBAT.maxCritChance);
}

/** Sum of one effect across equipped gear (0 when absent). */
export function effectValue(p: Player, key: EffectKey): number {
  return p.effects[key] || 0;
}

function fireEffect(s: GameState, key: EffectKey): void {
  s.stats.effectTriggers[key] = (s.stats.effectTriggers[key] || 0) + 1;
}

export function playerCritMultiplier(p: Player): number {
  return COMBAT.critMultiplier + (p.weapon.critMultiplierBonus || 0);
}

export function guardBlockAmount(p: Player): number {
  const dexBonus = Math.floor(Math.max(0, p.dexterity - STATS.baseDexterity) / COMBAT.guardDexterityStep);
  return COMBAT.guardBaseBlock + dexBonus + p.blockBonus + (p.weapon.blockBonus || 0);
}

function sweepDexterityBonus(p: Player): number {
  return Math.floor(Math.max(0, p.dexterity - STATS.baseDexterity) / TACTICAL.sweepDexterityStep);
}

/** Exact pre-crit damage an action deals to this enemy (before its block). */
export function actionDamage(s: GameState, enemy: Enemy, action: PlayerAction): number {
  if (!enemy || action === "guard" || action === "end") return 0;
  const p = s.player;
  const w = p.weapon;
  const base = w.damage + strengthDamageBonus(p) + (w.onHitBonusDamage || 0);
  let damage = 0;
  if (action === "attack") damage = base + (w.strikeBonus || 0);
  else if (action === "heavy") damage = base * TACTICAL.heavyDamageMultiplier + (w.heavyBonus || 0);
  else if (action === "sweep") damage = Math.floor(base * TACTICAL.sweepDamageMultiplier) + sweepDexterityBonus(p) + (w.sweepBonus || 0);
  else if (action === "bash") damage = Math.floor(base * TACTICAL.bashDamageMultiplier) + (w.bashBonus || 0) + (p.effects.deny_bonus || 0);
  else if (action === "ability") damage = Math.round(base * ABILITY.counterMultiplier) + (p.effects.counter_bonus || 0);
  if (enemy.tags.includes("boss")) damage += w.bossBonusDamage || 0;
  if (enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= (w.executeHpThreshold || 0.35)) damage += w.executeBonusDamage || 0;
  if (s.round === 1) damage += w.firstStrikeBonusDamage || 0;
  // the Heavy combo: follow-up hits on an exposed target hit harder
  if (enemy.exposed && action !== "heavy") damage += TACTICAL.exposedBonusDamage;
  return Math.max(1, Math.round(damage));
}

function actionCanCrit(action: PlayerAction): boolean {
  return action === "attack" || action === "heavy" || action === "bash" || action === "ability";
}

/** Telegraphed damage for an enemy intent (exact; includes the aim bonus). */
export function enemyIntentDamage(enemy: Enemy, intent: EnemyIntent = enemy.intent): number {
  const map: Record<EnemyIntent, number> = {
    strike: TACTICAL.strikeIntentMultiplier,
    heavy: TACTICAL.heavyIntentMultiplier,
    pierce: TACTICAL.pierceIntentMultiplier,
    guard: 0,
    aim: 0,
    heal: 0,
    shield: 0,
  };
  let damage = enemy.damage * (map[intent] || 0);
  if (damage <= 0) return 0;
  if (enemy.aimed) damage *= TACTICAL.aimedDamageMultiplier;
  return Math.max(1, Math.round(damage));
}

function setEnemyIntent(enemy: Enemy, intent: EnemyIntent): void {
  enemy.intent = intent;
  enemy.intentDamage = enemyIntentDamage(enemy, intent);
}

/**
 * Expected damage of an action against an enemy, accounting for its block and
 * crit expectation. Used by the auto policy and HUD hints; resolution itself
 * uses actionDamage + a single crit roll.
 */
export function expectedPlayerDamage(s: GameState, enemy: Enemy, action: PlayerAction): number {
  if (!enemy || enemy.hp <= 0 || action === "guard" || action === "end") return 0;
  const raw = actionDamage(s, enemy, action);
  const critFactor = actionCanCrit(action) ? 1 + playerCritChance(s.player) * (playerCritMultiplier(s.player) - 1) : 1;
  return Math.max(0, raw * critFactor - (enemy.block || 0));
}

/**
 * Exact incoming damage for the coming enemy turn, given the player's current
 * block plus `extraBlock` (e.g. one more guard). Deterministic: intents are
 * telegraphed and attacks always land. Pierce ignores block; denied enemies
 * skip.
 */
export function expectedIncomingDamage(s: GameState, extraBlock = 0): number {
  let blockPool = Math.max(0, (s.player.block || 0) + extraBlock);
  const blockStopsPierce = (s.player.effects.guard_pierce_block || 0) > 0;
  // gear OR an armed Riposte (perfect parry) makes block fully effective vs heavy
  const blockStopsHeavy = (s.player.effects.guard_heavy_block || 0) > 0 || s.riposteArmed;
  let total = 0;
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0 || enemy.denied) continue;
    const damage = enemy.intentDamage;
    if (damage <= 0) continue;
    if (enemy.intent === "pierce" && !blockStopsPierce) {
      total += damage;
      continue;
    }
    if (enemy.intent === "heavy" && !blockStopsHeavy) {
      // heavy crushes: every 2 block stops 1 damage
      const absorbed = Math.min(Math.floor(blockPool * TACTICAL.heavyBlockEfficiency), damage);
      blockPool -= absorbed * 2;
      total += damage - absorbed;
      continue;
    }
    const absorbed = Math.min(blockPool, damage);
    blockPool -= absorbed;
    total += damage - absorbed;
  }
  return total;
}

// ----------------------------------------------------------------------------
// Intent selection
// ----------------------------------------------------------------------------

function indexPriority(index: number, casterIndex: number): number {
  return index === casterIndex ? 0 : 1;
}

function supportHealTarget(enemies: Enemy[], casterIndex: number): number | null {
  const candidates = enemies
    .map((enemy, index) => ({ enemy, index }))
    .filter(({ enemy, index }) => index !== casterIndex && enemy.hp > 0 && enemy.hp < enemy.maxHp * TACTICAL.supportHealThreshold);
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => (current.enemy.maxHp - current.enemy.hp > best.enemy.maxHp - best.enemy.hp ? current : best)).index;
}

function supportShieldTarget(enemies: Enemy[], casterIndex: number): number | null {
  const candidates = enemies
    .map((enemy, index) => ({ enemy, index }))
    .filter(({ enemy }) => enemy.hp > 0 && (enemy.block || 0) < enemy.maxHp * TACTICAL.supportBlockMaxHpFraction);
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => {
    const bestScore: [number, number] = [
      indexPriority(best.index, casterIndex),
      best.enemy.maxHp * TACTICAL.supportBlockMaxHpFraction - (best.enemy.block || 0),
    ];
    const currentScore: [number, number] = [
      indexPriority(current.index, casterIndex),
      current.enemy.maxHp * TACTICAL.supportBlockMaxHpFraction - (current.enemy.block || 0),
    ];
    return currentScore[0] > bestScore[0] || (currentScore[0] === bestScore[0] && currentScore[1] > bestScore[1]) ? current : best;
  }).index;
}

function weightedIntentChoice(candidates: { intent: EnemyIntent; weight: number }[]): EnemyIntent {
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c.intent;
  }
  return candidates[candidates.length - 1]?.intent || "strike";
}

function chooseIntent(enemy: Enemy, round: number, allies: Enemy[], casterIndex: number): EnemyIntent {
  const chosen = chooseIntentRaw(enemy, round, allies, casterIndex);
  // Desperation: cornered enemies fight, they don't turtle. A low-HP enemy
  // stops guarding/aiming, and the last enemy standing also stops casting
  // support — a foe one hit from death playing defense reads as silly.
  if (enemy.tags.includes("boss")) return chosen;
  const lastAlive = !allies.some((ally, index) => index !== casterIndex && ally.hp > 0);
  const lowHp = enemy.hp <= enemy.maxHp * 0.35;
  if ((lastAlive || lowHp) && (chosen === "guard" || chosen === "aim")) return "strike";
  if (lastAlive && (chosen === "shield" || chosen === "heal")) return "strike";
  return chosen;
}

function chooseIntentRaw(enemy: Enemy, round: number, allies: Enemy[], casterIndex: number): EnemyIntent {
  const tags = new Set(enemy.tags);
  if (tags.has("boss")) {
    return (["heavy", "strike", "pierce", "aim", "heavy", "strike"] as EnemyIntent[])[(round - 1) % 6];
  }
  if (tags.has("mage-support")) {
    const candidates: { intent: EnemyIntent; weight: number }[] = [
      { intent: "shield", weight: 0.34 },
      { intent: "strike", weight: 0.28 },
      { intent: "aim", weight: 0.12 },
    ];
    if (supportHealTarget(allies, casterIndex) !== null) candidates.unshift({ intent: "heal", weight: 0.38 });
    return weightedIntentChoice(
      candidates.filter((candidate) => {
        if (candidate.intent === "shield") return supportShieldTarget(allies, casterIndex) !== null;
        return true;
      })
    );
  }
  const roll = Math.random();
  if (tags.has("hp-check")) {
    if (roll < 0.42) return "heavy";
    if (roll < 0.8) return "strike";
    return "guard";
  }
  if (tags.has("dex-check")) {
    if (roll < 0.34) return "pierce";
    if (roll < 0.68) return "strike";
    if (roll < 0.9) return "aim";
    return "guard";
  }
  if (tags.has("burst-check")) {
    if (roll < 0.38) return "strike";
    if (roll < 0.66) return "pierce";
    if (roll < 0.88) return "heavy";
    return "aim";
  }
  if (roll < 0.5) return "strike";
  if (roll < 0.72) return "heavy";
  if (roll < 0.88) return "guard";
  return "aim";
}

// ----------------------------------------------------------------------------
// Stamina / ability availability
// ----------------------------------------------------------------------------

export function actionStaminaCost(action: PlayerAction): number {
  if (action === "attack") return TACTICAL.attackStaminaCost;
  if (action === "heavy") return TACTICAL.heavyStaminaCost;
  if (action === "sweep") return TACTICAL.sweepStaminaCost;
  if (action === "bash") return TACTICAL.bashStaminaCost;
  if (action === "guard") return TACTICAL.guardStaminaCost;
  if (action === "ability") return CHARACTER.ability.staminaCost;
  return TACTICAL.endStaminaCost;
}

export function canAffordAction(p: Player, action: PlayerAction): boolean {
  return (p.stamina || 0) >= actionStaminaCost(action);
}

export function abilityAvailable(p: Player): boolean {
  return (p.abilityCharges || 0) > 0 && canAffordAction(p, "ability");
}

export function bashAvailable(p: Player): boolean {
  return (p.bashCharges || 0) > 0 && canAffordAction(p, "bash");
}

// ----------------------------------------------------------------------------
// Turn resolution
// ----------------------------------------------------------------------------

function applyDamageToEnemy(enemy: Enemy, damage: number): number {
  const blocked = Math.min(enemy.block || 0, Math.max(0, damage));
  enemy.block = Math.max(0, (enemy.block || 0) - blocked);
  enemy.hp = Math.max(0, enemy.hp - Math.max(0, damage - blocked));
  return blocked;
}

function expireEnemyBlocks(s: GameState): void {
  s.enemies.forEach((enemy) => {
    if (enemy.blockTurns > 0) {
      enemy.blockTurns -= 1;
      if (enemy.blockTurns <= 0) enemy.block = 0;
    }
  });
}

function denyEnemy(s: GameState, enemyIndex: number, source: string): boolean {
  const enemy = s.enemies[enemyIndex];
  if (!enemy || enemy.hp <= 0 || enemy.denied || enemy.steadied) return false;
  enemy.denied = true;
  enemy.steadied = true;
  log(s, `${enemy.name} is denied by ${source} — its action is delayed a turn.`, "good");
  s.fx.push({ type: "interrupt", index: enemyIndex });
  return true;
}

function resolveStrike(s: GameState, enemyIndex: number, action: PlayerAction, label: string | null = null): number {
  const p = s.player;
  const enemy = s.enemies[enemyIndex];
  let damage = actionDamage(s, enemy, action);
  const crit = actionCanCrit(action) && Math.random() < playerCritChance(p);
  if (crit) damage = Math.round(damage * playerCritMultiplier(p));
  const blocked = applyDamageToEnemy(enemy, damage);
  const actionName = label || actionLogName(action);
  const dealt = damage - blocked;
  // weapon stagger spice: attack/heavy can also deny (respects steadied)
  if ((action === "attack" || action === "heavy") && enemy.hp > 0 && (p.weapon.staggerChance || 0) > 0 && Math.random() < (p.weapon.staggerChance || 0)) {
    denyEnemy(s, enemyIndex, p.weapon.name);
  }
  // a landed Heavy exposes the target for the rest of the round
  const nowExposed = action === "heavy" && enemy.hp > 0 && !enemy.exposed;
  if (nowExposed) enemy.exposed = true;
  const blockText = blocked > 0 ? ` (${blocked} blocked)` : "";
  log(s, `${actionName} hit ${enemy.name} for ${humanDamage(dealt)}${crit ? " — crit!" : ""}${blockText}${nowExposed ? " · EXPOSED" : ""}`);
  s.fx.push({ type: "strike", from: "player", target: enemyIndex, hit: true, crit, damage: dealt, label: actionName });
  s.stats.damageDealt += dealt;
  // crit splash needs someone to splash onto — never fire/log in solo fights
  if (crit && effectValue(p, "crit_splash") > 0 && s.enemies.some((other, i) => i !== enemyIndex && other.hp > 0)) {
    const splash = Math.round(effectValue(p, "crit_splash"));
    fireEffect(s, "crit_splash");
    s.enemies.forEach((other, otherIndex) => {
      if (otherIndex === enemyIndex || other.hp <= 0) return;
      applyDamageToEnemy(other, splash);
      s.stats.damageDealt += splash;
      s.fx.push({ type: "strike", from: "player", target: otherIndex, hit: true, crit: false, damage: splash, label: "Crit splash" });
    });
    log(s, `The crit arcs to every other foe for ${splash}.`, "good");
  }
  if (enemy.hp <= 0) {
    if (effectValue(p, "stamina_on_kill") > 0 && p.stamina < p.maxStamina) {
      fireEffect(s, "stamina_on_kill");
      p.stamina = Math.min(p.maxStamina, p.stamina + Math.round(effectValue(p, "stamina_on_kill")));
      announceEffect(s, "+1 STAMINA — kill refund");
    }
    if (effectValue(p, "heal_on_kill") > 0 && p.hp > 0 && p.hp < p.maxHp) {
      fireEffect(s, "heal_on_kill");
      const healed = Math.min(p.maxHp - p.hp, Math.round(effectValue(p, "heal_on_kill")));
      p.hp += healed;
      announceEffect(s, `+${healed} HP — kill heal`);
    }
  }
  return dealt;
}

function resolveSweep(s: GameState): void {
  let total = 0;
  s.enemies.forEach((enemy, index) => {
    if (enemy.hp <= 0) return;
    total += resolveStrike(s, index, "sweep");
  });
  if (total > 0) log(s, `Sweep total: ${humanDamage(total)}.`, "good");
}

function resolveBash(s: GameState, enemyIndex: number): void {
  const enemy = s.enemies[enemyIndex];
  resolveStrike(s, enemyIndex, "bash");
  if (enemy.hp <= 0) return;
  if (enemy.steadied && !enemy.denied) {
    log(s, `${enemy.name} is steadied and holds firm.`, "warn");
    return;
  }
  denyEnemy(s, enemyIndex, "Bash");
}

function resolveEnemies(s: GameState): void {
  expireEnemyBlocks(s);
  // Riposte counters EVERY attacker this turn (it is a once-per-room premium)
  const riposteArmed = s.riposteArmed;
  s.enemies.forEach((enemy, index) => {
    if (enemy.hp <= 0) return;
    if (enemy.denied) {
      // Denial DELAYS, it does not cancel: the telegraphed intent carries over
      // and lands next round. Otherwise alternating Bash deletes half a boss's
      // script for 2 stamina — a degenerate free kill. `denied` stays set here
      // so the intent-choice phase knows to keep the intent; steadied persists
      // (the enemy has not completed an action yet).
      log(s, `${enemy.name} reels — its ${enemy.intent} is delayed.`);
      return;
    }
    if (enemy.intent === "aim") {
      enemy.aimed = true;
      enemy.steadied = false;
      log(s, `${enemy.name} takes aim.`, "warn");
      return;
    }
    if (enemy.intent === "guard") {
      enemy.block = Math.round(enemy.damage * TACTICAL.guardIntentBlockMultiplier);
      enemy.blockTurns = 1;
      enemy.steadied = false;
      log(s, `${enemy.name} guards behind ${enemy.block} block.`);
      return;
    }
    if (enemy.intent === "heal") {
      const targetIndex = supportHealTarget(s.enemies, index);
      if (targetIndex !== null) {
        const target = s.enemies[targetIndex];
        const amount = Math.round(enemy.damage * TACTICAL.supportHealMultiplier);
        const before = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + amount);
        log(s, `${enemy.name} healed ${target.name} for ${humanHp(target.hp - before)}.`, "warn");
        s.fx.push({ type: "support", kind: "heal", from: index, target: targetIndex });
      }
      enemy.steadied = false;
      return;
    }
    if (enemy.intent === "shield") {
      const targetIndex = supportShieldTarget(s.enemies, index);
      if (targetIndex !== null) {
        const target = s.enemies[targetIndex];
        const maxBlock = Math.round(target.maxHp * TACTICAL.supportBlockMaxHpFraction);
        const amount = Math.round(enemy.damage * TACTICAL.supportBlockMultiplier);
        target.block = Math.min(maxBlock, (target.block || 0) + amount);
        target.blockTurns = 1;
        log(s, `${enemy.name} shields ${target.name} for ${target.block} block.`, "warn");
        s.fx.push({ type: "support", kind: "shield", from: index, target: targetIndex });
      }
      enemy.steadied = false;
      return;
    }
    // attack intents: the telegraphed number lands, block absorbs — but pierce
    // ignores block and heavy CRUSHES it (half efficiency), unless gear says otherwise
    const damage = enemy.intentDamage;
    let taken = damage;
    const blockWorks = enemy.intent !== "pierce" || effectValue(s.player, "guard_pierce_block") > 0;
    if (blockWorks) {
      // Riposte armed = perfect parry: the stance catches even crushing blows
      const heavyCrushes = enemy.intent === "heavy" && effectValue(s.player, "guard_heavy_block") <= 0 && !s.riposteArmed;
      if (heavyCrushes) {
        const absorbed = Math.min(Math.floor(s.player.block * TACTICAL.heavyBlockEfficiency), damage);
        s.player.block = Math.max(0, s.player.block - absorbed * 2);
        taken = damage - absorbed;
      } else {
        const absorbed = Math.min(s.player.block, damage);
        s.player.block -= absorbed;
        taken = damage - absorbed;
        if (enemy.intent === "pierce" && absorbed > 0) fireEffect(s, "guard_pierce_block");
        if (enemy.intent === "heavy" && absorbed > 0 && effectValue(s.player, "guard_heavy_block") > 0) fireEffect(s, "guard_heavy_block");
      }
    }
    s.player.hp = Math.max(0, s.player.hp - taken);
    s.stats.damageTaken += taken;
    const pierceText = enemy.intent === "pierce" && !blockWorks && s.player.block > 0 ? " — pierces block" : "";
    log(s, `${enemy.name} ${enemy.intent} hits for ${humanDamage(taken)}${damage !== taken ? ` (${damage - taken} blocked)` : ""}${pierceText}.`);
    s.fx.push({ type: "strike", from: index, target: "player", hit: true, crit: false, damage: taken, label: enemy.intent });
    enemy.aimed = false;
    enemy.steadied = false;
    const thorns = Math.round(effectValue(s.player, "thorns"));
    if (thorns > 0 && s.player.hp > 0 && enemy.hp > 0) {
      fireEffect(s, "thorns");
      applyDamageToEnemy(enemy, thorns);
      s.stats.damageDealt += thorns;
      log(s, `${enemy.name} takes ${thorns} thorns.`, "good");
      s.fx.push({ type: "strike", from: "player", target: index, hit: true, crit: false, damage: thorns, label: "Thorns" });
    }
    if (riposteArmed && s.player.hp > 0 && enemy.hp > 0) {
      resolveStrike(s, index, "ability", "Riposte");
    }
  });
}

// Training growth + recalc
function baseStatsFromTraining(s: GameState): { maxHp: number; strength: number; dexterity: number } {
  const weights = CHARACTER.weights;
  const total = weights.hp + weights.strength + weights.dexterity;
  const budget = Math.max(0, s.trainingBudget || 0);
  return {
    maxHp: STATS.baseHp + budget * (weights.hp / total) * STATS.hpPerPower,
    strength: STATS.baseStrength + budget * (weights.strength / total) * STATS.strengthPerPower,
    dexterity: STATS.baseDexterity + budget * (weights.dexterity / total) * STATS.dexterityPerPower,
  };
}

export function recalculatePlayerFromGear(s: GameState, oldMaxHp = s.player.maxHp, hpGainFraction = 1): void {
  const base = baseStatsFromTraining(s);
  const p = s.player;
  p.maxHp = base.maxHp;
  p.strength = base.strength;
  p.dexterity = base.dexterity;
  p.blockBonus = 0;
  p.effects = {};
  const weaponItem = p.items.find((item) => item.kind === "weapon");
  p.weapon = weaponItem && weaponItem.weapon ? { ...weaponItem.weapon } : { ...(p.startingWeapon || BASE_WEAPON) };
  p.items.forEach((item) => {
    if (item.kind === "stat" && item.value != null) {
      if (item.stat === "hp") p.maxHp += item.value;
      if (item.stat === "strength") p.strength += item.value;
      if (item.stat === "dexterity") p.dexterity += item.value;
      if (item.stat === "block") p.blockBonus += item.value;
    }
    if (item.statBonus) {
      p.maxHp += item.statBonus.hp || 0;
      p.strength += item.statBonus.strength || 0;
      p.dexterity += item.statBonus.dexterity || 0;
      p.blockBonus += item.statBonus.block || 0;
    }
    item.effects?.forEach((entry) => {
      p.effects[entry.key] = (p.effects[entry.key] || 0) + entry.value;
    });
  });
  const maxHpGain = Math.max(0, p.maxHp - oldMaxHp);
  p.hp = Math.min(p.maxHp, p.hp + maxHpGain * hpGainFraction);
}

function trainingGainAfterRoom(room: Room): number {
  if (!room || (room.isBoss && room.level >= DUNGEON.levels)) return 0;
  const baseGain = room.isBoss ? DUNGEON.statBudgetGainPerLevel : DUNGEON.statBudgetGainPerEncounter;
  return baseGain * Math.pow(DUNGEON.statBudgetGainGrowth, room.level - 1) * LOOT.trainingGainMultiplier;
}

function applyTrainingGain(s: GameState, room: Room): void {
  const gain = trainingGainAfterRoom(room);
  if (gain <= 0) return;
  const oldMaxHp = s.player.maxHp;
  s.trainingBudget += gain;
  recalculatePlayerFromGear(s, oldMaxHp, DUNGEON.currentHpFromMaxHpGainFraction);
}

// ----------------------------------------------------------------------------
// Room lifecycle
// ----------------------------------------------------------------------------

export function startRoom(s: GameState): void {
  const room = s.dungeon[s.roomIndex];
  if (!room) {
    s.phase = "won";
    log(s, "Dungeon cleared.", "good");
    return;
  }
  if (!s.levelPool || s.levelPool.level !== room.level) {
    s.levelPool = { level: room.level, remaining: LOOT.baseLuckPool * Math.pow(LOOT.luckPoolGrowth, room.level - 1) };
  }
  s.phase = "combat";
  s.round = 1;
  s.selected = 0;
  s.player.maxStamina = TACTICAL.maxStamina;
  s.player.stamina = TACTICAL.maxStamina;
  s.player.block = 0;
  s.player.abilityCharges = CHARACTER.ability.charges;
  s.player.bashCharges = TACTICAL.bashChargesPerRoom;
  s.riposteArmed = false;
  s.enemies = room.enemies.map((enemy) => ({
    ...enemy,
    hp: enemy.maxHp,
    block: 0,
    blockTurns: 0,
    intent: "strike" as EnemyIntent,
    intentDamage: 0,
    aimed: false,
    denied: false,
    steadied: false,
    exposed: false,
  }));
  s.enemies.forEach((enemy, index) => {
    setEnemyIntent(enemy, chooseIntent(enemy, 1, s.enemies, index));
  });
  s.stats.highestLevel = Math.max(s.stats.highestLevel, room.level);
  if (s.enemies.length) {
    const roster = s.enemies.map((e) => `${e.name} (${e.maxHp}hp/${e.damage}dmg)`).join(", ");
    log(s, `— ${room.isBoss ? "BOSS" : room.elite ? "ELITE" : `Encounter ${room.slot}`}: ${roster}`);
  }

  // gear that fires when combat starts
  const p = s.player;
  p.maxStamina = TACTICAL.maxStamina + Math.round(effectValue(p, "max_stamina"));
  p.stamina = p.maxStamina;
  if (s.enemies.length && effectValue(p, "battle_start_block") > 0) {
    fireEffect(s, "battle_start_block");
    const gained = Math.round(effectValue(p, "battle_start_block"));
    p.block += gained;
    announceEffect(s, `+${gained} BLOCK — combat start`);
  }
  if (s.enemies.length && effectValue(p, "battle_start_bolt") > 0) {
    fireEffect(s, "battle_start_bolt");
    const bolt = Math.round(effectValue(p, "battle_start_bolt"));
    s.enemies.forEach((enemy, index) => {
      if (enemy.hp <= 0) return;
      applyDamageToEnemy(enemy, bolt);
      s.stats.damageDealt += bolt;
      s.fx.push({ type: "strike", from: "player", target: index, hit: true, crit: false, damage: bolt, label: "Opening bolt" });
      if (enemy.hp <= 0) s.fx.push({ type: "enemyDown", index });
    });
    announceEffect(s, `OPENING BOLT ${bolt} — hits every foe`);
    if (s.enemies.every((enemy) => enemy.hp <= 0)) clearRoom(s);
  }
}

function clearRoom(s: GameState): void {
  const room = s.dungeon[s.roomIndex];
  log(s, `Cleared encounter.`, "good");
  s.stats.roomsCleared += 1;
  s.fx.push({ type: "roomClear" });
  if (effectValue(s.player, "heal_on_clear") > 0 && s.player.hp > 0 && s.player.hp < s.player.maxHp) {
    fireEffect(s, "heal_on_clear");
    const healed = Math.min(s.player.maxHp - s.player.hp, Math.round(effectValue(s.player, "heal_on_clear")));
    s.player.hp += healed;
    announceEffect(s, `+${healed} HP — room clear heal`);
  }
  applyTrainingGain(s, room);
  if (room.isBoss && room.level >= DUNGEON.levels) {
    s.roomIndex += 1;
    s.phase = "won";
    log(s, "The Hollow is cleansed. You win.", "good");
    return;
  }
  s.phase = "loot";
  s.draft = generateLootDraft(s, room);
  if (s.draft.length) log(s, `Loot offered: ${s.draft.map((item) => `[${item.rarity}] ${item.name}`).join(" | ")}`);
}

// ----------------------------------------------------------------------------
// Public action API
// ----------------------------------------------------------------------------

function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

function markNewDeaths(prev: GameState, s: GameState): void {
  prev.enemies.forEach((before, i) => {
    if (before.hp > 0 && s.enemies[i] && s.enemies[i].hp <= 0 && !s.fx.some((event) => event.type === "enemyDown" && event.index === i)) {
      s.fx.push({ type: "enemyDown", index: i });
    }
  });
}

/** Resolve the enemy turn, then start the next player turn. */
function endPlayerTurn(s: GameState, prev: GameState): void {
  resolveEnemies(s);
  markNewDeaths(prev, s);
  if (s.player.hp <= 0) {
    s.phase = "dead";
    log(s, "You fall. The run ends here.", "bad");
    s.fx.push({ type: "playerDown" });
    return;
  }
  // A Riposte counter can kill the last enemy during the enemy turn.
  if (s.enemies.every((enemy) => enemy.hp <= 0)) {
    clearRoom(s);
    return;
  }
  s.round += 1;
  if (s.round > COMBAT.maxCombatRounds) {
    s.player.hp = 0;
    s.phase = "dead";
    log(s, "Exhaustion claims you. The run ends here.", "bad");
    s.fx.push({ type: "playerDown" });
    return;
  }
  s.player.stamina = s.player.maxStamina;
  s.player.block = 0;
  s.riposteArmed = false;
  s.enemies.forEach((enemy, index) => {
    if (enemy.hp <= 0) return;
    enemy.exposed = false; // the Heavy combo window closes with the round
    if (enemy.denied) {
      // delayed action carries over: same intent, same telegraphed number
      enemy.denied = false;
      enemy.intentDamage = enemyIntentDamage(enemy, enemy.intent);
      return;
    }
    setEnemyIntent(enemy, chooseIntent(enemy, s.round, s.enemies, index));
  });
}

/**
 * Apply one player action. The player may take several actions per round;
 * the enemy turn resolves when stamina is exhausted or the player ends the
 * turn explicitly with "end". Returns a new state.
 */
export function applyAction(prev: GameState, action: PlayerAction): GameState {
  const s = cloneState(prev);
  s.fx = [];
  if (s.phase !== "combat" || s.player.hp <= 0) return s;
  const alive = s.enemies.filter((enemy) => enemy.hp > 0);
  if (!alive.length) return s;
  if (action === "bash" && (s.player.bashCharges || 0) <= 0) {
    log(s, "No Bash charges left this fight.", "warn");
    return s;
  }
  if (action === "ability" && (s.player.abilityCharges || 0) <= 0) {
    log(s, "No class ability charges left.", "warn");
    return s;
  }
  if (action === "ability" && s.riposteArmed) {
    log(s, "Riposte is already armed.", "warn");
    return s;
  }
  if (!canAffordAction(s.player, action)) {
    log(s, `${actionLogName(action)} needs ${humanStamina(actionStaminaCost(action))} stamina.`, "warn");
    return s;
  }
  s.stats.actions[action] += 1;
  s.player.stamina = Math.max(0, s.player.stamina - actionStaminaCost(action));
  s.fx.push({ type: "playerAct", action });

  if (action === "end") {
    endPlayerTurn(s, prev);
    return s;
  }

  if (action === "sweep") {
    resolveSweep(s);
  } else if (action === "guard") {
    const gained = guardBlockAmount(s.player);
    s.player.block += gained;
    log(s, `Guard raised: +${gained} block (${s.player.block} total).`, "good");
  } else if (action === "ability") {
    s.player.abilityCharges = Math.max(0, (s.player.abilityCharges || 0) - 1);
    s.riposteArmed = true;
    s.player.block += CHARACTER.ability.block;
    log(s, `${CHARACTER.ability.name}: +${CHARACTER.ability.block} block, counter the first attacker.`, "good");
  } else {
    let targetIndex = s.selected;
    if (!s.enemies[targetIndex] || s.enemies[targetIndex].hp <= 0) {
      const nextIndex = s.enemies.findIndex((enemy) => enemy.hp > 0);
      targetIndex = Math.max(0, nextIndex);
      s.selected = targetIndex;
    }
    if (action === "bash") {
      s.player.bashCharges = Math.max(0, (s.player.bashCharges || 0) - 1);
      resolveBash(s, targetIndex);
    }
    else resolveStrike(s, targetIndex, action);
  }

  markNewDeaths(prev, s);
  if (s.enemies.every((enemy) => enemy.hp <= 0)) {
    clearRoom(s);
    return s;
  }
  if (s.player.stamina <= 0) {
    endPlayerTurn(s, prev);
  }
  return s;
}

export function selectTarget(prev: GameState, index: number): GameState {
  if (!prev.enemies[index] || prev.enemies[index].hp <= 0) return prev;
  const s = cloneState(prev);
  s.selected = index;
  return s;
}

// ----------------------------------------------------------------------------
// New game / loot wiring (loot generation lives in loot.ts)
// ----------------------------------------------------------------------------

import { generateLootDraft, slotForItem, itemStorageScore, recommendedLootIndex } from "./loot";

export const BASE_WEAPON: Weapon = {
  name: "Iron Sword",
  damage: 4,
  strikeBonus: 0,
  heavyBonus: 0,
  sweepBonus: 0,
  bashBonus: 0,
  critChance: 0,
  critMultiplierBonus: 0,
  blockBonus: 0,
  staggerChance: 0,
  onHitBonusDamage: 0,
  bossBonusDamage: 0,
  executeBonusDamage: 0,
  executeHpThreshold: 0.35,
  firstStrikeBonusDamage: 0,
};

function addToStash(s: GameState, item: Item): void {
  if (!item || item.kind === "consumable") return;
  s.player.stash.push(item);
  s.player.stash.sort((a, b) => itemStorageScore(b) - itemStorageScore(a));
  while (s.player.stash.length > LOOT.stashSlotLimit) {
    const lost = s.player.stash.pop();
    if (lost) log(s, `Lost ${lost.name}.`, "bad");
  }
}

function equipWearableItem(s: GameState, item: Item): void {
  const oldMaxHp = s.player.maxHp;
  let active = [...s.player.items];
  const removed: Item[] = [];
  const slot = slotForItem(item);
  const replaced = active.filter((a) => slotForItem(a) === slot);
  active = active.filter((a) => slotForItem(a) !== slot);
  removed.push(...replaced);
  active.push(item);
  while (active.length > LOOT.wearableSlotLimit) {
    let candidates = active.filter((a) => a !== item);
    if (item.kind !== "weapon") {
      const nonWeapon = candidates.filter((a) => a.kind !== "weapon");
      if (nonWeapon.length) candidates = nonWeapon;
    }
    if (!candidates.length) candidates = active;
    const dropped = candidates.reduce((weakest, a) => (itemStorageScore(a) < itemStorageScore(weakest) ? a : weakest));
    active = active.filter((a) => a !== dropped);
    removed.push(dropped);
  }
  s.player.items = active;
  removed.forEach((r) => addToStash(s, r));
  recalculatePlayerFromGear(s, oldMaxHp);
}

/** Training budget granted for skipping a loot draft on this floor. */
export function skipTrainingBudget(level: number): number {
  return LOOT.skipTrainingBudgetBase * Math.pow(LOOT.skipTrainingBudgetGrowth, Math.max(0, level - 1));
}

/** Equip/consume a drafted item (or skip), then advance to the next room. */
export function resolveLoot(prev: GameState, choice: number | "skip"): GameState {
  const s = cloneState(prev);
  s.fx = [];
  if (s.phase !== "loot") return s;
  if (choice !== "skip") {
    const item = s.draft[choice];
    if (!item) return s;
    if (item.kind === "consumable") {
      const before = s.player.hp;
      const boost = Math.round(effectValue(s.player, "potion_boost"));
      if (boost > 0) fireEffect(s, "potion_boost");
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + (item.value || 0) + boost);
      s.player.consumed += 1;
      log(s, `Drank ${item.name}. Restored ${humanHp(s.player.hp - before)} HP.`, "good");
    } else {
      equipWearableItem(s, item);
      log(s, `Equipped ${item.name}.`, "good");
    }
  } else {
    // skipping is never dead: the passed-up loot becomes permanent training
    const level = s.dungeon[s.roomIndex]?.level ?? 1;
    const gain = skipTrainingBudget(level);
    const oldMaxHp = s.player.maxHp;
    s.trainingBudget += gain;
    recalculatePlayerFromGear(s, oldMaxHp, DUNGEON.currentHpFromMaxHpGainFraction);
    log(s, "Kept current gear — trained instead (+HP/STR/DEX).", "good");
  }
  s.roomIndex += 1;
  s.draft = [];
  startRoom(s);
  return s;
}

export { recommendedLootIndex };

export function newGame(plan?: DungeonPlan | null): GameState {
  const dungeon = buildDungeon(Math.random, plan);
  const startingWeapon = { ...BASE_WEAPON };
  const state: GameState = {
    phase: "title",
    roomIndex: 0,
    round: 1,
    selected: 0,
    player: {
      maxHp: STATS.baseHp,
      hp: STATS.baseHp,
      maxStamina: TACTICAL.maxStamina,
      stamina: TACTICAL.maxStamina,
      block: 0,
      blockBonus: 0,
      strength: STATS.baseStrength,
      dexterity: STATS.baseDexterity,
      startingWeapon,
      weapon: { ...startingWeapon },
      abilityCharges: CHARACTER.ability.charges,
      bashCharges: TACTICAL.bashChargesPerRoom,
      effects: {},
      items: [],
      stash: [],
      consumed: 0,
    },
    riposteArmed: false,
    trainingBudget: DUNGEON.initialStatBudget,
    levelPool: null,
    enemies: [],
    draft: [],
    log: [],
    transcript: [],
    fx: [],
    dungeon,
    stats: {
      actions: { attack: 0, heavy: 0, sweep: 0, bash: 0, guard: 0, ability: 0, end: 0 },
      damageDealt: 0,
      damageTaken: 0,
      roomsCleared: 0,
      highestLevel: 1,
      effectTriggers: {},
    },
  };
  return state;
}

export function beginRun(prev: GameState): GameState {
  const s = cloneState(prev);
  s.fx = [];
  s.roomIndex = 0;
  startRoom(s);
  log(s, "You step through the gate.", "good");
  return s;
}

/** Advance past a no-combat room (the entrance) into the next room. */
export function advanceRoom(prev: GameState): GameState {
  const s = cloneState(prev);
  s.fx = [];
  s.roomIndex += 1;
  startRoom(s);
  return s;
}
