/**
 * Bakes src/game/weaponTemplates.ts from data/oryx_item_catalog.json.
 *
 * This mirrors the playtest's MAPPED_WEAPON_TEMPLATES construction in
 * public/legacy/tactical_playtest.html so the playable game draws weapons from
 * exactly the same catalog-derived template set as the balance source of truth.
 *
 * Run: node tools/build_weapon_templates.mjs
 * The output is checked in and guarded by tools/weaponTemplates.test.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// Verbatim from tactical_playtest.html.
const WEAPON_FAMILY_STYLE = {
  axe: "axe",
  hammer: "axe",
  mace: "axe",
  stick: "axe",
  cane: "axe",
  sword: "sword",
  saber: "sword",
  dagger: "rapier",
  spear: "rapier",
  bow: "rapier",
  crossbow: "rapier",
  staff: "rapier",
  wand: "rapier",
  rod: "rapier",
};

const SUPPORTED_MAPPED_WEAPON_EFFECTS = new Set([
  "weapon_damage",
  "strength",
  "dexterity",
  "hit_chance",
  "crit_chance",
  "crit_damage",
  "damage_roll_quality",
  "double_strike",
  "stagger",
  "on_hit_burn",
  "on_hit_poison",
  "on_hit_freeze",
  "on_hit_shock",
  "boss_damage",
  "execute_damage",
  "first_strike",
  "max_hp",
]);

export function buildWeaponTemplates(catalog) {
  return (catalog.items || [])
    .filter((item) => item.slot === "weapon" && item.sprite)
    .map((item) => {
      const family = item.visual?.family || "weapon";
      const style = WEAPON_FAMILY_STYLE[family];
      const effects = (item.power_recipe || [])
        .filter((entry) => SUPPORTED_MAPPED_WEAPON_EFFECTS.has(entry.effect) && Number(entry.weight) > 0)
        .map((entry) => ({ effect: entry.effect, weight: Number(entry.weight) }));
      return {
        assetId: item.id,
        name: item.name || family,
        family,
        style,
        tags: item.tags || [],
        effects,
        sprite: { col: item.sprite.tile_col, row: item.sprite.tile_row },
      };
    })
    .filter((item) => item.style && item.effects.length);
}

/** The full generated-file contents for a catalog — shared with the mapper API
    so saving items from the workbench re-bakes the templates automatically. */
export function weaponTemplatesFileContents(catalog) {
  const templates = buildWeaponTemplates(catalog);
  const header = `/**
 * Auto-generated from data/oryx_item_catalog.json by
 * tools/build_weapon_templates.mjs. Do not edit by hand.
 *
 * Catalog-derived weapon templates for the canonical React tactical engine.
 */

export type MappedWeaponEffect =
  | "weapon_damage"
  | "strength"
  | "dexterity"
  | "hit_chance"
  | "crit_chance"
  | "crit_damage"
  | "damage_roll_quality"
  | "double_strike"
  | "stagger"
  | "on_hit_burn"
  | "on_hit_poison"
  | "on_hit_freeze"
  | "on_hit_shock"
  | "boss_damage"
  | "execute_damage"
  | "first_strike"
  | "max_hp";

export type WeaponStyle = "sword" | "axe" | "rapier";

export interface WeaponTemplate {
  assetId: string;
  name: string;
  family: string;
  style: WeaponStyle;
  tags: string[];
  effects: { effect: MappedWeaponEffect; weight: number }[];
  sprite: { col: number; row: number };
}

// The JSON payload below is consumed verbatim by tools/weaponTemplates.test.mjs.
export const WEAPON_TEMPLATES: WeaponTemplate[] = `;
  const body = JSON.stringify(templates, null, 2);
  return { contents: `${header}${body};\n`, count: templates.length };
}

export const WEAPON_TEMPLATES_OUT = "src/features/playtest/engine/weaponTemplates.ts";

function main() {
  const catalog = JSON.parse(readFileSync(resolve(root, "data/oryx_item_catalog.json"), "utf8"));
  const { contents, count } = weaponTemplatesFileContents(catalog);
  writeFileSync(resolve(root, WEAPON_TEMPLATES_OUT), contents, "utf8");
  console.log(`Wrote ${count} weapon templates to ${WEAPON_TEMPLATES_OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
