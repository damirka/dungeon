// Native Vite replacement for the old tools/live_mapper_server.py backend.
//
// Exposes a connect middleware (used by both the Vite dev server and
// `vite preview`) that serves the mapper data/asset GETs and persists the
// mapper save POSTs straight to the working tree. The normalization logic is a
// faithful port of live_mapper_server.py so on-disk catalogs stay identical.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { weaponTemplatesFileContents, WEAPON_TEMPLATES_OUT } from "./build_weapon_templates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const ROOM_ASSETS = path.join(ROOT, "public", "room-assets");

// Legacy HTML mappers and the React RoomDesigner request sprite sheets under
// /assets/*. Every sheet is vendored in public/room-assets, so alias by name.
export const ASSET_ALIASES = {
  "/assets/oryx_items.png": "oryx_items.png",
  "/assets/oryx_fx.png": "oryx_fx.png",
  "/assets/oryx_creatures.png": "oryx_creatures.png",
  "/assets/oryx_world2.png": "oryx_world2.png",
  "/assets/oryx_16bit_fantasy_world_trans.png": "oryx_16bit_fantasy_world_trans.png",
};

// --- Python-parity helpers ---------------------------------------------------

const isObj = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value) => typeof value === "number" && Number.isInteger(value);

// Mirrors Python truthiness so `x or y` chains behave identically (empty
// list/dict/string are falsy, unlike default JS).
function pyTruthy(value) {
  if (value === null || value === undefined || value === false) return false;
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

// Equivalent of Python `a or b or c`: first truthy value, else the last one.
function pyOr(...values) {
  for (const value of values) {
    if (pyTruthy(value)) return value;
  }
  return values[values.length - 1];
}

// --- File writers ------------------------------------------------------------

function atomicWrite(filePath, text) {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, text, "utf-8");
  renameSync(tmp, filePath);
}

