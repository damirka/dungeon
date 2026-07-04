/**
 * Loot draft generation + item factories + scoring for the canonical React
 * tactical engine (telegraphed-tactics model: integer stat/damage values,
 * flat block gear). Pure functions over GameState; the equip / consume /
 * advance flow lives in core.ts (it needs startRoom + recalc).
 */

import {
  BASE_WEAPON,
  EFFECT_LABELS,
  LOOT,
  STATS,
  humanGain,
  humanHp,
  type EffectKey,
  type GameState,
  type Item,
  type ItemEffect,
  type ItemRarity,
  type ItemSlot,
  type Player,
  type Room,
  type StatBonus,
  type StatKey,
  type WeaponStyle,
  type Weapon,
} from "./core";
import { WEAPON_TEMPLATES, type MappedWeaponEffect, type WeaponTemplate } from "./weaponTemplates";
import { ITEM_TEMPLATES, type ItemTemplate, type TrinketSlotKind } from "./itemTemplates";

// Weapon styles actually present in the catalog-derived template set.
const TEMPLATE_STYLES: WeaponStyle[] = [...new Set(WEAPON_TEMPLATES.map((template) => template.style))];

export function rarityOf(power: number, isUnique = false): ItemRarity {
  if (isUnique) return "unique";
  if (power >= LOOT.legendaryCost) return "legendary";
  if (power >= LOOT.epicCost) return "epic";
  if (power >= LOOT.veryRareCost) return "very rare";
  if (power >= LOOT.rareCost) return "rare";
  if (power >= LOOT.uncommonCost) return "uncommon";
  return "common";
}

export function tierOf(power: number): number {
  if (power >= LOOT.legendaryCost) return 6;
  if (power >= LOOT.epicCost) return 5;
  if (power >= LOOT.veryRareCost) return 4;
  if (power >= LOOT.rareCost) return 3;
  if (power >= LOOT.uncommonCost) return 2;
  return 1;
}

function weightedChoice<T>(weightedValues: { value: T; weight: number }[]): T {
  const total = weightedValues.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  let roll = Math.random() * total;
  for (const item of weightedValues) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item.value;
  }
  return weightedValues[weightedValues.length - 1].value;
}

function spendLuck(s: GameState, room: Room): number {
  const pool = s.levelPool;
  if (!pool) return LOOT.commonCost;
  const share = room.isBoss ? LOOT.bossLuckShare : room.elite ? LOOT.eliteLuckShare : LOOT.normalLuckShare;
  const target = LOOT.baseLuckPool * Math.pow(LOOT.luckPoolGrowth, room.level - 1) * share;
  const varied = target * (1 - LOOT.luckVariance + Math.random() * LOOT.luckVariance * 2);
  const spend = Math.min(pool.remaining, Math.max(LOOT.commonCost, varied));
  pool.remaining = Math.max(0, pool.remaining - spend);
  return spend;
}

function rollOptionPower(spend: number, level: number): { power: number; isUnique: boolean } {
  // later floors never roll below their rarity floor — no common junk at depth
  const floor = Math.max(0.75, LOOT.minOptionPowerByLevel[Math.min(level, LOOT.minOptionPowerByLevel.length - 1)] || 0);
  let power = spend * (0.72 + Math.random() * 0.48);
  const roll = Math.random();
  if (roll < LOOT.uniqueOptionChance) {
    power *= LOOT.uniquePowerMultiplier;
    return { power: Math.max(floor, power), isUnique: true };
  }
  if (roll < LOOT.uniqueOptionChance + LOOT.jackpotOptionChance) power *= LOOT.jackpotPowerMultiplier;
  else if (roll < LOOT.uniqueOptionChance + LOOT.jackpotOptionChance + LOOT.luckyOptionChance) power *= LOOT.luckyPowerMultiplier;
  return { power: Math.max(floor, power), isUnique: false };
}

function draftFocus(room: Room): StatKey | null {
  const chance = LOOT.focusDraftChance + (room.level <= 2 ? LOOT.earlyFocusDraftBonus : 0);
  if (Math.random() > chance) return null;
  return Math.random() < 0.5 ? "strength" : "dexterity";
}

const STAT_TARGETS: StatKey[] = ["hp", "strength", "dexterity", "block"];

