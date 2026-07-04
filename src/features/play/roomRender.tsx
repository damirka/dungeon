import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { BiomeId } from "../playtest/engine";
import { BIOME_FLOOR, ROOM_ORIGIN, ROOM_TILE, WORLD_SHEET, type RoomDef, type RoomTile } from "../../game/roomData";
import { liveRooms, roomPoolFor } from "../../game/rooms";

let sheetPromise: Promise<HTMLImageElement | null> | null = null;

/** Load the shared Oryx world tilesheet once and cache the promise. */
export function loadSheet(): Promise<HTMLImageElement | null> {
  if (!sheetPromise) {
    sheetPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = WORLD_SHEET;
    });
  }
  return sheetPromise;
}

export const LAYER_ORDER: Record<string, number> = { floor: 0, decor: 1, wall: 2 };

/**
 * Choose the player's pre-created map for this floor + step, by level and kind.
 * `variant` (e.g. the encounter slot) rotates through matching rooms so multiple
 * authored rooms for a floor each get used instead of always the first — stable
 * per encounter (no flicker), cycling across encounters.
 */
export function pickRoom(
  biome: BiomeId,
  level: number,
  kind: "entrance" | "encounter" | "boss",
  variant = 0,
): RoomDef {
  const { pool } = roomPoolFor(liveRooms(), level, kind);
  if (pool.length) return pool[((variant % pool.length) + pool.length) % pool.length];

  // fallback corridor from real biome floor tiles
  const floor = BIOME_FLOOR[biome] || BIOME_FLOOR.dungeon;
  const width = 15;
  const height = 9;
  const tiles: RoomTile[] = [];
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const f = floor[(x + y) % floor.length];
      tiles.push({ x, y, layer: "floor", c: f[0], r: f[1], flip: false });
    }
  return { id: "corridor", name: "Corridor", kind, levels: [], preset: "wide", width, height, tiles, obstacles: [], doors: [], spawn: { x: 1, y: Math.floor(height / 2) } };
}