function writeJsonFile(filePath, payload) {
  atomicWrite(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeJsSeed(filePath, globalName, payload) {
  atomicWrite(filePath, `window.${globalName} = ${JSON.stringify(payload)};\n`);
}

function writeJsPayload(filePath, globalName, payload) {
  atomicWrite(filePath, `window.${globalName} = ${JSON.stringify(payload, null, 2)};\n`);
}

function readExistingJson(filePath) {
  if (!existsSync(filePath)) return {};
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

// --- Creature FX -------------------------------------------------------------

function normalizeStatus(entry) {
  const result = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key !== "seed" && key !== "effects" && key !== "status") result[key] = value;
  }
  if (!("effect_recipe" in result) && "effects" in entry) result.effect_recipe = entry.effects;
  if ("status" in entry) result.runtime_status = entry.status;
  else if ("runtime_status" in entry) result.runtime_status = entry.runtime_status;
  return result;
}

export function creatureFxCatalogFromPayload(payload, existing) {
  const entries = (payload.entries ?? []).map(normalizeStatus);
  return {
    version: pyOr(payload.version, existing.version, "0.2.0"),
    source: pyOr(payload.source, existing.source, "oryx_16-bit_fantasy_1.1"),
    tile_sizes: pyOr(payload.tile_sizes, existing.tile_sizes, {}),
    sheets: pyOr(payload.sheets, existing.sheets, {}),
    detection: pyOr(payload.detection, existing.detection, {}),
    entries,
    curation: {
      ...(existing.curation ?? {}),
      latest_live_save_at: payload.exported_at ?? null,
      latest_live_update_seen: payload.updated_at ?? null,
      latest_live_save_source: "live_mapper_server",
    },
  };
}

// --- Items -------------------------------------------------------------------

function activeItemEntry(entry) {
  if (pyTruthy(entry.ignored)) return false;
  if (pyTruthy(entry.slot) && entry.slot !== "unmapped") return true;
  return [
    "name",
    "meaning",
    "power_role",
    "rarity_band",
    "drop_sources",
    "effects",
    "power_recipe",
    "tags",
    "notes",
  ].some((key) => pyTruthy(entry[key]));
}

export function itemCatalogFromPayload(payload, existing) {
  const items = [];
  for (const entry of payload.entries ?? []) {
    if (!activeItemEntry(entry)) continue;
    if (!("id" in entry)) throw new Error("item entry missing required 'id'");
    items.push({
      id: entry.id,
      name: entry.name ?? "",
      sprite: entry.sprite ?? {},
      visual: pyOr(entry.visual, { family: entry.family ?? "unknown" }),
      slot: entry.slot ?? "unmapped",
      rarity_band: entry.rarity_band ?? [],
      drop_sources: entry.drop_sources ?? [],
      power_recipe: pyOr(entry.power_recipe, entry.effects ?? []),
      tradeoffs: entry.tradeoffs ?? [],
      tags: entry.tags ?? [],
      runtime_status: pyOr(entry.status, entry.runtime_status ?? "planned"),
      meaning: entry.meaning ?? "",
      power_role: entry.power_role ?? "unset",
      notes: entry.notes ?? "",
    });
  }

  items.sort((a, b) => {
    const aRow = a.sprite?.tile_row ?? 0;
    const bRow = b.sprite?.tile_row ?? 0;
    if (aRow !== bRow) return aRow - bRow;
    return (a.sprite?.tile_col ?? 0) - (b.sprite?.tile_col ?? 0);
  });

  return {
    version: pyOr(payload.version, existing.version, "0.2.0"),
    source_image: pyOr(payload.source_image, existing.source_image, ""),
    tile_size: pyOr(payload.tile_size, existing.tile_size, 16),
    grid: pyOr(payload.grid, existing.grid, {}),
    detection: existing.detection ?? {},
    design_notes: existing.design_notes ?? [],
    effect_primitives: pyOr(payload.effect_primitives, existing.effect_primitives, {}),
    items,
    curation: {
      ...(existing.curation ?? {}),
      latest_live_save_at: payload.exported_at ?? null,
      latest_live_update_seen: payload.updated_at ?? null,
      latest_live_save_source: "live_mapper_server",
    },
  };
}

// --- Rooms -------------------------------------------------------------------

const ROOM_KINDS = new Set(["entrance", "encounter", "treasury", "special", "passage"]);
const ROOM_TILE_LAYERS = ["floor", "wall", "decor"];
const ROOM_PRESETS = [
  { id: "small", label: "Small", width: 9, height: 8, intent: "Tight encounter or stash" },
  { id: "wide", label: "Wide", width: 15, height: 8, intent: "Horizontal combat read" },
  { id: "long", label: "Long", width: 9, height: 14, intent: "Vertical gauntlet" },
  { id: "large", label: "Large", width: 17, height: 12, intent: "Main encounter space" },
  { id: "boss", label: "Boss", width: 19, height: 14, intent: "Set-piece arena" },
  { id: "passage", label: "Passage", width: 17, height: 5, intent: "Connector or fork" },
];

function cleanRoomPoint(value, width, height) {
  if (!isObj(value)) return null;
  const { x, y } = value;
  if (!isInt(x) || !isInt(y)) return null;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y };
}

function oddRoomWidth(width) {
  return width % 2 === 0 ? width + 1 : width;
}

function cleanRoomPoints(values, width, height) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const points = [];
  for (const value of values) {
    const point = cleanRoomPoint(value, width, height);
    if (!point) continue;
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(point);
  }
  points.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  return points;
}

function cleanRoomTiles(values, width, height) {
  if (!Array.isArray(values)) return [];
  const layerOrder = { floor: 0, wall: 1, decor: 2 };
  const byCell = new Map();
  for (const value of values) {
    const point = cleanRoomPoint(value, width, height);
    const tile = isObj(value) ? value.tile : null;
    if (!point || !isObj(tile)) continue;
    const { col, row } = tile;
    if (!isInt(col) || !isInt(row) || col < 0 || row < 0) continue;
    const layer = isObj(value) && ROOM_TILE_LAYERS.includes(value.layer) ? value.layer : "floor";
    byCell.set(`${point.x},${point.y},${layer}`, {
      x: point.x,
      y: point.y,
      layer,
      ...(value.flip_x === true ? { flip_x: true } : {}),
      tile: { sheet: "oryx_world2", col, row },
    });
  }
  const tiles = [...byCell.values()];
  tiles.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return layerOrder[a.layer] - layerOrder[b.layer];
  });
  return tiles;
}