function availableStatTargets(usedKeys: Set<string>): StatKey[] {
  return STAT_TARGETS.filter((stat) => !usedKeys.has(`stat:${stat}`));
}

function availableWeaponStyles(usedKeys: Set<string>): WeaponStyle[] {
  return TEMPLATE_STYLES.filter((style) => !usedKeys.has(`weapon:${style}`));
}

function availableLootKinds(usedKeys: Set<string>): { value: "stat" | "weapon" | "focus" | "consumable"; weight: number }[] {
  return [
    { value: "stat" as const, weight: availableStatTargets(usedKeys).length ? LOOT.statItemWeight : 0 },
    { value: "weapon" as const, weight: availableWeaponStyles(usedKeys).length ? LOOT.weaponItemWeight : 0 },
    { value: "focus" as const, weight: usedKeys.has("focus") ? 0 : LOOT.focusItemWeight },
    { value: "consumable" as const, weight: usedKeys.has("instant:restore_hp") ? 0 : LOOT.consumableItemWeight },
  ].filter((item) => item.weight > 0);
}

function chooseStatTarget(focus: StatKey | null, usedKeys: Set<string>): StatKey | null {
  const available = availableStatTargets(usedKeys);
  if (!available.length) return null;
  if (focus && available.includes(focus) && Math.random() <= LOOT.focusedStatChoiceChance) return focus;
  return weightedChoice(
    [
      { value: "hp" as StatKey, weight: available.includes("hp") ? 1 : 0 },
      { value: "strength" as StatKey, weight: available.includes("strength") ? 1 : 0 },
      { value: "dexterity" as StatKey, weight: available.includes("dexterity") ? 1 : 0 },
      { value: "block" as StatKey, weight: available.includes("block") ? 0.8 : 0 },
    ].filter((item) => item.weight > 0)
  );
}

function chooseWeaponStyle(focus: StatKey | null, usedKeys: Set<string>): WeaponStyle {
  const available = new Set(availableWeaponStyles(usedKeys));
  const filter = (options: { value: WeaponStyle; weight: number }[]) => options.filter((o) => available.has(o.value));
  if (focus === "strength") {
    return weightedChoice(filter([{ value: "sword", weight: 0.32 }, { value: "axe", weight: 0.56 }, { value: "rapier", weight: 0.12 }]));
  }
  if (focus === "dexterity") {
    return weightedChoice(filter([{ value: "sword", weight: 0.18 }, { value: "axe", weight: 0.1 }, { value: "rapier", weight: 0.72 }]));
  }
  return weightedChoice(filter([{ value: "sword", weight: 0.45 }, { value: "axe", weight: 0.25 }, { value: "rapier", weight: 0.3 }]));
}

const SLOT_LABELS: Record<ItemSlot, string> = {
  weapon: "Weapon",
  amulet: "Amulet",
  charm: "Charm",
  relic: "Relic",
  shield: "Shield",
  focus: "Focus",
  consumable: "Now",
};

function statLootNote(stat: StatKey): string {
  if (stat === "hp") return "max HP buffer";
  if (stat === "strength") return "flat damage on every attack";
  if (stat === "block") return "bigger Guard block";
  return "crit chance, Guard, Sweep";
}

// value-per-power conversions keep integer items comparable to their cost.
// Lazy (not a module-level table): core.ts imports this module before its own
// constants exist, so touching STATS during module evaluation would crash.
function statConversion(stat: StatKey): number {
  if (stat === "hp") return STATS.hpPerPower;
  if (stat === "strength") return STATS.strengthPerPower;
  if (stat === "dexterity") return STATS.dexterityPerPower;
  return STATS.blockPerPower;
}

// ----------------------------------------------------------------------------
// Special effects: pools per slot, magnitudes per rarity tier. Assets guide
// identity (catalog family -> slot -> flavor); rarity guides strength.
// ----------------------------------------------------------------------------

const STAT_BY_SLOT: Record<Exclude<TrinketSlotKind, "focus">, StatKey> = {
  amulet: "hp",
  charm: "strength",
  relic: "dexterity",
  shield: "block",
};

