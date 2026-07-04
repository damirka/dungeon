/**
 * Canonical React/TypeScript tactical engine for the playable game.
 * Python and legacy HTML are historical references now; tune the game here
 * first, then realign support tooling as needed.
 *
 * The engine is intentionally framework-agnostic: pure functions operate on a
 * GameState value. `applyAction` deep-clones, mutates a draft (matching the
 * original's mutation style + Math.random ordering), then returns the new state
 * plus a list of transient FX events the UI uses to drive animations.
 */

import { BOSS_BY_LEVEL, CREATURE_NAMES, ENEMY_POOLS, LEVEL_ASSIGNED, LEVEL_POOL_PROFILE_KEYS } from "../../../game/spriteData";

// ----------------------------------------------------------------------------
// Tunables (verbatim from the playtest)
// ----------------------------------------------------------------------------

export const COMBAT = {
  minPlayerHitChance: 0.32,
  maxPlayerHitChance: 0.95,
  basePlayerHitChance: 0.57,
  dexterityHitScale: 0.062,
  dexterityHitExponent: 0.62,
  enemyEvasionHitScale: 0.038,
  enemyEvasionExponent: 0.55,
  baseCritChance: 0.03,
  dexterityCritScale: 0.024,
  dexterityCritExponent: 0.72,
  enemyEvasionCritScale: 0.006,
  maxCritChance: 0.55,
  critMultiplier: 1.8,
  dexterityDamageQualityScale: 0.03,
  dexterityDamageQualityExponent: 0.62,
  enemyEvasionDamageQualityScale: 0.016,
  enemyEvasionDamageQualityExponent: 0.55,
  maxDamageQuality: 0.3,
  basePlayerDamage: 1.0,
  strengthDamageScale: 1.0,
  strengthDamageExponent: 1.0,
  damageVariance: 0.12,
  maxCombatRounds: 200,
} as const;

export const TACTICAL = {
  attackDamageMultiplier: 1.0,
  heavyDamageMultiplier: 1.6,
  heavyHitModifier: -0.2,
  heavyEvasionHitPenaltyScale: 0.004,
  heavyEvasionHitPenaltyFloor: 3.5,
  heavyEvasionHitPenaltyMax: 0.08,
  heavyGuardIgnore: 0.45,
  attackGlancingDamageMultiplier: 0.35,
  heavyGlancingDamageMultiplier: 0.14,
  quickGlancingDamageMultiplier: 0.3,
  sunderDamageBonusPerStack: 0.075,
  sunderQuickEffectiveness: 0.35,
  sunderHeavyEffectiveness: 1.08,
  sunderMaxStacks: 3,
  quickDamageMultiplier: 0.45,
  quickHitModifier: 0.1,
  quickCritModifier: 0.025,
  quickQualityBonus: 0.07,
  sweepDamageMultiplier: 0.42,
  sweepHitModifier: -0.04,
  sweepQualityBonus: 0.05,
  sweepDexterityDamagePerPoint: 0.014,
  sweepMaxDexterityDamageBonus: 0.18,
  sweepGlancingDamageMultiplier: 0.12,
  sweepAutoDamageRatio: 0.82,
  doubleStrikeBaseChance: 0.01,
  doubleStrikePerDexterity: 0.004,
  maxDoubleStrikeChance: 0.16,
  doubleStrikeDamageMultiplier: 0.45,
  quickInterruptBaseChance: 0.09,
  quickInterruptPerDexterity: 0.0075,
  maxInterruptChance: 0.32,
  playerGuardReduction: 0.52,
  pierceGuardReduction: 0.26,
  enemyGuardReduction: 0.45,
  strikeDamageMultiplier: 1.04,
  heavyIntentDamageMultiplier: 1.72,
  heavyIntentHitModifier: -0.06,
  pierceDamageMultiplier: 0.8,
  pierceHitModifier: 0.04,
  aimAccuracyBonus: 0.16,
  aimDamageBonus: 0.2,
  groupPrimaryHpFactor: 0.68,
  groupPrimaryDamageFactor: 0.4,
  groupSupportHpFactor: 0.5,
  groupSupportDamageFactor: 0.3,
  mageSupportHpFactor: 0.46,
  mageSupportDamageFactor: 0.24,
  mageSupportAccuracyDelta: 0.04,
  mageSupportEvasionFactor: 1.12,
  supportHealDamageMultiplier: 2.4,
  supportShieldDamageMultiplier: 2.15,
  supportShieldMaxHpFraction: 0.42,
  supportHealThreshold: 0.76,
  supportInvisibilityHitPenalty: 0.18,
  maxMana: 4,
  startingMana: 4,
  manaRegenPerRound: 1,
  attackManaCost: 0,
  heavyManaCost: 2,
  quickManaCost: 1,
  sweepManaCost: 2,
  guardManaCost: 0,
} as const;

export const STATS = {
  baseHp: 10.0,
  baseStrength: 5.0,
  baseDexterity: 5.0,
  hpPerPower: 1.18,
  strengthPerPower: 0.58,
  dexterityPerPower: 0.58,
} as const;

export const LOOT = {
  baseLuckPool: 9.2,
  luckPoolGrowth: 1.5,
  normalLuckShare: 0.1,
  bossLuckShare: 0.21,
  luckVariance: 0.22,
  commonCost: 1.0,
  uncommonCost: 1.2,
  rareCost: 3.0,
  veryRareCost: 5.2,
  epicCost: 7.5,
  legendaryCost: 10.25,
  luckyOptionChance: 0.11,
  luckyPowerMultiplier: 1.45,
  jackpotOptionChance: 0.025,
  jackpotPowerMultiplier: 2.35,
  uniqueOptionChance: 0.004,
  uniquePowerMultiplier: 3.2,
  focusDraftChance: 0.3,
  earlyFocusDraftBonus: 0.18,
  focusedStatChoiceChance: 0.76,
  minimumUpgradeScore: 0.05,
  trainingGainMultiplier: 0.25,
  statItemWeight: 0.62,
  weaponItemWeight: 0.38,
  consumableItemWeight: 0.1,
  potionHpPerPower: 1.0,
  wearableSlotLimit: 4,
  stashSlotLimit: 4,
  weaponEffectUncommonChance: 0.28,
  weaponEffectRareChance: 0.5,
  weaponEffectEpicChance: 0.75,
  axeCrushEffectCost: 1.15,
  axeStunEffectCost: 1.45,
} as const;