export function roomCatalogFromPayload(payload, existing) {
  const rooms = [];
  let index = 0;
  for (const source of payload.rooms ?? []) {
    index += 1;
    if (!isObj(source)) continue;
    let width = isInt(source.width) && source.width > 0 ? source.width : 8;
    const height = isInt(source.height) && source.height > 0 ? source.height : 8;
    width = oddRoomWidth(width);
    const roomKind = ROOM_KINDS.has(source.room_kind) ? source.room_kind : "encounter";
    const levels = (source.dungeon_levels ?? []).filter((level) => isInt(level) && level >= 1 && level <= 5);
    rooms.push({
      id: String(pyOr(source.id, `room-${index}`)),
      name: String(pyOr(source.name, `Room ${index}`)),
      preset: String(pyOr(source.preset, "small")),
      width,
      height,
      dungeon_levels: pyOr([...new Set(levels)].sort((a, b) => a - b), [1]),
      room_kind: roomKind,
      tags: [...new Set((source.tags ?? []).map((tag) => String(tag).trim()).filter((tag) => tag.length > 0))].sort(),
      notes: String(pyOr(source.notes, "")),
      tiles: cleanRoomTiles(source.tiles, width, height),
      obstacles: cleanRoomPoints(source.obstacles, width, height),
      doors: cleanRoomPoints(source.doors, width, height),
      spawn: cleanRoomPoint(source.spawn, width, height),
      battle_spawn: cleanRoomPoint(source.battle_spawn, width, height),
      enemy_spawns: cleanRoomPoints(source.enemy_spawns, width, height),
      updated_at: String(pyOr(source.updated_at, payload.updated_at, "")),
    });
  }

  return {
    version: pyOr(payload.version, existing.version, "0.1.0"),
    source_image: "/room-assets/oryx_16bit_fantasy_world_trans.png",
    tile_size: pyOr(payload.tile_size, existing.tile_size, 24),
    presets: ROOM_PRESETS,
    rooms,
    curation: {
      ...(existing.curation ?? {}),
      latest_live_save_at: pyOr(payload.curation?.latest_live_update_seen, payload.updated_at) ?? null,
      latest_live_save_source: "live_mapper_server",
    },
  };
}

// --- Dungeon plan --------------------------------------------------------------

const PLAN_LEVELS = ["1", "2", "3", "4", "5"];
const PLAN_BIOMES = new Set(["forest", "sand", "volcanic", "castle", "dungeon"]);
const PLAN_PROFILES = new Set(["balanced", "elite", "strength", "dexterity", "caster", "support", "tank", "hp", "unset"]);

function heroProtectedIds(root) {
  const catalog = readExistingJson(path.join(root, "data", "oryx_creature_fx_catalog.json"));
  const ids = new Set();
  for (const entry of catalog.entries ?? []) {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    if (entry.category === "hero" || tags.includes("hero")) ids.add(entry.id);
  }
  return ids;
}

/**
 * Normalizes the Dungeon workspace's per-floor plan. Hero sprites are stripped
 * from rosters and boss slots (same protection as tactical visuals); unknown
 * profiles fall back to "balanced" so the engine's profile matching stays sane.
 */