// minTier gates signature effects to high rarity; values[] indexed by
// tier 3..6 then unique (tiers 1-2 on trinkets carry no effect).
const EFFECT_TABLE: Record<EffectKey, { minTier: number; values: [number, number, number, number, number] }> = {
  thorns: { minTier: 3, values: [1, 2, 3, 4, 5] },
  battle_start_block: { minTier: 3, values: [2, 3, 4, 6, 8] },
  battle_start_bolt: { minTier: 3, values: [1, 2, 3, 5, 7] },
  stamina_on_kill: { minTier: 5, values: [1, 1, 1, 1, 1] },
  heal_on_kill: { minTier: 4, values: [1, 1, 1, 2, 3] },
  heal_on_clear: { minTier: 3, values: [1, 1, 2, 2, 3] },
  deny_bonus: { minTier: 3, values: [1, 2, 3, 4, 6] },
  counter_bonus: { minTier: 3, values: [2, 3, 4, 6, 8] },
  guard_pierce_block: { minTier: 6, values: [1, 1, 1, 1, 1] },
  guard_heavy_block: { minTier: 4, values: [1, 1, 1, 1, 1] },
  max_stamina: { minTier: 6, values: [1, 1, 1, 1, 1] },
  potion_boost: { minTier: 3, values: [2, 3, 4, 6, 8] },
  crit_chance: { minTier: 3, values: [0.04, 0.06, 0.08, 0.12, 0.16] },
  crit_splash: { minTier: 3, values: [1, 2, 3, 4, 6] },
};

const EFFECT_POOL_BY_SLOT: Record<TrinketSlotKind, EffectKey[]> = {
  amulet: ["heal_on_clear", "potion_boost", "heal_on_kill", "thorns"],
  charm: ["deny_bonus", "heal_on_kill", "crit_splash", "battle_start_bolt"],
  relic: ["crit_chance", "stamina_on_kill", "deny_bonus", "crit_splash"],
  shield: ["thorns", "battle_start_block", "counter_bonus", "guard_heavy_block", "guard_pierce_block"],
  focus: ["battle_start_bolt", "crit_splash", "battle_start_block", "potion_boost", "counter_bonus", "stamina_on_kill", "max_stamina"],
};

function effectTier(power: number, isUnique: boolean): number {
  return isUnique ? 7 : tierOf(power);
}

function effectMagnitude(key: EffectKey, tier: number): number {
  const values = EFFECT_TABLE[key].values;
  if (tier >= 7) return values[4];
  return values[Math.max(0, Math.min(3, tier - 3))];
}

function effectCountForTier(tier: number, isFocus: boolean): number {
  if (tier >= 6) return 2;
  if (tier === 5) return Math.random() < 0.6 ? 2 : 1;
  if (tier >= 3) return 1;
  return isFocus ? 1 : 0;
}

function rollEffects(slot: TrinketSlotKind, power: number, isUnique: boolean): ItemEffect[] {
  const tier = effectTier(power, isUnique);
  const count = effectCountForTier(tier, slot === "focus");
  if (count <= 0) return [];
  // focus items always carry at least tier-3 magnitudes even at low power
  const usableTier = slot === "focus" ? Math.max(3, tier) : tier;
  const pool = EFFECT_POOL_BY_SLOT[slot].filter((key) => usableTier >= EFFECT_TABLE[key].minTier);
  const picked: ItemEffect[] = [];
  const available = [...pool];
  while (picked.length < count && available.length) {
    const index = Math.floor(Math.random() * available.length);
    const key = available.splice(index, 1)[0];
    picked.push({ key, value: effectMagnitude(key, usableTier) });
  }
  return picked;
}

function effectDesc(effects: ItemEffect[]): string {
  return effects
    .map((entry) => {
      if (entry.key === "crit_chance") return `${EFFECT_LABELS[entry.key]} +${Math.round(entry.value * 100)}%`;
      if (entry.key === "guard_pierce_block" || entry.key === "guard_heavy_block") return EFFECT_LABELS[entry.key];
      return `${EFFECT_LABELS[entry.key]} ${humanGain(entry.value)}`;
    })
    .join(" · ");
}

