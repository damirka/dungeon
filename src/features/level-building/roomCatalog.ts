export type RoomKind = "entrance" | "encounter" | "treasury" | "special" | "passage";
export type RoomView = "visuals" | "mapping";
export type VisualTool = "paint" | "erase";
export type MappingTool = "obstacle" | "door" | "spawn" | "player" | "enemy" | "clear";
export type RoomTileLayer = "floor" | "wall" | "decor";

export interface RoomPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  intent: string;
}

export interface RoomTileRef {
  sheet: "oryx_world2";
  col: number;
  row: number;
}

export interface RoomTile {
  x: number;
  y: number;
  layer: RoomTileLayer;
  flip_x?: boolean;
  tile: RoomTileRef;
}

export interface RoomPoint {
  x: number;
  y: number;
}

export interface DungeonRoom {
  id: string;
  name: string;
  preset: string;
  width: number;
  height: number;
  dungeon_levels: number[];
  room_kind: RoomKind;
  tags: string[];
  notes: string;
  tiles: RoomTile[];
  obstacles: RoomPoint[];
  doors: RoomPoint[];
  spawn: RoomPoint | null;
  /** where the player stands when an encounter in this room begins */
  battle_spawn: RoomPoint | null;
  /** candidate cells enemies spawn on; the game fills a subset to taste */
  enemy_spawns: RoomPoint[];
  updated_at: string;
}

export interface DungeonRoomCatalog {
  version: string;
  source_image: string;
  tile_size: number;
  presets: RoomPreset[];
  rooms: DungeonRoom[];
  curation?: Record<string, unknown>;
}

export const ROOM_SPRITESHEET = {
  id: "oryx_world2",
  label: "oryx_world_trans",
  url: "/room-assets/oryx_16bit_fantasy_world_trans.png",
  tileSize: 24,
  originX: 24,
  originY: 24,
  fallbackWidth: 1366,
  fallbackHeight: 1007
} as const;

export const ROOM_PRESETS: RoomPreset[] = [
  { id: "small", label: "Small", width: 9, height: 8, intent: "Tight encounter or stash" },
  { id: "wide", label: "Wide", width: 15, height: 8, intent: "Horizontal combat read" },
  { id: "long", label: "Long", width: 9, height: 14, intent: "Vertical gauntlet" },
  { id: "large", label: "Large", width: 17, height: 12, intent: "Main encounter space" },
  { id: "boss", label: "Boss", width: 19, height: 14, intent: "Set-piece arena" },
  { id: "passage", label: "Passage", width: 17, height: 5, intent: "Connector or fork" }
];

export const ROOM_KIND_OPTIONS: Array<{ id: RoomKind; label: string }> = [
  { id: "entrance", label: "Entrance" },
  { id: "encounter", label: "Encounter" },
  { id: "treasury", label: "Treasury" },
  { id: "special", label: "Special" },
  { id: "passage", label: "Passage" }
];

export const DUNGEON_LEVELS = [1, 2, 3, 4, 5] as const;
export const ROOM_TILE_LAYERS: RoomTileLayer[] = ["floor", "wall", "decor"];

export function pointKey(point: RoomPoint) {
  return `${point.x}:${point.y}`;
}

export function cellKey(x: number, y: number) {
  return `${x}:${y}`;
}

export function presetById(id: string) {
  return ROOM_PRESETS.find((preset) => preset.id === id) || ROOM_PRESETS[0];
}

export function createRoom(preset: RoomPreset = ROOM_PRESETS[0], index = 1): DungeonRoom {
  const stamp = new Date().toISOString();
  return {
    id: `room-${stamp.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${preset.label} Room ${index}`,
    preset: preset.id,
    width: preset.width,
    height: preset.height,
    dungeon_levels: [1],
    room_kind: preset.id === "passage" ? "passage" : "encounter",
    tags: [],
    notes: "",
    tiles: [],
    obstacles: [],
    doors: [],
    spawn: null,
    battle_spawn: null,
    enemy_spawns: [],
    updated_at: stamp
  };
}

function isPoint(value: unknown): value is RoomPoint {
  if (!value || typeof value !== "object") {
    return false;
  }
  const point = value as RoomPoint;
  return Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0;
}