export const DUNGEON = {
  levels: 5,
  encountersPerLevel: 7,
  initialStatBudget: 0,
  statBudgetGainPerEncounter: 1.55,
  statBudgetGainPerLevel: 3.25,
  statBudgetGainGrowth: 1.08,
  postEncounterHealFraction: 0,
  postLevelHealFraction: 0,
  currentHpFromMaxHpGainFraction: 1,
} as const;

export const ENEMY_CURVE = {
  baseHp: 8.9,
  hpGrowth: 1.132,
  baseDamage: 0.58,
  damageGrowth: 1.17,
  baseAccuracy: 0.64,
  accuracyGrowthPerLevel: 0.02,
  baseEvasion: 3.7,
  evasionGrowth: 1.09,
  bossHpMultiplier: 3.55,
  bossDamageMultiplier: 2.35,
  bossAccuracyBonus: 0.07,
  bossEvasionMultiplier: 1.11,
} as const;

export type ArchetypeKey = "raider" | "brute" | "duelist" | "stalker" | "mage";

export const ARCHETYPES: Record<
  ArchetypeKey,
  { name: string; hpFactor: number; damageFactor: number; accuracyDelta: number; evasionFactor: number; tags: string[] }
> = {
  raider: { name: "Raider", hpFactor: 1.0, damageFactor: 1.0, accuracyDelta: 0.0, evasionFactor: 1.0, tags: ["baseline"] },
  brute: { name: "Brute", hpFactor: 1.35, damageFactor: 1.18, accuracyDelta: -0.04, evasionFactor: 0.72, tags: ["hp-check"] },
  duelist: { name: "Duelist", hpFactor: 0.86, damageFactor: 0.96, accuracyDelta: 0.08, evasionFactor: 1.45, tags: ["dex-check"] },
  stalker: { name: "Stalker", hpFactor: 0.92, damageFactor: 1.28, accuracyDelta: 0.04, evasionFactor: 1.2, tags: ["burst-check"] },
  mage: { name: "Mage", hpFactor: 0.82, damageFactor: 0.8, accuracyDelta: 0.06, evasionFactor: 1.08, tags: ["mage-support"] },
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
}

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

export const BASE_WEAPON: Weapon = {
  name: "Iron Sword",
  damageMultiplier: 1,
  attackDamageMultiplier: 1,
  heavyDamageMultiplier: 1,
  quickDamageMultiplier: 1,
  sweepDamageMultiplier: 1,
  hitModifier: 0,
  critModifier: 0,
  critMultiplierModifier: 0,
  dexterityMultiplier: 1,
  sunderOnHit: 0,
  sunderOnHeavyHit: 0,
  sunderBonusPerStack: 0,
  stunOnHeavyHitChance: 0,
};

export type BiomeId = "forest" | "sand" | "volcanic" | "castle" | "dungeon";

export const BIOME_BY_LEVEL: Record<number, BiomeId> = {
  1: "forest",
  2: "sand",
  3: "volcanic",
  4: "castle",
  5: "dungeon",
};

export function biomeForLevel(level: number): BiomeId {
  return BIOME_BY_LEVEL[Math.max(1, Math.min(5, level))];
}