// Pick a catalog asset for this slot whose ladder position matches the rarity.
function templateForSlot(slot: TrinketSlotKind, power: number, isUnique: boolean): ItemTemplate {
  const pool = ITEM_TEMPLATES.filter((template) => template.slot === slot);
  const tier = effectTier(power, isUnique);
  const ladder = Math.min(1, Math.max(0, (tier - 1) / 6));
  const jitter = Math.floor(Math.random() * 3) - 1;
  const index = Math.max(0, Math.min(pool.length - 1, Math.round(ladder * (pool.length - 1)) + jitter));
  return pool[index];
}

function makeStatItem(stat: StatKey, power: number, isUnique = false): Item {
  const slot = (Object.entries(STAT_BY_SLOT) as [Exclude<TrinketSlotKind, "focus">, StatKey][]).find(([, s]) => s === stat)![0];
  const template = templateForSlot(slot, power, isUnique);
  const value = Math.max(1, Math.round(statConversion(stat) * power * (0.86 + Math.random() * 0.28)));
  const itemRarity = rarityOf(power, isUnique);
  const effects = rollEffects(slot, power, isUnique);
  const effectText = effects.length ? ` · ${effectDesc(effects)}` : "";
  return {
    kind: "stat",
    slot,
    stat,
    value,
    power,
    isUnique,
    rarity: itemRarity,
    sprite: template.sprite,
    effects: effects.length ? effects : undefined,
    name: template.name,
    desc: `${SLOT_LABELS[slot]} · ${humanGain(value)} ${stat === "block" ? "BLOCK" : stat.toUpperCase()} · ${itemRarity}${effectText} · ${statLootNote(stat)}`,
  };
}

// Focus trinkets (orbs, books, runes, scrolls...) are pure special-effect
// items — the closest thing to equipping a spell.
function makeFocusItem(power: number, isUnique = false): Item {
  const template = templateForSlot("focus", power, isUnique);
  const itemRarity = rarityOf(power, isUnique);
  const effects = rollEffects("focus", power, isUnique);
  return {
    kind: "focus",
    slot: "focus",
    power,
    isUnique,
    rarity: itemRarity,
    sprite: template.sprite,
    effects,
    name: template.name,
    desc: `${SLOT_LABELS.focus} · passive, fires automatically · ${itemRarity} · ${effectDesc(effects)}`,
  };
}

function healthBottle(power: number, isUnique = false): { name: string; tier: number; value: number } {
  if (isUnique) return { name: "Crimson Elixir", tier: 6, value: 30 };
  if (power >= LOOT.epicCost) return { name: "Crimson Elixir", tier: 5, value: 24 };
  if (power >= LOOT.uncommonCost) return { name: "Crimson Potion", tier: 3, value: 12 };
  return { name: "Crimson Vial", tier: 1, value: 5 };
}

function makePotionItem(power: number, isUnique = false): Item {
  const bottle = healthBottle(power, isUnique);
  const itemRarity = rarityOf(power, isUnique);
  return {
    kind: "consumable",
    slot: "consumable",
    effect: "restore_hp",
    value: bottle.value,
    tier: bottle.tier,
    power,
    isUnique,
    rarity: itemRarity,
    name: bottle.name,
    desc: `Restore ${humanHp(bottle.value)} HP now · ${itemRarity}`,
  };
}

function defaultWeapon(name: string): Weapon {
  return { ...BASE_WEAPON, name };
}

function weaponLootNotes(item: Item): string {
  const notes: string[] = [];
  const w = item.weapon || BASE_WEAPON;
  if (item.style === "axe" || (w.heavyBonus || 0) > 0) notes.push("Heavy payoff");
  if ((w.staggerChance || 0) > 0 || (w.bashBonus || 0) > 0) notes.push("denial");
  if ((w.critChance || 0) > 0.01 || (w.critMultiplierBonus || 0) > 0.01) notes.push("crit");
  if ((w.blockBonus || 0) > 0) notes.push("Guard block");
  if ((w.onHitBonusDamage || 0) > 0) notes.push("on-hit damage");
  if ((w.bossBonusDamage || 0) > 0 || (w.executeBonusDamage || 0) > 0 || (w.firstStrikeBonusDamage || 0) > 0) notes.push("situational burst");
  if (!notes.length) notes.push("steady upgrade");
  return notes.slice(0, 2).join(" · ");
}

function mappedWeaponTemplatesForStyle(style: WeaponStyle): WeaponTemplate[] {
  return WEAPON_TEMPLATES.filter((template) => template.style === style);
}

