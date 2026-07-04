// Parity tests for the native mapper API (run with `node --test tools/`).
// These mirror the behaviour the retired live_mapper_server.py guaranteed, so
// on-disk catalogs stay identical after the migration to a Vite plugin.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  ASSET_ALIASES,
  creatureFxCatalogFromPayload,
  dungeonPlanFromPayload,
  itemCatalogFromPayload,
  roomCatalogFromPayload,
  tacticalVisualsFromPayload,
} from "./mapperApi.mjs";
import { weaponTemplatesFileContents, WEAPON_TEMPLATES_OUT } from "./build_weapon_templates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf-8"));

const CREATURE_CATALOG = readJson("data/oryx_creature_fx_catalog.json");
const ITEM_CATALOG = readJson("data/oryx_item_catalog.json");
const ROOM_CATALOG = readJson("data/dungeon_room_catalog.json");

test("creature payload preserves mapper metadata", () => {
  const base = structuredClone(CREATURE_CATALOG.entries[0]);
  delete base.effect_recipe;
  const payload = {
    version: CREATURE_CATALOG.version,
    source: CREATURE_CATALOG.source,
    tile_sizes: CREATURE_CATALOG.tile_sizes,
    sheets: CREATURE_CATALOG.sheets,
    detection: CREATURE_CATALOG.detection,
    exported_at: "test",
    updated_at: "test",
    entries: [
      {
        ...base,
        status: "live",
        effects: [{ effect: "strike", weight: 1 }],
        enemy_spells: ["heal", "shield"],
        seed: { ignored: "for disk" },
      },
    ],
  };

  const catalog = creatureFxCatalogFromPayload(payload, CREATURE_CATALOG);
  const entry = catalog.entries[0];

  assert.ok(!("seed" in entry));
  assert.ok(!("status" in entry));
  assert.equal(entry.runtime_status, "live");
  assert.deepEqual(entry.effect_recipe, [{ effect: "strike", weight: 1 }]);
  assert.deepEqual(entry.enemy_spells, ["heal", "shield"]);
  assert.ok("combat_profile" in entry);
});

test("item payload saves active items only", () => {
  const item = structuredClone(ITEM_CATALOG.items[0]);
  const payload = {
    version: ITEM_CATALOG.version,
    source_image: ITEM_CATALOG.source_image,
    tile_size: ITEM_CATALOG.tile_size,
    grid: ITEM_CATALOG.grid,
    effect_primitives: ITEM_CATALOG.effect_primitives,
    exported_at: "test",
    updated_at: "test",
    entries: [
      {
        id: item.id,
        name: "Edited",
        sprite: item.sprite,
        visual: item.visual,
        slot: "weapon",
        status: "live",
        effects: [{ effect: "weapon_damage", weight: 1 }],
        ignored: false,
        seed: { ignored: "for disk" },
      },
      {
        id: "blank",
        slot: "unmapped",
        ignored: true,
        sprite: { tile_row: 99, tile_col: 99 },
      },
    ],
  };

  const catalog = itemCatalogFromPayload(payload, ITEM_CATALOG);

  assert.equal(catalog.items.length, 1);
  assert.equal(catalog.items[0].name, "Edited");
  assert.equal(catalog.items[0].runtime_status, "live");
  assert.deepEqual(catalog.items[0].power_recipe, [{ effect: "weapon_damage", weight: 1 }]);
});

test("room payload saves clean room maps", () => {
  const payload = {
    version: ROOM_CATALOG.version,
    tile_size: 24,
    rooms: [
      {
        id: "test-room",
        name: "Test Room",
        preset: "wide",
        width: 4,
        height: 3,
        dungeon_levels: [2, 2, 9],
        room_kind: "entrance",
        tags: ["loot", "loot", ""],
        tiles: [
          { x: 0, y: 0, flip_x: true, tile: { sheet: "ignored", col: 42, row: 25 } },
          { x: 0, y: 0, layer: "wall", tile: { sheet: "ignored", col: 43, row: 25 } },
          { x: 0, y: 0, layer: "decor", tile: { sheet: "ignored", col: 44, row: 25 } },
          { x: 99, y: 99, tile: { sheet: "ignored", col: 1, row: 1 } },
        ],
        obstacles: [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 1 }],
        doors: [{ x: 2, y: 0 }],
        spawn: { x: 3, y: 2 },
        updated_at: "test",
      },
    ],
    curation: { latest_live_update_seen: "test" },
  };

  const catalog = roomCatalogFromPayload(payload, ROOM_CATALOG);
  const room = catalog.rooms[0];

  assert.deepEqual(room.dungeon_levels, [2]);
  assert.equal(room.width, 5);
  assert.equal(room.room_kind, "entrance");
  assert.deepEqual(room.tags, ["loot"]);
  assert.deepEqual(room.tiles, [
    { x: 0, y: 0, layer: "floor", flip_x: true, tile: { sheet: "oryx_world2", col: 42, row: 25 } },
    { x: 0, y: 0, layer: "wall", tile: { sheet: "oryx_world2", col: 43, row: 25 } },
    { x: 0, y: 0, layer: "decor", tile: { sheet: "oryx_world2", col: 44, row: 25 } },
  ]);
  assert.deepEqual(room.obstacles, [{ x: 1, y: 1 }]);
  assert.deepEqual(room.doors, [{ x: 2, y: 0 }]);
  assert.deepEqual(room.spawn, { x: 3, y: 2 });
  assert.equal(catalog.source_image, "/room-assets/oryx_16bit_fantasy_world_trans.png");
  assert.equal(catalog.tile_size, 24);
});