export interface RoomLayout {
  tile: number;
  offX: number;
  offY: number;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export interface BattleStage extends RoomLayout {
  heroCell: { x: number; y: number };
  enemyCells: { x: number; y: number }[];
  /** convert a grid cell center to a screen px point inside the arena */
  cellToScreen: (cx: number, cy: number) => { x: number; y: number };
}

type Cell = { x: number; y: number };
const dist2 = (a: Cell, b: Cell) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/**
 * Choose `k` cells from authored candidates that are spread out — farthest-point
 * sampling seeded by the cell farthest from the player. Deterministic (no camera
 * jitter between renders). Returned front-to-back (nearest the player first) so
 * the lead enemy takes the front cell.
 */
function pickSpread(markers: Cell[], k: number, origin: Cell): Cell[] {
  const pool = markers.slice();
  if (k >= pool.length) return pool.sort((a, b) => dist2(a, origin) - dist2(b, origin));
  const chosen: Cell[] = [];
  let seedIdx = 0;
  let seedBest = -1;
  pool.forEach((m, i) => {
    const d = dist2(m, origin);
    if (d > seedBest) {
      seedBest = d;
      seedIdx = i;
    }
  });
  chosen.push(pool.splice(seedIdx, 1)[0]);
  while (chosen.length < k && pool.length) {
    let bestIdx = 0;
    let best = -1;
    pool.forEach((m, i) => {
      const dmin = Math.min(...chosen.map((c) => dist2(c, m)));
      if (dmin > best) {
        best = dmin;
        bestIdx = i;
      }
    });
    chosen.push(pool.splice(bestIdx, 1)[0]);
  }
  return chosen.sort((a, b) => dist2(a, origin) - dist2(b, origin));
}

/**
 * Build a camera onto the room for combat: the map is rendered BIGGER than the
 * arena (so only a slice shows) and the hero + enemies are placed on real grid
 * cells. tile/offX/offY are shared by the backdrop canvas and the unit layout so
 * the grid and the units stay aligned. The camera frames the action and clamps
 * to the map bounds.
 */
export function computeBattleStage(room: RoomDef, w: number, h: number, enemyCount: number): BattleStage {
  const empty: BattleStage = {
    tile: 0,
    offX: 0,
    offY: 0,
    heroCell: { x: 0, y: 0 },
    enemyCells: [],
    cellToScreen: () => ({ x: 0, y: 0 }),
  };
  if (!w || !h) return empty;

  // tile big enough to (a) always cover the arena and (b) zoom in so ~6.5 rows
  // are visible — whichever is larger. This guarantees mapPx >= arena on both axes.
  const ZOOM_ROWS = 6.5;
  const coverTile = Math.max(w / room.width, h / room.height);
  const tile = Math.max(coverTile, h / ZOOM_ROWS);
  const mapW = room.width * tile;
  const mapH = room.height * tile;

  // battle line: hero stands on the authored player cell when one exists,
  // otherwise falls back to the left third; enemies fan across to the right.
  const authored =
    room.battleSpawn && Number.isInteger(room.battleSpawn.x) && Number.isInteger(room.battleSpawn.y)
      ? { x: clamp(room.battleSpawn.x, 0, room.width - 1), y: clamp(room.battleSpawn.y, 0, room.height - 1) }
      : null;
  const rowY = authored ? authored.y : clamp(room.spawn?.y ?? Math.round(room.height / 2), 1, room.height - 2);
  const heroX = authored ? authored.x : clamp(Math.round(room.width * 0.3), 1, room.width - 3);
  const count = Math.max(1, enemyCount);
  const heroCell = { x: heroX, y: rowY };

  // fan formation — fallback when the room has no authored enemy cells, and to
  // place any enemies beyond the number of authored markers.
  const gap = room.width >= 13 ? 2 : 1;
  const fan = (n: number): Cell[] => {
    const span = (n - 1) * gap;
    const mid = clamp(heroX + Math.max(3, Math.round(room.width * 0.34)), heroX + 2, room.width - 2);
    return Array.from({ length: n }, (_, i) => ({
      x: clamp(Math.round(mid - span / 2 + i * gap), heroX + 1, room.width - 1),
      y: rowY,
    }));
  };

  // authored enemy candidate cells (valid, in-bounds, deduped)
  const markers: Cell[] = [];
  const seen = new Set<string>();
  for (const m of room.enemySpawns ?? []) {
    if (!m || !Number.isInteger(m.x) || !Number.isInteger(m.y)) continue;
    if (m.x < 0 || m.y < 0 || m.x >= room.width || m.y >= room.height) continue;
    const key = `${m.x},${m.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push({ x: m.x, y: m.y });
  }

  // markers ≥ enemies → spread subset; fewer markers → fill all then fan the rest
  const enemyCells: Cell[] =
    markers.length === 0
      ? fan(count)
      : markers.length >= count
        ? pickSpread(markers, count, heroCell)
        : [...pickSpread(markers, markers.length, heroCell), ...fan(count - markers.length)];

  // frame the whole encounter: camera centred on the bounding box of all units
  const cells = [heroCell, ...enemyCells];
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const focusX = ((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * tile;
  const focusY = ((Math.min(...ys) + Math.max(...ys)) / 2 + 0.5) * tile;
  const offX = clamp(w / 2 - focusX, Math.min(0, w - mapW), 0);
  const offY = clamp(h / 2 - focusY, Math.min(0, h - mapH), 0);

  return {
    tile,
    offX,
    offY,
    heroCell,
    enemyCells,
    cellToScreen: (cx, cy) => ({ x: offX + (cx + 0.5) * tile, y: offY + (cy + 0.5) * tile }),
  };
}

/**
 * Fit a room into a w×h box. `fill` is the fraction of the box the map may span
 * on its binding axis. `mode: "contain"` keeps the whole map visible (letterbox);
 * `mode: "cover"` scales up to fill the box, cropping overflow.
 */
export function fitRoom(room: RoomDef, w: number, h: number, fill: number, mode: "contain" | "cover"): RoomLayout {
  if (!w || !h) return { tile: 0, offX: 0, offY: 0 };
  const sx = (w * fill) / (room.width * ROOM_TILE);
  const sy = (h * fill) / (room.height * ROOM_TILE);
  const tile = (mode === "cover" ? Math.max(sx, sy) : Math.min(sx, sy)) * ROOM_TILE;
  return { tile, offX: (w - room.width * tile) / 2, offY: (h - room.height * tile) / 2 };
}

/** Paint a room onto a canvas exactly like the editor (trans sheet, 24px origin, floor→decor→wall, flip). */
export function drawRoom(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  room: RoomDef,
  dims: { w: number; h: number },
  layout: RoomLayout,
  vignette: number,
): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(dims.w * dpr);
  const H = Math.round(dims.h * dpr);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  const tile = layout.tile * dpr;
  const offX = layout.offX * dpr;
  const offY = layout.offY * dpr;
  const sorted = [...room.tiles].sort((a, b) => (LAYER_ORDER[a.layer] ?? 1) - (LAYER_ORDER[b.layer] ?? 1));
  for (const t of sorted) {
    const sx = ROOM_ORIGIN + t.c * ROOM_TILE;
    const sy = ROOM_ORIGIN + t.r * ROOM_TILE;
    const dx = offX + t.x * tile;
    const dy = offY + t.y * tile;
    if (t.flip) {
      ctx.save();
      ctx.translate(dx + tile, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, ROOM_TILE, ROOM_TILE, 0, 0, tile + 1, tile + 1);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, ROOM_TILE, ROOM_TILE, dx, dy, tile + 1, tile + 1);
    }
  }
  if (vignette > 0) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(0,0,0,${vignette})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}

/**
 * Combat-stage floor: renders an authored room scaled up to fill the arena,
 * pixel-crisp, behind the actors. Re-fits naturally on resize.
 */
export function RoomBackdrop({
  room,
  layout: layoutProp,
  fill = 1,
  mode = "cover",
  vignette = 0.62,
}: {
  room: RoomDef;
  /** explicit camera layout (e.g. from computeBattleStage); falls back to fit-to-box */
  layout?: RoomLayout;
  fill?: number;
  mode?: "contain" | "cover";
  vignette?: number;
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const fitted = useMemo(() => fitRoom(room, dims.w, dims.h, fill, mode), [room, dims, fill, mode]);
  const layout = layoutProp ?? fitted;

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setDims({ w: node.clientWidth, h: node.clientHeight }));
    ro.observe(node);
    setDims({ w: node.clientWidth, h: node.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dims.w || !layout.tile) return;
    let alive = true;
    void loadSheet().then((img) => {
      if (!alive || !img) return;
      drawRoom(canvas, img, room, dims, layout, vignette);
    });
    return () => {
      alive = false;
    };
  }, [room, dims, layout, vignette]);

  return (
    <div ref={wrapRef} className="hd-room-bg">
      <canvas ref={canvasRef} className="pixelated" />
    </div>
  );
}
