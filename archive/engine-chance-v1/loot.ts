/**
 * Loot draft generation + item factories + scoring for the canonical React
 * tactical engine. Pure functions over GameState; the equip / consume / advance
 * flow lives in core.ts (it needs startRoom + recalc).
 */

import {
  LOOT,
  STATS,
  humanGain,
  humanHp,
  type GameState,
  type Item,
  type ItemRarity,
  type ItemSlot,
  type Player,
  type Room,
  type StatKey,
  type WeaponStyle,
  type Weapon,
} from "./core";
import { WEAPON_TEMPLATES, type MappedWeaponEffect, type WeaponTemplate } from "./weaponTemplates";

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
  const share = room.isBoss ? LOOT.bossLuckShare : LOOT.normalLuckShare;
  const target = LOOT.baseLuckPool * Math.pow(LOOT.luckPoolGrowth, room.level - 1) * share;
  const varied = target * (1 - LOOT.luckVariance + Math.random() * LOOT.luckVariance * 2);
  const spend = Math.min(pool.remaining, Math.max(LOOT.commonCost, varied));
  pool.remaining = Math.max(0, pool.remaining - spend);
  return spend;
}

function rollOptionPower(spend: number): { power: number; isUnique: boolean } {
  let power = spend * (0.72 + Math.random() * 0.48);
  const roll = Math.random();
  if (roll < LOOT.uniqueOptionChance) {
    power *= LOOT.uniquePowerMultiplier;
    return { power: Math.max(0.75, power), isUnique: true };
  }
  if (roll < LOOT.uniqueOptionChance + LOOT.jackpotOptionChance) power *= LOOT.jackpotPowerMultiplier;
  else if (roll < LOOT.uniqueOptionChance + LOOT.jackpotOptionChance + LOOT.luckyOptionChance) power *= LOOT.luckyPowerMultiplier;
  return { power: Math.max(0.75, power), isUnique: false };
}

function draftFocus(room: Room): StatKey | null {
  const chance = LOOT.focusDraftChance + (room.level <= 2 ? LOOT.earlyFocusDraftBonus : 0);
  if (Math.random() > chance) return null;
  return Math.random() < 0.5 ? "strength" : "dexterity";
}

function availableStatTargets(usedKeys: Set<string>): StatKey[] {
  return (["hp", "strength", "dexterity"] as StatKey[]).filter((stat) => !usedKeys.has(`stat:${stat}`));
}

function availableWeaponStyles(usedKeys: Set<string>): WeaponStyle[] {
  return TEMPLATE_STYLES.filter((style) => !usedKeys.has(`weapon:${style}`));
}