export function dungeonPlanFromPayload(payload, existing, root = ROOT) {
  const protectedIds = heroProtectedIds(root);
  const levels = {};
  for (const level of PLAN_LEVELS) {
    const source = payload.levels?.[level];
    if (!isObj(source)) continue;
    const seen = new Set();
    const enemies = [];
    for (const raw of Array.isArray(source.enemies) ? source.enemies : []) {
      if (!isObj(raw)) continue;
      const id = String(raw.id ?? "").trim();
      if (!id || seen.has(id) || protectedIds.has(id)) continue;
      seen.add(id);
      const profile = PLAN_PROFILES.has(raw.profile) ? raw.profile : "balanced";
      enemies.push({ id, profile, boss: raw.boss === true });
    }
    const boss = String(source.boss ?? "").trim();
    const bossName = String(source.bossName ?? "").trim();
    const biome = PLAN_BIOMES.has(source.biome) ? source.biome : "";
    const notes = String(source.notes ?? "").trim();
    const custom = source.custom === true;
    if (!enemies.length && !boss && !bossName && !biome && !notes && !custom) continue;
    levels[level] = {
      custom,
      enemies,
      ...(boss && !protectedIds.has(boss) ? { boss } : {}),
      ...(bossName ? { bossName } : {}),
      ...(biome ? { biome } : {}),
      ...(notes ? { notes } : {}),
      updated_at: String(pyOr(source.updated_at, payload.updated_at, "")),
    };
  }

  return {
    version: pyOr(payload.version, existing.version, "0.1.0"),
    levels,
    curation: {
      ...(existing.curation ?? {}),
      latest_live_save_at: payload.exported_at ?? null,
      latest_live_update_seen: payload.updated_at ?? null,
      latest_live_save_source: "dungeon_workspace",
    },
  };
}

// --- Tactical visuals --------------------------------------------------------

export function tacticalVisualsFromPayload(payload, root = ROOT) {
  const catalog = readExistingJson(path.join(root, "data", "oryx_creature_fx_catalog.json"));
  const protectedIds = new Set();
  for (const entry of catalog.entries ?? []) {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    if (entry.category === "hero" || tags.includes("hero")) protectedIds.add(entry.id);
  }
  for (const id of payload.protected_ids ?? []) protectedIds.add(String(id));

  const pools = {};
  for (const [profile, ids] of Object.entries(payload.pools ?? {})) {
    if (!Array.isArray(ids)) continue;
    const seen = new Set();
    const cleanIds = [];
    for (const raw of ids) {
      const id = String(raw).trim();
      if (!id || seen.has(id) || protectedIds.has(id)) continue;
      seen.add(id);
      cleanIds.push(id);
    }
    pools[String(profile)] = cleanIds;
  }

  const bosses = {};
  for (const [level, raw] of Object.entries(payload.bosses ?? {})) {
    const id = String(raw).trim();
    if (id && !protectedIds.has(id)) bosses[String(level)] = id;
  }

  return { pools, bosses };
}

// --- Save handlers -----------------------------------------------------------

function saveCreatureFx(payload, root) {
  const jsonPath = path.join(root, "data", "oryx_creature_fx_catalog.json");
  const jsPath = path.join(root, "data", "oryx_creature_fx_catalog_seed.js");
  const catalog = creatureFxCatalogFromPayload(payload, readExistingJson(jsonPath));
  writeJsonFile(jsonPath, catalog);
  writeJsSeed(jsPath, "ORYX_CREATURE_FX_SEED_CATALOG", catalog);
  return { ok: true, saved: "creature_fx", entries: catalog.entries.length };
}

function saveItems(payload, root) {
  const jsonPath = path.join(root, "data", "oryx_item_catalog.json");
  const jsPath = path.join(root, "data", "oryx_item_catalog_seed.js");
  const catalog = itemCatalogFromPayload(payload, readExistingJson(jsonPath));
  writeJsonFile(jsonPath, catalog);
  writeJsSeed(jsPath, "ORYX_SEED_CATALOG", catalog);
  // Re-bake the engine's weapon templates so item edits are picked up by the
  // game without a manual `node tools/build_weapon_templates.mjs` step.
  const { contents, count } = weaponTemplatesFileContents(catalog);
  atomicWrite(path.join(root, WEAPON_TEMPLATES_OUT), contents);
  return { ok: true, saved: "items", entries: catalog.items.length, weapon_templates: count };
}

function saveDungeonPlan(payload, root) {
  const jsonPath = path.join(root, "data", "dungeon_plan.json");
  const plan = dungeonPlanFromPayload(payload, readExistingJson(jsonPath), root);
  writeJsonFile(jsonPath, plan);
  return { ok: true, saved: "dungeon_plan", levels: Object.keys(plan.levels).length };
}

