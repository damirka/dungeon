/**
 * Runtime room-catalog loader. The Level editor (RoomDesigner) persists the
 * authored maps — including obstacle / door / spawn mapping — to
 * localStorage["dungeon-workbench.room-catalog"] on every edit, and to
 * data/dungeon_room_catalog.json on explicit Save. The game reads the SAME live
 * source so edits show up immediately (no regeneration step):
 *
 *   localStorage (live edits)  →  /data file (saved)  →  bundled snapshot
 */

import { AUTHORED_ROOMS, type RoomDef, type RoomTile } from "./roomData";

const STORAGE_KEY = "dungeon-workbench.room-catalog";

interface RawTile {
  x?: number;
  y?: number;
  layer?: string;
  flip_x?: boolean;
  flip?: boolean;
  c?: number;
  r?: number;
  tile?: { col?: number; row?: number };
}
interface RawPoint {
  x?: number;
  y?: number;
}
interface RawRoom {
  id?: string;
  name?: string;
  room_kind?: string;
  kind?: string;
  dungeon_levels?: number[];
  levels?: number[];
  preset?: string;
  width?: number;
  height?: number;
  tiles?: RawTile[];
  obstacles?: RawPoint[];
  doors?: RawPoint[];
  spawn?: RawPoint | null;
  battle_spawn?: RawPoint | null;
  enemy_spawns?: RawPoint[];
}
interface RawCatalog {
  rooms?: RawRoom[];
}

function point(p: RawPoint | null | undefined): { x: number; y: number } | null {
  if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y)) return null;
  return { x: p.x as number, y: p.y as number };
}

function normalizeRoom(raw: RawRoom, i: number): RoomDef | null {
  const width = Number(raw.width) || 0;
  const height = Number(raw.height) || 0;
  if (!width || !height) return null;
  const tiles: RoomTile[] = (Array.isArray(raw.tiles) ? raw.tiles : [])
    .filter((t) => Number.isInteger(t.x) && Number.isInteger(t.y))
    .map((t) => ({
      x: t.x as number,
      y: t.y as number,
      layer: typeof t.layer === "string" ? t.layer : "floor",
      c: Number(t.tile?.col ?? t.c ?? 0),
      r: Number(t.tile?.row ?? t.r ?? 0),
      flip: Boolean(t.flip_x ?? t.flip),
    }));
  const obstacles = (Array.isArray(raw.obstacles) ? raw.obstacles : []).map(point).filter((p): p is { x: number; y: number } => p !== null);
  const doors = (Array.isArray(raw.doors) ? raw.doors : []).map(point).filter((p): p is { x: number; y: number } => p !== null);
  return {
    id: String(raw.id || `room-${i}`),
    name: String(raw.name || "Room"),
    kind: String(raw.room_kind || raw.kind || "encounter"),
    levels: Array.isArray(raw.dungeon_levels) ? raw.dungeon_levels : Array.isArray(raw.levels) ? raw.levels : [],
    preset: String(raw.preset || "large"),
    width,
    height,
    tiles,
    obstacles,
    doors,
    spawn: point(raw.spawn),
    battleSpawn: point(raw.battle_spawn),
    enemySpawns: (Array.isArray(raw.enemy_spawns) ? raw.enemy_spawns : []).map(point).filter((p): p is { x: number; y: number } => p !== null),
  };
}

function parseCatalog(cat: RawCatalog | null): RoomDef[] {
  if (!cat || !Array.isArray(cat.rooms)) return [];
  return cat.rooms.map(normalizeRoom).filter((r): r is RoomDef => r !== null && r.tiles.length > 0);
}

// async refresh from the saved catalog file (covers a stale bundled snapshot)
let serverRooms: RoomDef[] | null = null;
if (typeof fetch === "function") {
  void fetch("/data/dungeon_room_catalog.json")
    .then((r) => (r.ok ? (r.json() as Promise<RawCatalog>) : null))
    .then((c) => {
      const rooms = parseCatalog(c);
      if (rooms.length) serverRooms = rooms;
    })
    .catch(() => {});
}

/**
 * The room pool the game would draw from for a floor + step. This is the ONE
 * place that encodes room auto-pickup (kind cascade + level scoping), shared by
 * the play renderer's pickRoom and the Dungeon workspace's coverage view.
 *
 * `levelScoped` reports whether the pool is scoped to rooms assigned to this
 * floor, or borrowed from every floor because none were assigned here.
 */
export function roomPoolFor(
  allRooms: RoomDef[],
  level: number,
  kind: "entrance" | "encounter" | "boss",
): { pool: RoomDef[]; levelScoped: boolean } {
  const usable = allRooms.filter((r) => r.tiles.length > 0);
  const lvlOk = (r: RoomDef) => !r.levels.length || r.levels.includes(level);
  const scope = (list: RoomDef[]): { pool: RoomDef[]; levelScoped: boolean } | null => {
    if (!list.length) return null;
    const scoped = list.filter(lvlOk);
    return scoped.length ? { pool: scoped, levelScoped: true } : { pool: list, levelScoped: false };
  };
  if (kind === "boss") {
    const boss = scope(usable.filter((r) => r.preset === "boss" || /boss/i.test(r.name)));
    if (boss) return boss;
  }
  if (kind === "entrance") {
    const ent = scope(usable.filter((r) => (r.kind === "entrance" || r.kind === "passage") && r.preset !== "boss"));
    if (ent) return ent;
  }
  const enc = scope(usable.filter((r) => r.kind === "encounter" && r.preset !== "boss"));
  if (enc) return enc;
  return scope(usable.filter((r) => r.preset !== "boss")) ?? { pool: [], levelScoped: false };
}

/** The freshest authored maps available right now. Reads the editor's live state. */
export function liveRooms(): RoomDef[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const rooms = parseCatalog(JSON.parse(raw) as RawCatalog);
      if (rooms.length) return rooms;
    }
  } catch {
    /* ignore malformed local state */
  }
  return serverRooms || AUTHORED_ROOMS;
}