test("tactical visual payload strips hero units", () => {
  const heroId = CREATURE_CATALOG.entries.find(
    (entry) => entry.sheet === "creatures" && entry.category === "hero",
  ).id;
  const enemyId = CREATURE_CATALOG.entries.find(
    (entry) => entry.sheet === "creatures" && entry.category !== "hero",
  ).id;

  const visuals = tacticalVisualsFromPayload(
    {
      pools: { raider: [heroId, enemyId, enemyId], mage: [heroId] },
      bosses: { 1: heroId, 2: enemyId },
      protected_ids: [heroId],
    },
    ROOT,
  );

  assert.deepEqual(visuals.pools.raider, [enemyId]);
  assert.deepEqual(visuals.pools.mage, []);
  assert.ok(!("1" in visuals.bosses));
  assert.equal(visuals.bosses["2"], enemyId);
});

test("sprite sheets are aliased for http pages", () => {
  for (const route of [
    "/assets/oryx_items.png",
    "/assets/oryx_creatures.png",
    "/assets/oryx_fx.png",
    "/assets/oryx_world2.png",
  ]) {
    assert.ok(route in ASSET_ALIASES, route);
  }
});

test("dungeon plan payload normalizes floors and strips heroes", () => {
  const heroId = CREATURE_CATALOG.entries.find(
    (entry) => entry.sheet === "creatures" && entry.category === "hero",
  ).id;
  const enemyId = CREATURE_CATALOG.entries.find(
    (entry) => entry.sheet === "creatures" && entry.category !== "hero",
  ).id;

  const plan = dungeonPlanFromPayload(
    {
      version: "0.1.0",
      updated_at: "test",
      exported_at: "test",
      levels: {
        1: {
          custom: true,
          enemies: [
            { id: enemyId, profile: "dexterity", boss: false },
            { id: enemyId, profile: "dexterity", boss: false }, // duplicate dropped
            { id: heroId, profile: "balanced", boss: false }, // hero dropped
            { id: "  ", profile: "balanced", boss: false }, // blank dropped
            { id: `${enemyId}_b`, profile: "not-a-profile", boss: true },
          ],
          boss: heroId, // hero boss dropped
          bossName: " Dune Tyrant ",
          biome: "volcanic",
          notes: " swap in scorpions ",
        },
        2: { enemies: [], custom: false }, // empty override dropped entirely
        7: { enemies: [{ id: enemyId, profile: "balanced", boss: false }] }, // bad level dropped
      },
    },
    {},
    ROOT,
  );

  assert.deepEqual(Object.keys(plan.levels), ["1"]);
  const floor = plan.levels["1"];
  assert.equal(floor.custom, true);
  assert.deepEqual(floor.enemies, [
    { id: enemyId, profile: "dexterity", boss: false },
    { id: `${enemyId}_b`, profile: "balanced", boss: true },
  ]);
  assert.ok(!("boss" in floor));
  assert.equal(floor.bossName, "Dune Tyrant");
  assert.equal(floor.biome, "volcanic");
  assert.equal(floor.notes, "swap in scorpions");
  assert.equal(floor.updated_at, "test");
  assert.equal(plan.curation.latest_live_save_source, "dungeon_workspace");
});

test("weapon templates rebake matches the checked-in generator output", () => {
  const { contents, count } = weaponTemplatesFileContents(ITEM_CATALOG);
  const baked = readFileSync(path.join(ROOT, WEAPON_TEMPLATES_OUT), "utf-8");
  assert.equal(contents, baked);
  assert.ok(count > 0);
});