function mappedWeaponTemplateWeight(template: WeaponTemplate, focus: StatKey | null): number {
  const effects = new Set(template.effects.map((entry) => entry.effect));
  let weight = 1;
  if (focus === "strength" && (["strength", "weapon_damage", "stagger"] as MappedWeaponEffect[]).some((e) => effects.has(e))) weight += 0.45;
  if (focus === "dexterity" && (["dexterity", "hit_chance", "crit_chance", "double_strike"] as MappedWeaponEffect[]).some((e) => effects.has(e))) weight += 0.45;
  return weight;
}

function flat(spent: number, scale: number): number {
  return Math.max(1, Math.round(spent * scale));
}

// Mutates the weapon + statBonus for one rolled template effect, returning the
// magnitude applied (used to summarise the weapon's description).
function applyMappedWeaponEffect(weapon: Weapon, statBonus: StatBonus, effect: MappedWeaponEffect, spent: number): number {
  let value = 0;
  if (effect === "weapon_damage") {
    value = flat(spent, 0.22);
    weapon.damage += value;
  } else if (effect === "strength") {
    value = flat(spent, 0.18);
    statBonus.strength += value;
    weapon.heavyBonus += flat(spent, 0.12);
  } else if (effect === "dexterity") {
    value = flat(spent, 0.18);
    statBonus.dexterity += value;
  } else if (effect === "max_hp") {
    value = flat(spent, 0.5);
    statBonus.hp += value;
  } else if (effect === "hit_chance") {
    // accuracy no longer exists; steadier strikes read as bonus strike damage
    value = flat(spent, 0.14);
    weapon.strikeBonus += value;
  } else if (effect === "crit_chance") {
    value = 0.01 * spent;
    weapon.critChance += value;
  } else if (effect === "crit_damage") {
    value = 0.02 * spent;
    weapon.critMultiplierBonus += value;
  } else if (effect === "damage_roll_quality") {
    value = flat(spent, 0.12);
    weapon.strikeBonus += value;
  } else if (effect === "double_strike") {
    value = 0.008 * spent;
    weapon.critChance += value;
  } else if (effect === "stagger") {
    value = 0.015 * spent;
    weapon.staggerChance += value;
  } else if (effect === "on_hit_burn") {
    value = flat(spent, 0.14);
    weapon.onHitBonusDamage += value;
  } else if (effect === "on_hit_poison") {
    value = flat(spent, 0.12);
    weapon.onHitBonusDamage += value;
  } else if (effect === "on_hit_shock") {
    value = flat(spent, 0.16);
    weapon.onHitBonusDamage += value;
  } else if (effect === "on_hit_freeze") {
    value = 0.012 * spent;
    weapon.staggerChance += value;
  } else if (effect === "boss_damage") {
    value = flat(spent, 0.25);
    weapon.bossBonusDamage += value;
  } else if (effect === "execute_damage") {
    value = flat(spent, 0.3);
    weapon.executeBonusDamage += value;
  } else if (effect === "first_strike") {
    value = flat(spent, 0.35);
    weapon.firstStrikeBonusDamage += value;
  }
  return value;
}

