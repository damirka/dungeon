/**
 * Guards engine/playtest parity for loot weapons: the baked
 * src/features/playtest/engine/weaponTemplates.ts must exactly match what
 * tools/build_weapon_templates.mjs derives from data/oryx_item_catalog.json
 * (the same catalog the playtest reads). If the catalog changes, regenerate via
 * `node tools/build_weapon_templates.mjs` and commit the result.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildWeaponTemplates } from "./build_weapon_templates.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function readBakedTemplates() {
  const src = readFileSync(resolve(root, "src/features/playtest/engine/weaponTemplates.ts"), "utf8");
  const match = src.match(/export const WEAPON_TEMPLATES: WeaponTemplate\[\] = (\[[\s\S]*\]);/);
  assert.ok(match, "could not find WEAPON_TEMPLATES payload in weaponTemplates.ts");
  return JSON.parse(match[1]);
}

test("baked weapon templates match the item catalog", () => {
  const catalog = JSON.parse(readFileSync(resolve(root, "data/oryx_item_catalog.json"), "utf8"));
  const expected = buildWeaponTemplates(catalog);
  const baked = readBakedTemplates();
  assert.deepEqual(baked, expected, "weaponTemplates.ts is stale — run `node tools/build_weapon_templates.mjs`");
});

test("every baked template is usable (style + at least one supported effect)", () => {
  const baked = readBakedTemplates();
  assert.ok(baked.length > 0, "expected at least one weapon template");
  for (const template of baked) {
    assert.ok(["sword", "axe", "rapier"].includes(template.style), `bad style: ${template.style}`);
    assert.ok(template.effects.length > 0, `template ${template.assetId} has no effects`);
    for (const entry of template.effects) {
      assert.ok(Number(entry.weight) > 0, `template ${template.assetId} effect ${entry.effect} has non-positive weight`);
    }
  }
});

test("all three weapon styles are represented", () => {
  const styles = new Set(readBakedTemplates().map((t) => t.style));
  for (const style of ["sword", "axe", "rapier"]) {
    assert.ok(styles.has(style), `no catalog weapons for style ${style}`);
  }
});