function inBounds(point: RoomPoint, width: number, height: number) {
  return point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
}

function oddWidth(width: number) {
  return width % 2 === 0 ? width + 1 : width;
}

function cleanPoints(points: unknown, width: number, height: number) {
  if (!Array.isArray(points)) {
    return [];
  }
  const seen = new Set<string>();
  return points.filter(isPoint).filter((point) => {
    const key = pointKey(point);
    if (seen.has(key) || !inBounds(point, width, height)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function cleanTiles(tiles: unknown, width: number, height: number) {
  if (!Array.isArray(tiles)) {
    return [];
  }
  const layerOrder = new Map(ROOM_TILE_LAYERS.map((layer, index) => [layer, index]));
  const byCell = new Map<string, RoomTile>();
  for (const item of tiles) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const tile = item as RoomTile;
    if (!isPoint(tile) || !inBounds(tile, width, height) || !tile.tile) {
      continue;
    }
    const col = Number(tile.tile.col);
    const row = Number(tile.tile.row);
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0) {
      continue;
    }
    const layer = ROOM_TILE_LAYERS.includes(tile.layer) ? tile.layer : "floor";
    byCell.set(`${cellKey(tile.x, tile.y)}:${layer}`, {
      x: tile.x,
      y: tile.y,
      layer,
      ...(tile.flip_x === true ? { flip_x: true } : {}),
      tile: { sheet: "oryx_world2", col, row }
    });
  }
  return [...byCell.values()].sort(
    (a, b) => a.y - b.y || a.x - b.x || (layerOrder.get(a.layer) ?? 0) - (layerOrder.get(b.layer) ?? 0)
  );
}

function isRoomKind(value: unknown): value is RoomKind {
  return ROOM_KIND_OPTIONS.some((option) => option.id === value);
}

function cleanLevels(levels: unknown) {
  if (!Array.isArray(levels)) {
    return [1];
  }
  const allowed = new Set<number>(DUNGEON_LEVELS);
  const clean = [...new Set(levels.filter((level): level is number => allowed.has(Number(level))))].sort();
  return clean.length > 0 ? clean : [1];
}

function cleanTags(tags: unknown) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return [...new Set(tags.map(String).map((tag) => tag.trim()).filter(Boolean))];
}

export function normalizeRoom(value: unknown, index: number): DungeonRoom | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Partial<DungeonRoom>;
  const preset = presetById(String(source.preset || "small"));
  const width = oddWidth(Number.isInteger(source.width) && source.width ? source.width : preset.width);
  const height = Number.isInteger(source.height) && source.height ? source.height : preset.height;
  const room: DungeonRoom = {
    id: String(source.id || `room-${index + 1}`),
    name: String(source.name || `${preset.label} Room ${index + 1}`),
    preset: preset.id,
    width,
    height,
    dungeon_levels: cleanLevels(source.dungeon_levels),
    room_kind: isRoomKind(source.room_kind) ? source.room_kind : preset.id === "passage" ? "passage" : "encounter",
    tags: cleanTags(source.tags),
    notes: String(source.notes || ""),
    tiles: cleanTiles(source.tiles, width, height),
    obstacles: cleanPoints(source.obstacles, width, height),
    doors: cleanPoints(source.doors, width, height),
    spawn: isPoint(source.spawn) && inBounds(source.spawn, width, height) ? source.spawn : null,
    battle_spawn: isPoint(source.battle_spawn) && inBounds(source.battle_spawn, width, height) ? source.battle_spawn : null,
    enemy_spawns: cleanPoints(source.enemy_spawns, width, height),
    updated_at: String(source.updated_at || new Date().toISOString())
  };
  return room;
}

export function sanitizeCatalog(input?: Partial<DungeonRoomCatalog> | null): DungeonRoomCatalog {
  const rooms = Array.isArray(input?.rooms)
    ? input.rooms.map((room, index) => normalizeRoom(room, index)).filter((room): room is DungeonRoom => Boolean(room))
    : [];
  return {
    version: String(input?.version || "0.1.0"),
    source_image: ROOM_SPRITESHEET.url,
    tile_size: ROOM_SPRITESHEET.tileSize,
    presets: ROOM_PRESETS,
    rooms,
    curation: input?.curation || {}
  };
}