export const ABILITY = {
  id: "riposte",
  name: "Riposte",
  charges: 1,
  manaCost: 2,
  guardReduction: 0.4,
  pierceGuardReduction: 0.22,
  counterDamageMultiplier: 0.82,
  counterTriggers: 1,
  role: "Brace, reduce incoming damage, then counter the first enemy that hits.",
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

export type PlayerAction = "attack" | "heavy" | "quick" | "sweep" | "guard" | "ability";
export type EnemyIntent = "strike" | "heavy" | "pierce" | "aim" | "guard" | "heal" | "shield" | "invisibility";
export type Phase = "title" | "intro" | "combat" | "loot" | "dead" | "won";

export interface Weapon {
  name: string;
  damageMultiplier: number;
  attackDamageMultiplier: number;
  heavyDamageMultiplier: number;
  quickDamageMultiplier: number;
  sweepDamageMultiplier: number;
  hitModifier: number;
  critModifier: number;
  critMultiplierModifier: number;
  dexterityMultiplier: number;
  sunderOnHit: number;
  sunderOnHeavyHit: number;
  sunderBonusPerStack: number;
  stunOnHeavyHitChance: number;
  damageQualityModifier?: number;
  doubleStrikeChanceModifier?: number;
  staggerOnHitChance?: number;
  freezeOnHitChance?: number;
  onHitBonusDamage?: number;
  bossDamageMultiplier?: number;
  executeDamageMultiplier?: number;
  executeHpThreshold?: number;
  firstStrikeDamageMultiplier?: number;
}

export type ItemRarity = "common" | "uncommon" | "rare" | "very rare" | "epic" | "legendary" | "unique";
export type ItemSlot = "weapon" | "amulet" | "charm" | "relic" | "consumable";
export type StatKey = "hp" | "strength" | "dexterity";
export type WeaponStyle = "sword" | "axe" | "rapier";

export interface Item {
  kind: "stat" | "weapon" | "consumable";
  slot: ItemSlot;
  name: string;
  desc: string;
  power: number;
  isUnique: boolean;
  rarity: ItemRarity;
  // stat item
  stat?: StatKey;
  value?: number;
  // weapon item
  style?: WeaponStyle;
  weapon?: Weapon;
  statBonus?: { hp: number; strength: number; dexterity: number };
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
  damage: number;
  accuracy: number;
  evasion: number;
  tags: string[];
  intent: EnemyIntent;
  aimed: boolean;
  interrupted: boolean;
  riposted?: boolean;
  sunder: number;
  shield: number;
  shieldTurns: number;
  invisible: boolean;
  invisibleTurns: number;
}

export interface Room {
  level: number;
  isBoss: boolean;
  kind: "entrance" | "encounter" | "boss";
  slot: number; // 0 = entrance, 1..encountersPerLevel = encounters, +1 = boss
  powerLevel?: number;
  enemies: Enemy[];
}

export interface Player {
  maxHp: number;
  hp: number;
  maxMana: number;
  mana: number;
  strength: number;
  dexterity: number;
  startingWeapon: Weapon;
  weapon: Weapon;
  abilityCharges: number;
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
  | { type: "support"; kind: "heal" | "shield" | "invisibility"; from: number; target: number }
  | { type: "enemyDown"; index: number }
  | { type: "interrupt"; index: number }
  | { type: "roomClear" }
  | { type: "playerDown" }
  | { type: "shake"; power: number };

export interface GameState {
  phase: Phase;
  roomIndex: number;
  round: number;
  selected: number;
  player: Player;
  trainingBudget: number;
  levelPool: { level: number; remaining: number } | null;
  enemies: Enemy[];
  draft: Item[];
  log: LogEntry[];
  fx: FxEvent[];
  dungeon: Room[];
  stats: {
    actions: Record<PlayerAction, number>;
    damageDealt: number;
    damageTaken: number;
    roomsCleared: number;
    highestLevel: number;
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

export function humanMana(value: number): string {
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

export function humanDamageRange(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 1) return "<1";
  const low = Math.max(1, Math.floor(value * (1 - COMBAT.damageVariance)));
  const high = Math.max(low + 1, Math.ceil(value * (1 + COMBAT.damageVariance)));
  return low === high ? String(low) : `${low}-${high}`;
}

export function humanChance(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  const stepped = Math.round(clamp(value, 0, 1) / HUMAN.chanceStep) * HUMAN.chanceStep;
  return `${whole(stepped * 100)}%`;
}

function pctDetail(value: number): string {
  return humanChance(value);
}

function log(s: GameState, text: string, cls = ""): void {
  s.log.push({ text, cls });
  if (s.log.length > 80) s.log = s.log.slice(-80);
}

function actionLogName(s: GameState, action: PlayerAction): string {
  if (action === "ability") return CHARACTER.ability.name;
  if (action === "heavy" && (s.player.weapon.sunderOnHit || s.player.weapon.stunOnHeavyHitChance)) return "slam";
  return action;
}

// ----------------------------------------------------------------------------
// Enemy + dungeon construction
// ----------------------------------------------------------------------------

let seedCounter = 1;
function nextSeed(): number {
  seedCounter = (seedCounter * 1664525 + 1013904223) % 4294967296;
  return seedCounter;
}

// Mirrors the playtest's levelVisualPool: prefer enemies whose catalog
// `dungeon_level` matches this floor, scoped to the archetype's combat profiles.
function levelEnemyPool(level: number, key: ArchetypeKey): string[] {
  const assigned = LEVEL_ASSIGNED[String(level)] || [];
  if (!assigned.length) return ENEMY_POOLS[key] || [];
  const regular = assigned.filter((a) => !a.boss);
  const scoped = regular.length ? regular : assigned;
  const profiles = LEVEL_POOL_PROFILE_KEYS[key] || [];
  const matched = scoped.filter((a) => profiles.includes(a.profile));
  return (matched.length ? matched : scoped).map((a) => a.id);
}

function bossPool(level: number): string[] {
  const assigned = LEVEL_ASSIGNED[String(level)] || [];
  const bosses = assigned.filter((a) => a.boss).map((a) => a.id);
  if (bosses.length) return bosses;
  const legacy = BOSS_BY_LEVEL[String(level)];
  return legacy ? [legacy] : [];
}

function spriteForEnemy(level: number, key: ArchetypeKey, isBoss: boolean, variant: number): string {
  const pool = isBoss ? bossPool(level) : levelEnemyPool(level, key);
  if (!pool.length) return "";
  return pool[(level * 7 + variant) % pool.length];
}

function randomVisualVariant(rng: () => number, level: number, slot: number): number {
  return Math.floor(rng() * 10000) + level * 100 + slot;
}

function makeEnemy(level: number, key: ArchetypeKey, isBoss: boolean, variant = 0): Enemy {
  const arch = ARCHETYPES[key];
  const levelIndex = level - 1;
  let maxHp = ENEMY_CURVE.baseHp * Math.pow(ENEMY_CURVE.hpGrowth, levelIndex) * arch.hpFactor;
  let damage = ENEMY_CURVE.baseDamage * Math.pow(ENEMY_CURVE.damageGrowth, levelIndex) * arch.damageFactor;
  let accuracy = ENEMY_CURVE.baseAccuracy + ENEMY_CURVE.accuracyGrowthPerLevel * levelIndex + arch.accuracyDelta;
  let evasion = ENEMY_CURVE.baseEvasion * Math.pow(ENEMY_CURVE.evasionGrowth, levelIndex) * arch.evasionFactor;
  const tags = [...arch.tags];
  const spriteId = spriteForEnemy(level, key, isBoss, variant);
  const creatureName = CREATURE_NAMES[spriteId] || arch.name;
  let name = creatureName;
  if (isBoss) {
    maxHp *= ENEMY_CURVE.bossHpMultiplier;
    damage *= ENEMY_CURVE.bossDamageMultiplier;
    accuracy += ENEMY_CURVE.bossAccuracyBonus;
    evasion *= ENEMY_CURVE.bossEvasionMultiplier;
    tags.push("boss");
    name = BOSS_NAMES[level] ?? creatureName;
  }
  return {
    name,
    level,
    archetype: key,
    spriteId,
    visualSeed: (level * 31 + variant * 7 + (isBoss ? 999 : 0)) >>> 0,
    maxHp: round2(maxHp),
    hp: round2(maxHp),
    damage: round2(damage),
    accuracy: clamp(accuracy, 0.35, 0.92),
    evasion: round2(evasion),
    tags,
    intent: "strike",
    aimed: false,
    interrupted: false,
    sunder: 0,
    shield: 0,
    shieldTurns: 0,
    invisible: false,
    invisibleTurns: 0,
  };
}

const BOSS_NAMES: Record<number, string> = {
  1: "Bramble Warden",
  2: "Dune Tyrant",
  3: "Emberforged Colossus",
  4: "Iron Castellan",
  5: "Lord of the Hollow",
};

function round2(n: number): number {
  return Number(n.toFixed(2));
}

function normalizedTags(tags: string | string[]): string[] {
  return Array.isArray(tags) ? tags : [tags];
}

function taggedEnemy(enemy: Enemy, tags: string | string[]): Enemy {
  return {
    ...enemy,
    tags: [...enemy.tags, ...normalizedTags(tags)],
  };
}

function scaleEnemy(
  enemy: Enemy,
  hpFactor: number,
  damageFactor: number,
  accuracyDelta: number,
  evasionFactor: number,
  tags: string | string[]
): Enemy {
  return {
    ...enemy,
    maxHp: round2(enemy.maxHp * hpFactor),
    hp: round2(enemy.maxHp * hpFactor),
    damage: round2(enemy.damage * damageFactor),
    accuracy: clamp(enemy.accuracy + accuracyDelta, 0.35, 0.92),
    evasion: round2(enemy.evasion * evasionFactor),
    tags: [...enemy.tags, ...normalizedTags(tags)],
    aimed: false,
    interrupted: false,
    sunder: 0,
    shield: 0,
    shieldTurns: 0,
    invisible: false,
    invisibleTurns: 0,
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

function buildPowerRoom(level: number, slot: number, rng: () => number): Room {
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
        taggedEnemy(
          makeEnemy(level, leadKey, false, randomVisualVariant(rng, level, slot)),
          [...band.leadTags, ...powerTags]
        ),
      ],
    };
  }

  const lead = scaleEnemy(
    makeEnemy(level, leadKey, false, randomVisualVariant(rng, level, slot * 2)),
    band.leadHpFactor,
    band.leadDamageFactor,
    0,
    1,
    ["group-primary", ...band.leadTags, ...powerTags]
  );
  const enemies: Enemy[] = [lead];

  for (let supportIndex = 1; supportIndex < band.enemyCount; supportIndex += 1) {
    const supportKey = supportArchetypeKey(leadKey, band, powerLevel, rng);
    const useMage = level >= 2 && rng() < band.mageChance;
    const support = makeEnemy(level, useMage ? "mage" : supportKey, false, randomVisualVariant(rng, level, slot * 3 + supportIndex));
    if (useMage) {
      enemies.push(
        scaleEnemy(
          support,
          TACTICAL.mageSupportHpFactor,
          TACTICAL.mageSupportDamageFactor,
          TACTICAL.mageSupportAccuracyDelta,
          TACTICAL.mageSupportEvasionFactor,
          ["group-support", "mage-support", ...powerTags]
        )
      );
    } else {
      const sizeFactor = supportIndex > 1 ? 0.88 : 1;
      enemies.push(
        scaleEnemy(
          support,
          band.supportHpFactor * sizeFactor,
          band.supportDamageFactor * sizeFactor,
          0.03,
          1.08,
          ["group-support", ...powerTags]
        )
      );
    }
  }

  return { level, isBoss: false, kind: "encounter", slot: slot + 1, powerLevel, enemies };
}

export function buildDungeon(rng: () => number = Math.random): Room[] {
  const rooms: Room[] = [];
  for (let level = 1; level <= DUNGEON.levels; level += 1) {
    // entrance: explore-only, no fight — the "start room" of the floor
    rooms.push({ level, isBoss: false, kind: "entrance", slot: 0, enemies: [] });
    for (let slot = 0; slot < DUNGEON.encountersPerLevel; slot += 1) {
      rooms.push(buildPowerRoom(level, slot, rng));
    }
    const bossKey = bossArchetypeKey(level);
    rooms.push({ level, isBoss: true, kind: "boss", slot: DUNGEON.encountersPerLevel + 1, enemies: [makeEnemy(level, bossKey, true, level)] });
  }
  return rooms;
}

// ----------------------------------------------------------------------------
// Combat math (player)
// ----------------------------------------------------------------------------

export function playerBaseDamage(p: Player): number {
  return (
    Math.max(0, COMBAT.basePlayerDamage + COMBAT.strengthDamageScale * Math.pow(Math.max(0, p.strength), COMBAT.strengthDamageExponent)) *
    p.weapon.damageMultiplier
  );
}

function heavyEvasionHitPenalty(enemy: Enemy): number {
  return clamp((enemy.evasion - TACTICAL.heavyEvasionHitPenaltyFloor) * TACTICAL.heavyEvasionHitPenaltyScale, 0, TACTICAL.heavyEvasionHitPenaltyMax);
}

export function playerHitChance(p: Player, enemy: Enemy, action: PlayerAction): number {
  const dexBonus = COMBAT.dexterityHitScale * Math.pow(Math.max(0, p.dexterity), COMBAT.dexterityHitExponent);
  const evasionPenalty = COMBAT.enemyEvasionHitScale * Math.pow(Math.max(0, enemy.evasion), COMBAT.enemyEvasionExponent);
  let value = COMBAT.basePlayerHitChance + dexBonus - evasionPenalty + p.weapon.hitModifier;
  if (action === "heavy") value += TACTICAL.heavyHitModifier - heavyEvasionHitPenalty(enemy);
  if (action === "quick") value += TACTICAL.quickHitModifier;
  if (action === "sweep") value += TACTICAL.sweepHitModifier;
  if (enemy.invisible) value -= TACTICAL.supportInvisibilityHitPenalty;
  return clamp(value, COMBAT.minPlayerHitChance, COMBAT.maxPlayerHitChance);
}

export function playerCritChance(p: Player, enemy: Enemy, action: PlayerAction): number {
  const dexBonus = COMBAT.dexterityCritScale * Math.pow(Math.max(0, p.dexterity), COMBAT.dexterityCritExponent);
  const evasionPenalty = COMBAT.enemyEvasionCritScale * Math.sqrt(Math.max(0, enemy.evasion));
  let value = COMBAT.baseCritChance + dexBonus - evasionPenalty + p.weapon.critModifier;
  if (action === "quick") value += TACTICAL.quickCritModifier;
  return clamp(value, 0, COMBAT.maxCritChance);
}

function playerDamageQuality(p: Player, enemy: Enemy, action: PlayerAction): number {
  const dexBonus = COMBAT.dexterityDamageQualityScale * Math.pow(Math.max(0, p.dexterity), COMBAT.dexterityDamageQualityExponent);
  const evasionPenalty = COMBAT.enemyEvasionDamageQualityScale * Math.pow(Math.max(0, enemy.evasion), COMBAT.enemyEvasionDamageQualityExponent);
  const quick = action === "quick" ? TACTICAL.quickQualityBonus : 0;
  const sweep = action === "sweep" ? TACTICAL.sweepQualityBonus : 0;
  return clamp(dexBonus - evasionPenalty + quick + sweep + (p.weapon.damageQualityModifier || 0), 0, 1);
}

function variedDamage(base: number, quality = 0): number {
  const high = 1 + COMBAT.damageVariance;
  const roll = 1 - COMBAT.damageVariance + Math.random() * COMBAT.damageVariance * 2;
  return base * (roll + (high - roll) * clamp(quality, 0, 1));
}

export function enemyIntentDamage(enemy: Enemy): number {
  const map: Record<EnemyIntent, number> = {
    strike: TACTICAL.strikeDamageMultiplier,
    heavy: TACTICAL.heavyIntentDamageMultiplier,
    pierce: TACTICAL.pierceDamageMultiplier,
    guard: 0,
    aim: 0,
    heal: 0,
    shield: 0,
    invisibility: 0,
  };
  let multiplier = map[enemy.intent] || 0;
  if (enemy.aimed && multiplier > 0) multiplier += TACTICAL.aimDamageBonus;
  return enemy.damage * multiplier;
}

export function doubleStrikeChance(p: Player): number {
  return clamp(
    TACTICAL.doubleStrikeBaseChance + p.dexterity * TACTICAL.doubleStrikePerDexterity + (p.weapon.doubleStrikeChanceModifier || 0),
    0,
    TACTICAL.maxDoubleStrikeChance
  );
}

export function interruptChance(p: Player): number {
  return clamp(TACTICAL.quickInterruptBaseChance + p.dexterity * TACTICAL.quickInterruptPerDexterity, 0, TACTICAL.maxInterruptChance);
}

function abilityGuardReduction(enemy: Enemy): number {
  if (enemy.intent === "pierce") return CHARACTER.ability.pierceGuardReduction;
  return CHARACTER.ability.guardReduction;
}

function actionDamageMultiplier(p: Player, action: PlayerAction): number {
  if (action === "heavy") return TACTICAL.heavyDamageMultiplier * (p.weapon.heavyDamageMultiplier || 1);
  if (action === "quick") return TACTICAL.quickDamageMultiplier * (p.weapon.quickDamageMultiplier || 1);
  if (action === "sweep") {
    const dexterityBonus = clamp((p.dexterity - STATS.baseDexterity) * TACTICAL.sweepDexterityDamagePerPoint, 0, TACTICAL.sweepMaxDexterityDamageBonus);
    return (TACTICAL.sweepDamageMultiplier + dexterityBonus) * (p.weapon.sweepDamageMultiplier || 1);
  }
  return TACTICAL.attackDamageMultiplier * (p.weapon.attackDamageMultiplier || 1);
}

function actionGlancingDamageMultiplier(action: PlayerAction): number {
  if (action === "heavy") return TACTICAL.heavyGlancingDamageMultiplier;
  if (action === "quick") return TACTICAL.quickGlancingDamageMultiplier;
  if (action === "sweep") return TACTICAL.sweepGlancingDamageMultiplier;
  if (action === "attack") return TACTICAL.attackGlancingDamageMultiplier;
  return 0;
}

function contextualWeaponDamageMultiplier(s: GameState, enemy: Enemy): number {
  const w = s.player.weapon;
  let multiplier = 1;
  if (enemy.tags.includes("boss")) multiplier *= w.bossDamageMultiplier || 1;
  if (enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= (w.executeHpThreshold || 0.35)) multiplier *= w.executeDamageMultiplier || 1;
  if (s.round === 1) multiplier *= w.firstStrikeDamageMultiplier || 1;
  return multiplier;
}

function sunderEffectiveness(action: PlayerAction): number {
  if (action === "sweep" || action === "guard" || action === "ability") return 0;
  if (action === "quick") return TACTICAL.sunderQuickEffectiveness;
  if (action === "heavy") return TACTICAL.sunderHeavyEffectiveness;
  return 1;
}

function sunderDamageMultiplier(p: Player, enemy: Enemy, action: PlayerAction): number {
  if (!enemy || !enemy.sunder || action === "sweep" || action === "guard" || action === "ability") return 1;
  const perStack = TACTICAL.sunderDamageBonusPerStack + (p.weapon.sunderBonusPerStack || 0);
  return 1 + enemy.sunder * perStack * sunderEffectiveness(action);
}

function sunderAddedByAction(p: Player, action: PlayerAction): number {
  if (action === "attack") return p.weapon.sunderOnHit || 0;
  if (action === "heavy") return (p.weapon.sunderOnHit || 0) + (p.weapon.sunderOnHeavyHit || 0);
  return 0;
}

// Expected-value projections (used by the HUD / auto policy)
export function expectedPlayerDamage(s: GameState, enemy: Enemy, action: PlayerAction, strikeMultiplier = 1, canCrit = true): number {
  const p = s.player;
  if (!enemy || enemy.hp <= 0 || action === "guard" || action === "ability") return 0;
  const hit = playerHitChance(p, enemy, action);
  const crit = canCrit && action !== "sweep" ? playerCritChance(p, enemy, action) : 0;
  const quality = playerDamageQuality(p, enemy, action);
  let damage =
    playerBaseDamage(p) *
    actionDamageMultiplier(p, action) *
    sunderDamageMultiplier(p, enemy, action) *
    contextualWeaponDamageMultiplier(s, enemy) *
    strikeMultiplier;
  if (action !== "sweep") damage *= 1 + (p.weapon.onHitBonusDamage || 0);
  if (enemy.intent === "guard") {
    let reduction = TACTICAL.enemyGuardReduction;
    if (action === "heavy") reduction *= 1 - TACTICAL.heavyGuardIgnore;
    damage *= 1 - reduction;
  }
  const expectedDamage = damage * (1 + COMBAT.damageVariance * quality);
  const critFactor = 1 + crit * (COMBAT.critMultiplier + p.weapon.critMultiplierModifier - 1);
  return expectedDamage * (hit * critFactor + (1 - hit) * actionGlancingDamageMultiplier(action));
}

export function expectedIncomingDamage(s: GameState, defense: false | "guard" | "ability" = false): number {
  const guarding = defense === "guard";
  const usingAbility = defense === "ability";
  return s.enemies.reduce((sum, enemy) => {
    if (enemy.hp <= 0 || enemy.interrupted || enemy.intent === "aim" || enemy.intent === "guard") return sum;
    let incoming = enemyIntentDamage(enemy);
    if (usingAbility) incoming *= 1 - abilityGuardReduction(enemy);
    else if (guarding) {
      const reduction = enemy.intent === "pierce" ? TACTICAL.pierceGuardReduction : TACTICAL.playerGuardReduction;
      incoming *= 1 - reduction;
    }
    return sum + incoming;
  }, 0);
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
    .filter(({ enemy }) => enemy.hp > 0 && (enemy.shield || 0) < enemy.maxHp * TACTICAL.supportShieldMaxHpFraction);
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => {
    const bestScore: [number, number] = [indexPriority(best.index, casterIndex), best.enemy.maxHp * TACTICAL.supportShieldMaxHpFraction - (best.enemy.shield || 0)];
    const currentScore: [number, number] = [indexPriority(current.index, casterIndex), current.enemy.maxHp * TACTICAL.supportShieldMaxHpFraction - (current.enemy.shield || 0)];
    return currentScore[0] > bestScore[0] || (currentScore[0] === bestScore[0] && currentScore[1] > bestScore[1]) ? current : best;
  }).index;
}

function supportInvisibilityTarget(enemies: Enemy[], casterIndex: number): number | null {
  const candidates = enemies.map((enemy, index) => ({ enemy, index })).filter(({ enemy }) => enemy.hp > 0 && !enemy.invisible);
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => {
    const bestScore: [number, number] = [indexPriority(best.index, casterIndex), best.enemy.maxHp - best.enemy.hp];
    const currentScore: [number, number] = [indexPriority(current.index, casterIndex), current.enemy.maxHp - current.enemy.hp];
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
  const tags = new Set(enemy.tags);
  if (tags.has("boss")) {
    return (["heavy", "strike", "pierce", "aim", "heavy", "strike"] as EnemyIntent[])[(round - 1) % 6];
  }
  if (tags.has("mage-support")) {
    const candidates: { intent: EnemyIntent; weight: number }[] = [
      { intent: "shield", weight: 0.3 },
      { intent: "invisibility", weight: 0.2 },
      { intent: "strike", weight: 0.22 },
      { intent: "aim", weight: 0.1 },
    ];
    if (supportHealTarget(allies, casterIndex) !== null) candidates.unshift({ intent: "heal", weight: 0.34 });
    return weightedIntentChoice(
      candidates.filter((candidate) => {
        if (candidate.intent === "shield") return supportShieldTarget(allies, casterIndex) !== null;
        if (candidate.intent === "invisibility") return supportInvisibilityTarget(allies, casterIndex) !== null;
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
// Mana / ability availability
// ----------------------------------------------------------------------------

export function actionManaCost(action: PlayerAction): number {
  if (action === "attack") return TACTICAL.attackManaCost;
  if (action === "heavy") return TACTICAL.heavyManaCost;
  if (action === "quick") return TACTICAL.quickManaCost;
  if (action === "sweep") return TACTICAL.sweepManaCost;
  if (action === "guard") return TACTICAL.guardManaCost;
  if (action === "ability") return CHARACTER.ability.manaCost;
  return 0;
}

export function canAffordAction(p: Player, action: PlayerAction): boolean {
  return (p.mana || 0) >= actionManaCost(action);
}

export function abilityAvailable(p: Player): boolean {
  return (p.abilityCharges || 0) > 0 && canAffordAction(p, "ability");
}

// ----------------------------------------------------------------------------
// Turn resolution
// ----------------------------------------------------------------------------

function applyDamageToEnemy(enemy: Enemy, damage: number): number {
  const blocked = Math.min(enemy.shield || 0, Math.max(0, damage));
  enemy.shield = Math.max(0, (enemy.shield || 0) - blocked);
  enemy.hp = Math.max(0, enemy.hp - Math.max(0, damage - blocked));
  return blocked;
}

function expirePlayerTurnStatuses(s: GameState): void {
  s.enemies.forEach((enemy) => {
    if (enemy.shieldTurns > 0) {
      enemy.shieldTurns -= 1;
      if (enemy.shieldTurns <= 0) enemy.shield = 0;
    }
    if (enemy.invisibleTurns > 0) {
      enemy.invisibleTurns -= 1;
      enemy.invisible = enemy.invisibleTurns > 0;
    }
  });
}

function resolveStrike(s: GameState, enemyIndex: number, action: PlayerAction, multiplier = 1, canCrit = true, label: string | null = null): number {
  const p = s.player;
  const enemy = s.enemies[enemyIndex];
  const hit = playerHitChance(p, enemy, action);
  const hitRoll = Math.random();
  const landed = hitRoll <= hit;
  const rollText = `roll ${pctDetail(hitRoll)} / ${pctDetail(hit)}`;
  const actionName = label || actionLogName(s, action);
  const grazeMultiplier = landed ? 1 : actionGlancingDamageMultiplier(action);
  let damage = variedDamage(
    playerBaseDamage(p) *
      actionDamageMultiplier(p, action) *
      sunderDamageMultiplier(p, enemy, action) *
      contextualWeaponDamageMultiplier(s, enemy) *
      (action !== "sweep" ? 1 + (p.weapon.onHitBonusDamage || 0) : 1) *
      multiplier *
      grazeMultiplier,
    playerDamageQuality(p, enemy, action)
  );
  if (enemy.intent === "guard") {
    let reduction = TACTICAL.enemyGuardReduction;
    if (action === "heavy") reduction *= 1 - TACTICAL.heavyGuardIgnore;
    damage *= 1 - reduction;
  }
  const crit = landed && action !== "sweep" && canCrit && Math.random() <= playerCritChance(p, enemy, action);
  if (crit) damage *= COMBAT.critMultiplier + p.weapon.critMultiplierModifier;
  const blocked = applyDamageToEnemy(enemy, damage);
  const sunderAdded = landed ? sunderAddedByAction(p, action) : 0;
  if (sunderAdded > 0 && enemy.hp > 0) enemy.sunder = Math.min(TACTICAL.sunderMaxStacks, (enemy.sunder || 0) + sunderAdded);
  const stunned = action === "heavy" && landed && enemy.hp > 0 && (p.weapon.stunOnHeavyHitChance || 0) > 0 && Math.random() <= (p.weapon.stunOnHeavyHitChance || 0);
  const staggered = landed && enemy.hp > 0 && (p.weapon.staggerOnHitChance || 0) > 0 && Math.random() <= (p.weapon.staggerOnHitChance || 0);
  const frozen = landed && enemy.hp > 0 && (p.weapon.freezeOnHitChance || 0) > 0 && Math.random() <= (p.weapon.freezeOnHitChance || 0);
  if (stunned || staggered || frozen) enemy.interrupted = true;
  const verb = action === "sweep" ? (landed ? "struck" : "grazed") : landed ? "hit" : "grazed";
  const sunderText = sunderAdded > 0 && enemy.hp > 0 ? ` · Sunder ${enemy.sunder}` : "";
  const stunText = stunned ? " · stunned" : staggered ? " · staggered" : frozen ? " · frozen" : "";
  const shieldText = blocked > 0 ? ` · ${humanDamage(blocked)} blocked` : "";
  log(s, `${actionName} ${verb} ${enemy.name} for ${humanDamage(damage)} (${rollText})${crit ? " crit" : ""}${shieldText}${sunderText}${stunText}.`);
  s.fx.push({ type: "strike", from: "player", target: enemyIndex, hit: landed, crit, damage, label: actionName });
  s.stats.damageDealt += damage;
  return damage;
}

function resolveSweep(s: GameState): void {
  let total = 0;
  s.enemies.forEach((enemy, index) => {
    if (enemy.hp <= 0) return;
    total += resolveStrike(s, index, "sweep");
  });
  if (total > 0) log(s, `Sweep total: ${humanDamage(total)}.`, "good");
}

function resolveRiposte(s: GameState, enemyIndex: number): number {
  const damage = resolveStrike(s, enemyIndex, "attack", CHARACTER.ability.counterDamageMultiplier, true, "Riposte");
  if (damage > 0) s.enemies[enemyIndex].riposted = true;
  return damage;
}

function resolveEnemies(s: GameState, action: PlayerAction): void {
  expirePlayerTurnStatuses(s);
  let riposteTriggers = action === "ability" ? CHARACTER.ability.counterTriggers : 0;
  s.enemies.forEach((enemy, index) => {
    if (enemy.hp <= 0 || enemy.interrupted) return;
    if (enemy.intent === "aim" || enemy.intent === "guard") {
      log(s, `${enemy.name} used ${enemy.intent}.`);
      return;
    }
    if (enemy.intent === "heal") {
      const targetIndex = supportHealTarget(s.enemies, index);
      if (targetIndex !== null) {
        const target = s.enemies[targetIndex];
        const amount = enemy.damage * TACTICAL.supportHealDamageMultiplier;
        const before = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + amount);
        log(s, `${enemy.name} healed ${target.name} for ${humanHp(target.hp - before)}.`, "good");
        s.fx.push({ type: "support", kind: "heal", from: index, target: targetIndex });
      }
      return;
    }
    if (enemy.intent === "shield") {
      const targetIndex = supportShieldTarget(s.enemies, index);
      if (targetIndex !== null) {
        const target = s.enemies[targetIndex];
        const maxShield = target.maxHp * TACTICAL.supportShieldMaxHpFraction;
        const amount = enemy.damage * TACTICAL.supportShieldDamageMultiplier;
        const before = target.shield || 0;
        target.shield = Math.min(maxShield, before + amount);
        target.shieldTurns = 1;
        log(s, `${enemy.name} shielded ${target.name} for ${humanHp(target.shield - before)}.`, "good");
        s.fx.push({ type: "support", kind: "shield", from: index, target: targetIndex });
      }
      return;
    }
    if (enemy.intent === "invisibility") {
      const targetIndex = supportInvisibilityTarget(s.enemies, index);
      if (targetIndex !== null) {
        const target = s.enemies[targetIndex];
        target.invisible = true;
        target.invisibleTurns = 1;
        log(s, `${enemy.name} hid ${target.name}.`, "warn");
        s.fx.push({ type: "support", kind: "invisibility", from: index, target: targetIndex });
      }
      return;
    }
    let damage = variedDamage(enemyIntentDamage(enemy));
    if (action === "ability") damage *= 1 - abilityGuardReduction(enemy);
    else if (action === "guard") {
      const reduction = enemy.intent === "pierce" ? TACTICAL.pierceGuardReduction : TACTICAL.playerGuardReduction;
      damage *= 1 - reduction;
    }
    s.player.hp = Math.max(0, s.player.hp - damage);
    s.stats.damageTaken += damage;
    log(s, `${enemy.name} dealt ${humanDamage(damage)}.`);
    s.fx.push({ type: "strike", from: index, target: "player", hit: true, crit: false, damage, label: enemy.intent });
    if (action === "ability" && riposteTriggers > 0 && s.player.hp > 0 && enemy.hp > 0) {
      riposteTriggers -= 1;
      resolveRiposte(s, index);
    }
  });
}

// Training growth + recalc (mirrors recalculatePlayerFromGear / applyTrainingGain)
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
  const weaponItem = p.items.find((item) => item.kind === "weapon");
  p.weapon = weaponItem && weaponItem.weapon ? { ...weaponItem.weapon } : { ...(p.startingWeapon || BASE_WEAPON) };
  p.items.forEach((item) => {
    if (item.kind === "stat" && item.value != null) {
      if (item.stat === "hp") p.maxHp += item.value;
      if (item.stat === "strength") p.strength += item.value;
      if (item.stat === "dexterity") p.dexterity += item.value;
    }
    if (item.statBonus) {
      p.maxHp += item.statBonus.hp || 0;
      p.strength += item.statBonus.strength || 0;
      p.dexterity += item.statBonus.dexterity || 0;
    }
  });
  p.dexterity *= p.weapon.dexterityMultiplier || 1;
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
  s.player.maxMana = TACTICAL.maxMana;
  s.player.mana = Math.min(TACTICAL.maxMana, TACTICAL.startingMana);
  s.player.abilityCharges = CHARACTER.ability.charges;
  s.enemies = room.enemies.map((enemy) => ({
    ...enemy,
    hp: enemy.maxHp,
    intent: "strike" as EnemyIntent,
    aimed: false,
    interrupted: false,
    riposted: false,
    sunder: 0,
    shield: 0,
    shieldTurns: 0,
    invisible: false,
    invisibleTurns: 0,
  }));
  s.enemies.forEach((enemy, index) => {
    enemy.intent = chooseIntent(enemy, 1, s.enemies, index);
  });
  s.stats.highestLevel = Math.max(s.stats.highestLevel, room.level);
}

function clearRoom(s: GameState): void {
  const room = s.dungeon[s.roomIndex];
  log(s, `Cleared encounter.`, "good");
  s.stats.roomsCleared += 1;
  s.fx.push({ type: "roomClear" });
  applyTrainingGain(s, room);
  if (room.isBoss && room.level >= DUNGEON.levels) {
    s.roomIndex += 1;
    s.phase = "won";
    log(s, "The Hollow is cleansed. You win.", "good");
    return;
  }
  s.phase = "loot";
  s.draft = generateLootDraft(s, room);
}

// ----------------------------------------------------------------------------
// Public action API
// ----------------------------------------------------------------------------

function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

/** Apply a player action and resolve the enemy turn. Returns a new state. */
export function applyAction(prev: GameState, action: PlayerAction): GameState {
  const s = cloneState(prev);
  s.fx = [];
  if (s.phase !== "combat" || s.player.hp <= 0) return s;
  const alive = s.enemies.filter((enemy) => enemy.hp > 0);
  if (!alive.length) return s;
  s.enemies.forEach((enemy) => {
    enemy.riposted = false;
  });
  if (action === "ability" && (s.player.abilityCharges || 0) <= 0) {
    log(s, "No class ability charges left.", "warn");
    return s;
  }
  if (!canAffordAction(s.player, action)) {
    log(s, `${actionLogName(s, action)} needs ${humanMana(actionManaCost(action))} MP.`, "warn");
    return s;
  }
  s.stats.actions[action] += 1;
  s.player.mana = Math.max(0, s.player.mana - actionManaCost(action));
  s.fx.push({ type: "playerAct", action });

  if (action === "sweep") {
    resolveSweep(s);
  } else if (action === "ability") {
    s.player.abilityCharges = Math.max(0, (s.player.abilityCharges || 0) - 1);
    log(s, `${CHARACTER.ability.name}: brace and counter.`, "good");
  } else if (action !== "guard") {
    let targetIndex = s.selected;
    if (!s.enemies[targetIndex] || s.enemies[targetIndex].hp <= 0) {
      const nextIndex = s.enemies.findIndex((enemy) => enemy.hp > 0);
      targetIndex = Math.max(0, nextIndex);
      s.selected = targetIndex;
    }
    resolveStrike(s, targetIndex, action);
    const target = s.enemies[targetIndex];
    if (target.hp > 0 && action === "quick" && Math.random() <= doubleStrikeChance(s.player)) {
      resolveStrike(s, targetIndex, action, TACTICAL.doubleStrikeDamageMultiplier, false);
    }
    if (target.hp > 0 && action === "quick" && target.intent === "heavy" && Math.random() <= interruptChance(s.player)) {
      target.interrupted = true;
      log(s, `${target.name} was interrupted.`, "good");
      s.fx.push({ type: "interrupt", index: targetIndex });
    }
  } else {
    log(s, "Guard raised.", "good");
  }

  // mark newly-dead enemies for FX
  prev.enemies.forEach((before, i) => {
    if (before.hp > 0 && s.enemies[i] && s.enemies[i].hp <= 0) s.fx.push({ type: "enemyDown", index: i });
  });

  if (s.enemies.every((enemy) => enemy.hp <= 0)) {
    clearRoom(s);
    return s;
  }

  resolveEnemies(s, action);
  if (s.player.hp <= 0) {
    s.phase = "dead";
    log(s, "You fall. The run ends here.", "bad");
    s.fx.push({ type: "playerDown" });
    return s;
  }
  // A Riposte counter during the enemy turn can land the killing blow on the last
  // enemy. Emit its death FX and clear here too — otherwise the encounter locks
  // with every enemy dead but the phase still "combat" and all actions disabled.
  prev.enemies.forEach((before, i) => {
    if (
      before.hp > 0 &&
      s.enemies[i] &&
      s.enemies[i].hp <= 0 &&
      !s.fx.some((event) => event.type === "enemyDown" && event.index === i)
    ) {
      s.fx.push({ type: "enemyDown", index: i });
    }
  });
  if (s.enemies.every((enemy) => enemy.hp <= 0)) {
    clearRoom(s);
    return s;
  }
  s.player.mana = Math.min(s.player.maxMana, s.player.mana + TACTICAL.manaRegenPerRound);
  s.round += 1;
  if (s.round > COMBAT.maxCombatRounds) {
    s.player.hp = 0;
    s.phase = "dead";
    log(s, "Exhaustion claims you. The run ends here.", "bad");
    s.fx.push({ type: "playerDown" });
    return s;
  }
  s.enemies.forEach((enemy, index) => {
    if (enemy.hp <= 0) return;
    if (enemy.interrupted) {
      enemy.interrupted = false;
      enemy.aimed = false;
      enemy.intent = chooseIntent(enemy, s.round, s.enemies, index);
      return;
    }
    enemy.aimed = enemy.intent === "aim";
    enemy.intent = chooseIntent(enemy, s.round, s.enemies, index);
  });
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
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + (item.value || 0));
      s.player.consumed += 1;
      log(s, `Drank ${item.name}. Restored ${humanHp(s.player.hp - before)} HP.`, "good");
    } else {
      equipWearableItem(s, item);
      log(s, `Equipped ${item.name}.`, "good");
    }
  } else {
    log(s, "Kept current gear.");
  }
  s.roomIndex += 1;
  s.draft = [];
  startRoom(s);
  return s;
}

export { recommendedLootIndex };

export function newGame(): GameState {
  seedCounter = Math.floor(Math.random() * 4294967296) >>> 0;
  const dungeon = buildDungeon();
  const startingWeapon = { ...BASE_WEAPON };
  const state: GameState = {
    phase: "title",
    roomIndex: 0,
    round: 1,
    selected: 0,
    player: {
      maxHp: STATS.baseHp,
      hp: STATS.baseHp,
      maxMana: TACTICAL.maxMana,
      mana: Math.min(TACTICAL.maxMana, TACTICAL.startingMana),
      strength: STATS.baseStrength,
      dexterity: STATS.baseDexterity,
      startingWeapon,
      weapon: { ...startingWeapon },
      abilityCharges: CHARACTER.ability.charges,
      items: [],
      stash: [],
      consumed: 0,
    },
    trainingBudget: DUNGEON.initialStatBudget,
    levelPool: null,
    enemies: [],
    draft: [],
    log: [],
    fx: [],
    dungeon,
    stats: {
      actions: { attack: 0, heavy: 0, quick: 0, sweep: 0, guard: 0, ability: 0 },
      damageDealt: 0,
      damageTaken: 0,
      roomsCleared: 0,
      highestLevel: 1,
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
