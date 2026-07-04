/**
 * Bakes src/game/roomData.ts (the game's bundled room snapshot) from
 * data/dungeon_room_catalog.json. The snapshot is the LAST fallback in
 * src/game/rooms.ts — it is what static deploys without the mapper API serve to
 * players and to the Levels room designer, so it must track the live catalog.
 *
 * Run: node tools/build_room_data.mjs
 * The mapper API also re-bakes it on every /api/save/rooms, and
 * tools/mapperApi.test.mjs guards against drift.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// biome floor tiles for the procedural corridor fallback — not catalog-derived
const BIOME_FLOOR = {
  forest: [[10, 16], [11, 16], [12, 16]],
  sand: [[10, 22], [11, 22], [12, 22]],
  volcanic: [[10, 19], [11, 19], [12, 19]],
  castle: [[10, 26], [11, 26], [12, 26]],
  dungeon: [[10, 28], [11, 28], [12, 28]],
};

export function buildAuthoredRooms(catalog) {
  return (catalog.rooms || [])
    .filter((room) => Array.isArray(room.tiles) && room.tiles.length > 0)
    .map((room) => ({
      id: room.id,
      name: room.name,
      kind: room.room_kind || "encounter",
      levels: room.dungeon_levels || [],
      preset: room.preset || "large",
      width: room.width,
      height: room.height,
      tiles: room.tiles.map((tile) => ({
        x: tile.x,
        y: tile.y,
        layer: tile.layer || "floor",
        c: tile.tile?.col ?? 0,
        r: tile.tile?.row ?? 0,
        flip: tile.flip_x === true,
      })),
      obstacles: room.obstacles || [],
      doors: room.doors || [],
      spawn: room.spawn ?? null,
      battleSpawn: room.battle_spawn ?? null,
      enemySpawns: room.enemy_spawns || [],
    }));
}

/** Full generated-file contents — shared with the mapper API so room saves
    keep the bundled snapshot fresh automatically. */
export function roomDataFileContents(catalog) {
  const rooms = buildAuthoredRooms(catalog);
  const contents = `/** Auto-generated from data/dungeon_room_catalog.json by tools/build_room_data.mjs.
    Do not edit by hand. Tiles render exactly like the editor: trans world sheet + 24px origin. */
export const WORLD_SHEET = "/room-assets/oryx_16bit_fantasy_world_trans.png";
export const ROOM_TILE = 24;
export const ROOM_ORIGIN = 24;
export interface RoomTile { x:number; y:number; layer:string; c:number; r:number; flip:boolean }
export interface RoomDef { id:string; name:string; kind:string; levels:number[]; preset:string; width:number; height:number; tiles:RoomTile[]; obstacles:{x:number;y:number}[]; doors:{x:number;y:number}[]; spawn:{x:number;y:number}|null; battleSpawn?:{x:number;y:number}|null; enemySpawns?:{x:number;y:number}[] }
export const AUTHORED_ROOMS: RoomDef[] = ${JSON.stringify(rooms)};
export const BIOME_FLOOR: Record<string, number[][]> = ${JSON.stringify(BIOME_FLOOR)};
`;
  return { contents, count: rooms.length };
}

export const ROOM_DATA_OUT = "src/game/roomData.ts";

function main() {
  const catalog = JSON.parse(readFileSync(resolve(root, "data/dungeon_room_catalog.json"), "utf8"));
  const { contents, count } = roomDataFileContents(catalog);
  writeFileSync(resolve(root, ROOM_DATA_OUT), contents, "utf8");
  console.log(`Wrote ${count} authored rooms to ${ROOM_DATA_OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