function makeWeaponItem(power: number, focus: StatKey | null, isUnique: boolean, usedKeys: Set<string>): Item {
  const style = chooseWeaponStyle(focus, usedKeys);
  const styleTemplates = mappedWeaponTemplatesForStyle(style);
  const template = weightedChoice(
    (styleTemplates.length ? styleTemplates : WEAPON_TEMPLATES).map((entry) => ({ value: entry, weight: mappedWeaponTemplateWeight(entry, focus) }))
  );
  const itemRarity = rarityOf(power, isUnique);
  const rawPower = Math.max(0.75, power);
  const weapon = defaultWeapon(template.name);
  const statBonus: StatBonus = { hp: 0, strength: 0, dexterity: 0, block: 0 };

  // shared damage growth: +1 base damage per ~3 power, capped
  weapon.damage = BASE_WEAPON.damage + Math.min(8, Math.round(rawPower * 0.35));

  if (style === "sword") {
    weapon.strikeBonus += Math.round(rawPower * 0.12);
    weapon.critChance += 0.004 * rawPower;
    weapon.blockBonus += Math.round(rawPower * 0.1);
  } else if (style === "axe") {
    weapon.heavyBonus += Math.max(1, Math.round(rawPower * 0.5));
    weapon.staggerChance += 0.006 * rawPower;
    weapon.damage -= Math.min(2, Math.round(rawPower * 0.08));
  } else {
    weapon.critChance += 0.012 * rawPower;
    weapon.critMultiplierBonus += 0.015 * rawPower;
    weapon.sweepBonus += Math.round(rawPower * 0.14);
    weapon.bashBonus += Math.round(rawPower * 0.1);
    weapon.damage -= Math.min(1, Math.round(rawPower * 0.05));
  }

  const mappedEffects: { effect: MappedWeaponEffect; value: number }[] = [];
  template.effects.forEach((entry) => {
    const value = applyMappedWeaponEffect(weapon, statBonus, entry.effect, rawPower * entry.weight);
    if (value > 0) mappedEffects.push({ effect: entry.effect, value });
  });
  weapon.damage = Math.max(2, weapon.damage);
  weapon.critChance = Math.min(0.35, weapon.critChance);
  weapon.staggerChance = Math.min(0.35, weapon.staggerChance);

  const item: Item = {
    kind: "weapon",
    slot: "weapon",
    power,
    isUnique,
    rarity: itemRarity,
    style,
    weapon,
    statBonus,
    sprite: template.sprite, // the catalog asset, not a generic style icon
    name: "",
    desc: "",
  };
  item.name = isUnique ? template.name : `${template.name} +${tierOf(power)}`;
  const effectDesc = mappedEffects
    .slice(0, 2)
    .map((entry) => entry.effect.replace(/_/g, " "))
    .join(", ");
  item.desc = `${weapon.damage} damage · ${itemRarity}${effectDesc ? ` · ${effectDesc}` : ""} · ${weaponLootNotes(item)}`;
  return item;
}

function choiceIdentity(item: Item): string {
  if (item.kind === "stat") return `stat:${item.stat}`;
  if (item.kind === "consumable") return `instant:${item.effect}`;
  if (item.kind === "weapon") return `weapon:${item.style}`;
  if (item.kind === "focus") return "focus";
  return `${item.kind}:${item.name}`;
}

export function generateLootDraft(s: GameState, room: Room): Item[] {
  const spend = spendLuck(s, room);
  const focus = draftFocus(room);
  const draft: Item[] = [];
  const usedKeys = new Set<string>();
  let guard = 0;
  while (draft.length < 3 && guard++ < 24) {
    const availableKinds = availableLootKinds(usedKeys);
    if (!availableKinds.length) break;
    const rolled = rollOptionPower(spend, room.level);
    const kind = weightedChoice(availableKinds);
    let item: Item | null = null;
    if (kind === "weapon") item = makeWeaponItem(rolled.power, focus, rolled.isUnique, usedKeys);
    else if (kind === "consumable") item = makePotionItem(rolled.power, rolled.isUnique);
    else if (kind === "focus") item = makeFocusItem(rolled.power, rolled.isUnique);
    else {
      const stat = chooseStatTarget(focus, usedKeys);
      item = stat ? makeStatItem(stat, rolled.power, rolled.isUnique) : null;
    }
    if (!item) continue;
    draft.push(item);
    usedKeys.add(choiceIdentity(item));
  }
  return draft;
}

// ----------------------------------------------------------------------------
// Slots + scoring (used by equip in core.ts and the "recommended" badge in UI)
// ----------------------------------------------------------------------------

export function slotForItem(item: Item | null | undefined): ItemSlot | null {
  if (!item) return null;
  if (item.slot) return item.slot;
  if (item.kind === "weapon") return "weapon";
  if (item.kind === "consumable") return "consumable";
  if (item.kind === "focus") return "focus";
  if (item.kind === "stat") {
    if (item.stat === "hp") return "amulet";
    if (item.stat === "dexterity") return "relic";
    if (item.stat === "block") return "shield";
    return "charm";
  }
  return null;
}

export function activeItemForSlot(p: Player, slot: ItemSlot | null): Item | null {
  if (!slot) return null;
  return p.items.find((item) => slotForItem(item) === slot) || null;
}