function availableLootKinds(usedKeys: Set<string>): { value: "stat" | "weapon" | "consumable"; weight: number }[] {
  return [
    { value: "stat" as const, weight: availableStatTargets(usedKeys).length ? LOOT.statItemWeight : 0 },
    { value: "weapon" as const, weight: availableWeaponStyles(usedKeys).length ? LOOT.weaponItemWeight : 0 },
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
  consumable: "Now",
};

function statLootNote(stat: StatKey): string {
  if (stat === "hp") return "max HP buffer";
  if (stat === "strength") return "base damage and Heavy payoff";
  return "crit, dodge, Quick pressure";
}

function makeStatItem(stat: StatKey, power: number, isUnique = false): Item {
  const names: Record<StatKey, [string, number, ItemSlot]> = {
    hp: ["Vital Amulet", STATS.hpPerPower, "amulet"],
    strength: ["Force Ring", STATS.strengthPerPower, "charm"],
    dexterity: ["Grace Relic", STATS.dexterityPerPower, "relic"],
  };
  const uniqueNames: Record<StatKey, string> = { hp: "Heartseed Amulet", strength: "Titan's Knot", dexterity: "Silkstep Charm" };
  const [baseName, conversion, slot] = names[stat];
  const value = conversion * power * (0.86 + Math.random() * 0.28);
  const itemRarity = rarityOf(power, isUnique);
  return {
    kind: "stat",
    slot,
    stat,
    value,
    power,
    isUnique,
    rarity: itemRarity,
    name: isUnique ? uniqueNames[stat] : `${baseName} +${tierOf(power)}`,
    desc: `${SLOT_LABELS[slot]} · ${humanGain(value)} ${stat.toUpperCase()} · ${itemRarity} · ${statLootNote(stat)}`,
  };
}

function healthBottle(power: number, isUnique = false): { name: string; tier: number; value: number } {
  if (isUnique) return { name: "Crimson Elixir", tier: 6, value: Math.round(LOOT.legendaryCost * LOOT.potionHpPerPower) };
  if (power >= LOOT.epicCost) return { name: "Crimson Elixir", tier: 5, value: Math.round(LOOT.epicCost * LOOT.potionHpPerPower) };
  if (power >= LOOT.uncommonCost) return { name: "Crimson Potion", tier: 3, value: Math.round(LOOT.rareCost * LOOT.potionHpPerPower) };
  return { name: "Crimson Vial", tier: 1, value: Math.round(LOOT.commonCost * LOOT.potionHpPerPower) };
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

// A weapon with every (incl. optional) field initialised so mapped effects can
// accumulate onto concrete numbers, matching the playtest's weapon shell.
function defaultWeapon(name: string): Required<Weapon> {
  return {
    name,
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
    damageQualityModifier: 0,
    doubleStrikeChanceModifier: 0,
    staggerOnHitChance: 0,
    freezeOnHitChance: 0,
    onHitBonusDamage: 0,
    bossDamageMultiplier: 1,
    executeDamageMultiplier: 1,
    executeHpThreshold: 0.35,
    firstStrikeDamageMultiplier: 1,
  };
}

function weaponLootNotes(item: Item): string {
  const notes: string[] = [];
  const w = item.weapon || defaultWeapon("sword");
  if (item.style === "axe" || (w.heavyDamageMultiplier || 1) > 1.04 || (w.sunderOnHeavyHit || 0) > 0 || (w.stunOnHeavyHitChance || 0) > 0) notes.push("Heavy payoff");
  if (item.style === "rapier" || (w.quickDamageMultiplier || 1) > 1.04 || (w.doubleStrikeChanceModifier || 0) > 0) notes.push("Quick pressure");
  if ((w.hitModifier || 0) > 0.01 || (w.critModifier || 0) > 0.01 || (w.critMultiplierModifier || 0) > 0.01) notes.push("precision/crit");
  if ((w.staggerOnHitChance || 0) > 0 || (w.freezeOnHitChance || 0) > 0 || (w.onHitBonusDamage || 0) > 0) notes.push("on-hit control");
  if ((w.bossDamageMultiplier || 1) > 1.02 || (w.executeDamageMultiplier || 1) > 1.02 || (w.firstStrikeDamageMultiplier || 1) > 1.02) notes.push("situational burst");
  if (!notes.length) notes.push("steady upgrade");
  return notes.slice(0, 2).join(" · ");
}

type StatBonus = { hp: number; strength: number; dexterity: number };

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

// Mutates the weapon + statBonus for one rolled template effect, returning the
// magnitude applied (used to summarise the weapon's description).
function applyMappedWeaponEffect(weapon: Required<Weapon>, statBonus: StatBonus, effect: MappedWeaponEffect, spent: number): number {
  let value = 0;
  if (effect === "weapon_damage") {
    value = 0.02 * spent;
    weapon.damageMultiplier += value;
  } else if (effect === "strength") {
    value = 0.2 * spent;
    statBonus.strength += value;
    weapon.damageMultiplier += 0.006 * spent;
    weapon.heavyDamageMultiplier += 0.006 * spent;
  } else if (effect === "dexterity") {
    value = 0.2 * spent;
    statBonus.dexterity += value;
    weapon.hitModifier += 0.0025 * spent;
    weapon.quickDamageMultiplier += 0.006 * spent;
  } else if (effect === "max_hp") {
    value = 0.48 * spent;
    statBonus.hp += value;
  } else if (effect === "hit_chance") {
    value = 0.008 * spent;
    weapon.hitModifier += value;
  } else if (effect === "crit_chance") {
    value = 0.008 * spent;
    weapon.critModifier += value;
  } else if (effect === "crit_damage") {
    value = 0.012 * spent;
    weapon.critMultiplierModifier += value;
  } else if (effect === "damage_roll_quality") {
    value = 0.012 * spent;
    weapon.damageQualityModifier += value;
  } else if (effect === "double_strike") {
    value = 0.018 * spent;
    weapon.doubleStrikeChanceModifier += value;
  } else if (effect === "stagger") {
    value = 0.018 * spent;
    weapon.staggerOnHitChance += value;
  } else if (effect === "on_hit_burn") {
    value = 0.014 * spent;
    weapon.onHitBonusDamage += value;
  } else if (effect === "on_hit_poison") {
    value = 0.012 * spent;
    weapon.onHitBonusDamage += value;
  } else if (effect === "on_hit_shock") {
    value = 0.018 * spent;
    weapon.onHitBonusDamage += value;
  } else if (effect === "on_hit_freeze") {
    value = 0.016 * spent;
    weapon.freezeOnHitChance += value;
  } else if (effect === "boss_damage") {
    value = 0.02 * spent;
    weapon.bossDamageMultiplier += value;
  } else if (effect === "execute_damage") {
    value = 0.025 * spent;
    weapon.executeDamageMultiplier += value;
  } else if (effect === "first_strike") {
    value = 0.03 * spent;
    weapon.firstStrikeDamageMultiplier += value;
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
  const statBonus: StatBonus = { hp: 0, strength: 0, dexterity: 0 };

  if (style === "sword") {
    weapon.damageMultiplier += 0.01 * rawPower;
    weapon.attackDamageMultiplier += 0.004 * rawPower;
    weapon.heavyDamageMultiplier += 0.004 * rawPower;
    weapon.quickDamageMultiplier += 0.003 * rawPower;
    weapon.critModifier += 0.003 * rawPower;
  } else if (style === "axe") {
    weapon.damageMultiplier += 0.01 * rawPower;
    weapon.heavyDamageMultiplier += 0.026 * rawPower;
    weapon.quickDamageMultiplier -= 0.01 * rawPower;
    weapon.sweepDamageMultiplier -= 0.006 * rawPower;
    weapon.hitModifier -= 0.004 * rawPower;
    weapon.dexterityMultiplier -= Math.min(0.16, 0.01 * rawPower);
  } else {
    weapon.damageMultiplier += 0.006 * rawPower;
    weapon.heavyDamageMultiplier -= 0.008 * rawPower;
    weapon.quickDamageMultiplier += 0.016 * rawPower;
    weapon.sweepDamageMultiplier += 0.012 * rawPower;
    weapon.hitModifier += 0.004 * rawPower;
    weapon.critModifier += 0.007 * rawPower;
    weapon.critMultiplierModifier += 0.008 * rawPower;
    weapon.dexterityMultiplier += Math.min(0.1, 0.006 * rawPower);
  }

  const mappedEffects: { effect: MappedWeaponEffect; value: number }[] = [];
  template.effects.forEach((entry) => {
    const value = applyMappedWeaponEffect(weapon, statBonus, entry.effect, rawPower * entry.weight);
    if (value > 0) mappedEffects.push({ effect: entry.effect, value });
  });
  weapon.heavyDamageMultiplier = Math.max(0.7, weapon.heavyDamageMultiplier);
  weapon.quickDamageMultiplier = Math.max(0.7, weapon.quickDamageMultiplier);
  weapon.sweepDamageMultiplier = Math.max(0.7, weapon.sweepDamageMultiplier);
  weapon.dexterityMultiplier = Math.max(0.7, weapon.dexterityMultiplier);
  weapon.staggerOnHitChance = Math.min(0.32, weapon.staggerOnHitChance);
  weapon.freezeOnHitChance = Math.min(0.32, weapon.freezeOnHitChance);

  const item: Item = { kind: "weapon", slot: "weapon", power, isUnique, rarity: itemRarity, style, weapon, statBonus, name: "", desc: "" };
  item.name = isUnique ? template.name : `${template.name} +${tierOf(power)}`;
  const effectDesc = mappedEffects
    .slice(0, 2)
    .map((entry) => entry.effect.replace(/_/g, " "))
    .join(", ");
  item.desc = `${humanGain((weapon.damageMultiplier - 1) * 100)}% damage · ${itemRarity}${effectDesc ? ` · ${effectDesc}` : ""} · ${weaponLootNotes(item)}`;
  return item;
}

function choiceIdentity(item: Item): string {
  if (item.kind === "stat") return `stat:${item.stat}`;
  if (item.kind === "consumable") return `instant:${item.effect}`;
  if (item.kind === "weapon") return `weapon:${item.style}`;
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
    const rolled = rollOptionPower(spend);
    const kind = weightedChoice(availableKinds);
    let item: Item | null = null;
    if (kind === "weapon") item = makeWeaponItem(rolled.power, focus, rolled.isUnique, usedKeys);
    else if (kind === "consumable") item = makePotionItem(rolled.power, rolled.isUnique);
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
  if (item.kind === "stat") {
    if (item.stat === "hp") return "amulet";
    if (item.stat === "dexterity") return "relic";
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

function itemPolicyScore(item: Item | null): number {
  if (!item) return 0;
  if (item.kind === "stat" && item.value != null) {
    if (item.stat === "hp") return (item.value / STATS.hpPerPower) * 0.45;
    if (item.stat === "strength") return (item.value / STATS.strengthPerPower) * 0.45;
    if (item.stat === "dexterity") return (item.value / STATS.dexterityPerPower) * 0.1;
  }
  if (item.kind === "weapon" && item.weapon) {
    const w = item.weapon;
    return (
      (w.damageMultiplier - 1) * 12 * 0.45 +
      (w.heavyDamageMultiplier - 1) * 8 * 0.45 +
      (w.quickDamageMultiplier - 1) * 5 * 0.1 +
      (w.sweepDamageMultiplier - 1) * 5 * 0.1 +
      w.hitModifier * 10 * 0.1 +
      w.critModifier * 8 * 0.1 +
      w.critMultiplierModifier * 5 * 0.1 +
      (w.dexterityMultiplier - 1) * 8 * 0.1 +
      (w.sunderOnHit || 0) * 0.35 * 0.45 +
      (w.sunderOnHeavyHit || 0) * 0.45 * 0.45 +
      (w.sunderBonusPerStack || 0) * 8 * 0.45 +
      (w.stunOnHeavyHitChance || 0) * 4 * 0.45 +
      (w.damageQualityModifier || 0) * 5 * 0.1 +
      (w.doubleStrikeChanceModifier || 0) * 6 * 0.1 +
      (w.staggerOnHitChance || 0) * 5 * 0.45 +
      (w.freezeOnHitChance || 0) * 5 * 0.1 +
      (w.onHitBonusDamage || 0) * 7 +
      ((w.bossDamageMultiplier || 1) - 1) * 5 +
      ((w.executeDamageMultiplier || 1) - 1) * 4 +
      ((w.firstStrikeDamageMultiplier || 1) - 1) * 4 +
      ((item.statBonus?.hp || 0) / STATS.hpPerPower) * 0.45 +
      ((item.statBonus?.strength || 0) / STATS.strengthPerPower) * 0.45 +
      ((item.statBonus?.dexterity || 0) / STATS.dexterityPerPower) * 0.1
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
    return (effective / STATS.hpPerPower) * 0.45 * urgency;
  }
  const rawScore = itemPolicyScore(item);
  const replaced = activeItemForSlot(s.player, slotForItem(item));
  return rawScore - itemPolicyScore(replaced);
}

/** Index of the strongest offered upgrade, or -1 if nothing clears the bar. */
export function recommendedLootIndex(s: GameState): number {
  let best = -1;
  let bestScore: number = LOOT.minimumUpgradeScore;
  s.draft.forEach((item, i) => {
    const score = lootChoiceScore(s, item);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