export function resizeRoom(room: DungeonRoom, preset: RoomPreset): DungeonRoom {
  const width = preset.width;
  const height = preset.height;
  return {
    ...room,
    preset: preset.id,
    width,
    height,
    room_kind: preset.id === "passage" ? "passage" : room.room_kind,
    tiles: room.tiles.filter((tile) => inBounds(tile, width, height)),
    obstacles: room.obstacles.filter((point) => inBounds(point, width, height)),
    doors: room.doors.filter((point) => inBounds(point, width, height)),
    spawn: room.spawn && inBounds(room.spawn, width, height) ? room.spawn : null,
    battle_spawn: room.battle_spawn && inBounds(room.battle_spawn, width, height) ? room.battle_spawn : null,
    enemy_spawns: room.enemy_spawns.filter((point) => inBounds(point, width, height)),
    updated_at: new Date().toISOString()
  };
}

export function resizeRoomGrid(room: DungeonRoom, width: number, height: number): DungeonRoom {
  const nextWidth = Math.max(3, oddWidth(width));
  const nextHeight = Math.max(3, height);
  return {
    ...room,
    width: nextWidth,
    height: nextHeight,
    tiles: room.tiles.filter((tile) => inBounds(tile, nextWidth, nextHeight)),
    obstacles: room.obstacles.filter((point) => inBounds(point, nextWidth, nextHeight)),
    doors: room.doors.filter((point) => inBounds(point, nextWidth, nextHeight)),
    spawn: room.spawn && inBounds(room.spawn, nextWidth, nextHeight) ? room.spawn : null,
    battle_spawn: room.battle_spawn && inBounds(room.battle_spawn, nextWidth, nextHeight) ? room.battle_spawn : null,
    enemy_spawns: room.enemy_spawns.filter((point) => inBounds(point, nextWidth, nextHeight)),
    updated_at: new Date().toISOString()
  };
}

function shiftPoint(point: RoomPoint, shiftX: number, shiftY: number) {
  return { x: point.x + shiftX, y: point.y + shiftY };
}

export function resizeRoomGridFromEdge(
  room: DungeonRoom,
  width: number,
  height: number,
  shiftX: number,
  shiftY: number
): DungeonRoom {
  const nextWidth = Math.max(3, oddWidth(width));
  const nextHeight = Math.max(3, height);
  const shiftedTiles = room.tiles.map((tile) => ({ ...tile, x: tile.x + shiftX, y: tile.y + shiftY }));
  const shiftedObstacles = room.obstacles.map((point) => shiftPoint(point, shiftX, shiftY));
  const shiftedDoors = room.doors.map((point) => shiftPoint(point, shiftX, shiftY));
  const shiftedSpawn = room.spawn ? shiftPoint(room.spawn, shiftX, shiftY) : null;
  const shiftedBattleSpawn = room.battle_spawn ? shiftPoint(room.battle_spawn, shiftX, shiftY) : null;
  const shiftedEnemySpawns = room.enemy_spawns.map((point) => shiftPoint(point, shiftX, shiftY));
  return {
    ...room,
    width: nextWidth,
    height: nextHeight,
    tiles: shiftedTiles.filter((tile) => inBounds(tile, nextWidth, nextHeight)),
    obstacles: shiftedObstacles.filter((point) => inBounds(point, nextWidth, nextHeight)),
    doors: shiftedDoors.filter((point) => inBounds(point, nextWidth, nextHeight)),
    spawn: shiftedSpawn && inBounds(shiftedSpawn, nextWidth, nextHeight) ? shiftedSpawn : null,
    battle_spawn: shiftedBattleSpawn && inBounds(shiftedBattleSpawn, nextWidth, nextHeight) ? shiftedBattleSpawn : null,
    enemy_spawns: shiftedEnemySpawns.filter((point) => inBounds(point, nextWidth, nextHeight)),
    updated_at: new Date().toISOString()
  };
}