export function itemStorageScore(item: Item): number {
  const rarityBonus =
    ({ common: 0, uncommon: 0.1, rare: 0.25, "very rare": 0.4, epic: 0.6, legendary: 0.9, unique: 1.15 } as Record<ItemRarity, number>)[
      item.rarity || "common"
    ] || 0;
  return (item.power || 0) + rarityBonus;
}

// Worth of one point of each stat, in comparable "damage-ish" units.
const STAT_POINT_WORTH: Record<StatKey, number> = {
  hp: 0.22,
  strength: 1.0,
  dexterity: 0.75,
  block: 0.6,
};

// Rough run-long worth of one point of each special effect for the auto policy.
const EFFECT_POINT_WORTH: Record<EffectKey, number> = {
  thorns: 1.2,
  battle_start_block: 0.8,
  battle_start_bolt: 1.5,
  stamina_on_kill: 4,
  heal_on_kill: 2,
  heal_on_clear: 2.2,
  deny_bonus: 0.8,
  counter_bonus: 0.5,
  guard_pierce_block: 3.5,
  guard_heavy_block: 4,
  max_stamina: 8,
  potion_boost: 0.5,
  crit_chance: 20,
  crit_splash: 1.2,
};

function effectsPolicyScore(effects: ItemEffect[] | undefined): number {
  if (!effects?.length) return 0;
  return effects.reduce((sum, entry) => sum + entry.value * EFFECT_POINT_WORTH[entry.key], 0);
}

function itemPolicyScore(item: Item | null): number {
  if (!item) return 0;
  if (item.kind === "focus") return effectsPolicyScore(item.effects);
  if (item.kind === "stat" && item.value != null && item.stat) {
    return item.value * STAT_POINT_WORTH[item.stat] + effectsPolicyScore(item.effects);
  }
  if (item.kind === "weapon" && item.weapon) {
    const w = item.weapon;
    return (
      (w.damage - BASE_WEAPON.damage) * 1.6 +
      (w.strikeBonus || 0) * 1.0 +
      (w.heavyBonus || 0) * 0.5 +
      (w.sweepBonus || 0) * 0.5 +
      (w.bashBonus || 0) * 0.35 +
      (w.critChance || 0) * 14 +
      (w.critMultiplierBonus || 0) * 4 +
      (w.blockBonus || 0) * 0.6 +
      (w.staggerChance || 0) * 9 +
      (w.onHitBonusDamage || 0) * 1.4 +
      (w.bossBonusDamage || 0) * 0.45 +
      (w.executeBonusDamage || 0) * 0.5 +
      (w.firstStrikeBonusDamage || 0) * 0.3 +
      (item.statBonus?.hp || 0) * STAT_POINT_WORTH.hp +
      (item.statBonus?.strength || 0) * STAT_POINT_WORTH.strength +
      (item.statBonus?.dexterity || 0) * STAT_POINT_WORTH.dexterity +
      (item.statBonus?.block || 0) * STAT_POINT_WORTH.block
    );
  }
  return 0;
}

export function lootChoiceScore(s: GameState, item: Item | null): number {
  if (!item) return 0;
  if (item.kind === "consumable") {
    const missing = Math.max(0, s.player.maxHp - s.player.hp);
    const effective = Math.min(missing, item.value || 0);
    const urgency = 1 + Math.min(1, missing / Math.max(1, s.player.maxHp)) * 0.65;
    return effective * STAT_POINT_WORTH.hp * urgency;
  }
  const rawScore = itemPolicyScore(item);
  const replaced = activeItemForSlot(s.player, slotForItem(item));
  return rawScore - itemPolicyScore(replaced);
}

/**
 * Index of the strongest offered upgrade, or -1 if skipping (which now grants
 * training) beats every option. The skip bar converts the floor's training
 * budget into rough policy points (~0.45 per budget point).
 */
export function recommendedLootIndex(s: GameState): number {
  const level = s.dungeon[s.roomIndex]?.level ?? 1;
  const skipWorth = LOOT.skipTrainingBudgetBase * Math.pow(LOOT.skipTrainingBudgetGrowth, Math.max(0, level - 1)) * 0.45;
  let best = -1;
  let bestScore: number = Math.max(LOOT.minimumUpgradeScore, skipWorth);
  s.draft.forEach((item, i) => {
    const score = lootChoiceScore(s, item);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