function saveRooms(payload, root) {
  const jsonPath = path.join(root, "data", "dungeon_room_catalog.json");
  const catalog = roomCatalogFromPayload(payload, readExistingJson(jsonPath));
  writeJsonFile(jsonPath, catalog);
  return { ok: true, saved: "rooms", rooms: catalog.rooms.length };
}

function saveTacticalVisuals(payload, root) {
  const jsPath = path.join(root, "data", "tactical_enemy_visuals.js");
  const visuals = tacticalVisualsFromPayload(payload, root);
  writeJsPayload(jsPath, "TACTICAL_ENEMY_VISUALS", visuals);
  return {
    ok: true,
    saved: "tactical_visuals",
    pools: Object.values(visuals.pools).reduce((total, ids) => total + ids.length, 0),
    bosses: Object.keys(visuals.bosses).length,
  };
}

const SAVE_HANDLERS = {
  "/api/save/creature-fx": saveCreatureFx,
  "/api/save/items": saveItems,
  "/api/save/rooms": saveRooms,
  "/api/save/tactical-visuals": saveTacticalVisuals,
  "/api/save/dungeon-plan": saveDungeonPlan,
};

// --- HTTP plumbing -----------------------------------------------------------

const CONTENT_TYPES = {
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript",
  ".png": "image/png",
};

function sendJson(res, payload, status = 200) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function sendFile(res, filePath) {
  const body = readFileSync(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function statusPayload() {
  return {
    ok: true,
    root: ROOT,
    files: {
      creature_fx: path.join(DATA, "oryx_creature_fx_catalog.json"),
      items: path.join(DATA, "oryx_item_catalog.json"),
      tactical_visuals: path.join(DATA, "tactical_enemy_visuals.js"),
      rooms: path.join(DATA, "dungeon_room_catalog.json"),
      dungeon_plan: path.join(DATA, "dungeon_plan.json"),
    },
  };
}

function serveDataFile(res, pathname) {
  const target = path.normalize(path.join(DATA, pathname.slice("/data/".length)));
  if (target !== DATA && !target.startsWith(DATA + path.sep)) {
    sendJson(res, { ok: false, error: "Forbidden" }, 403);
    return;
  }
  if (!existsSync(target)) {
    sendJson(res, { ok: false, error: `Not found: ${pathname}` }, 404);
    return;
  }
  sendFile(res, target);
}

function serveAsset(res, pathname) {
  const name = ASSET_ALIASES[pathname];
  const target = name ? path.join(ROOM_ASSETS, name) : null;
  if (!target || !existsSync(target)) {
    sendJson(res, { ok: false, error: `Asset missing: ${pathname}` }, 404);
    return;
  }
  sendFile(res, target);
}

/** Connect middleware shared by the dev and preview servers. */
export function mapperMiddleware(req, res, next) {
  const pathname = decodeURIComponent((req.url ?? "").split("?")[0]);

  if (req.method === "GET") {
    if (pathname === "/api/status") return sendJson(res, statusPayload());
    if (pathname.startsWith("/data/")) return serveDataFile(res, pathname);
    if (pathname.startsWith("/assets/")) return serveAsset(res, pathname);
    return next();
  }

  if (req.method === "POST" && pathname.startsWith("/api/save/")) {
    const handler = SAVE_HANDLERS[pathname];
    if (!handler) return sendJson(res, { ok: false, error: `Unknown endpoint: ${pathname}` }, 404);
    readJsonBody(req)
      .then((payload) => sendJson(res, handler(payload, ROOT)))
      .catch((error) => sendJson(res, { ok: false, error: String(error?.message ?? error) }, 500));
    return;
  }

  next();
}

/** Vite plugin: mounts the mapper API on the dev and preview servers. */
export function mapperApi() {
  return {
    name: "dungeon-mapper-api",
    configureServer(server) {
      server.middlewares.use(mapperMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mapperMiddleware);
    },
  };
}
