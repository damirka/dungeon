import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX, MouseEvent as ReactMouseEvent } from "react";
import type { BiomeId } from "../playtest/engine";
import { HERO_ID } from "../../game/spriteData";
import { SpriteActor } from "./SpriteActor";
import type { RoomDef } from "../../game/roomData";
import { drawRoom, loadSheet, pickRoom } from "./roomRender";
import { useGamepad } from "./useGamepad";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// How many rows (vertically) from the player battle spot trigger the encounter.
const ENCOUNTER_TRIGGER_ROWS = 3;

export function ExploreView({
  biome,
  level,
  kind,
  locationName,
  room: roomProp,
  triggerRow = null,
  startCell = null,
  hint,
  onEnter,
}: {
  biome: BiomeId;
  level: number;
  kind: "entrance" | "encounter" | "boss";
  locationName: string;
  room?: RoomDef;
  /** room-grid row of the player battle spot; entering within ±3 rows starts the fight */
  triggerRow?: number | null;
  /** where the hero starts this walk (defaults to the room spawn) */
  startCell?: { x: number; y: number } | null;
  hint?: string;
  onEnter: () => void;
}): JSX.Element {
  const room = useMemo(() => roomProp ?? pickRoom(biome, level, kind), [roomProp, biome, level, kind]);
  // default to the team's convention when a room hasn't mapped them: enter at the
  // bottom-center, exit through a top-center doorway.
  const exit = useMemo(() => room.doors[0] || { x: Math.floor(room.width / 2), y: 0 }, [room]);
  const start = useMemo(
    () => startCell || room.spawn || { x: Math.floor(room.width / 2), y: room.height - 1 },
    [startCell, room],
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState(start);
  const [facing, setFacing] = useState<"left" | "right">("right");
  const enteredRef = useRef(false);
  const [entered, setEntered] = useState(false);

  // movement blockers: the obstacle cells you mapped in the editor (never the exit)
  const blocked = useMemo(() => {
    const s = new Set<string>();
    for (const o of room.obstacles) s.add(`${o.x},${o.y}`);
    s.delete(`${exit.x},${exit.y}`);
    return s;
  }, [room, exit]);

  // zoomed-in tile size — show roughly 8.5 rows / 10.5 cols of the map at once
  const tile = useMemo(() => {
    const { w, h } = dims;
    if (!w || !h) return 0;
    return Math.max(34, Math.round(Math.min(h / 8.5, w / 10.5)));
  }, [dims]);

  const worldW = room.width * tile;
  const worldH = room.height * tile;

  const enter = useCallback(() => {
    if (enteredRef.current) return;
    enteredRef.current = true;
    setEntered(true);
    window.setTimeout(onEnter, 400);
  }, [onEnter]);

  // draw the full room once at the zoom scale (camera handled by translating the
  // world layer, so no per-step canvas redraw). The canvas IS the whole world, so
  // we hand drawRoom a zero-offset layout — same editor parity (trans sheet, 24px
  // origin, floor → decor → wall, flip) shared with the combat backdrop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tile) return;
    let alive = true;
    void loadSheet().then((img) => {
      if (!alive || !img) return;
      drawRoom(canvas, img, room, { w: worldW, h: worldH }, { tile, offX: 0, offY: 0 }, 0);
    });
    return () => {
      alive = false;
    };
  }, [room, tile, worldW, worldH]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => setDims({ w: node.clientWidth, h: node.clientHeight }));
    ro.observe(node);
    setDims({ w: node.clientWidth, h: node.clientHeight });
    return () => ro.disconnect();
  }, []);

  const move = useCallback(
    (dx: number, dy: number) => {
      if (dx < 0) setFacing("left");
      if (dx > 0) setFacing("right");
      setPos((p) => {
        const nx = Math.max(0, Math.min(room.width - 1, p.x + dx));
        const ny = Math.max(0, Math.min(room.height - 1, p.y + dy));
        if (blocked.has(`${nx},${ny}`)) return p;
        // encounter trigger: moving within ±N rows of the player battle spot
        if (triggerRow != null && Math.abs(ny - triggerRow) <= ENCOUNTER_TRIGGER_ROWS) {
          window.setTimeout(enter, 80);
        } else if (nx === exit.x && ny === exit.y) {
          window.setTimeout(enter, 110);
        }
        return { x: nx, y: ny };
      });
    },
    [room, blocked, exit, enter, triggerRow],
  );

  // mouse: click a tile to walk there (greedy stepping; direct input retargets/stops)
  const posRef = useRef(pos);
  posRef.current = pos;
  const walkTarget = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const target = walkTarget.current;
      if (!target) return;
      const p = posRef.current;
      const dx = Math.sign(target.x - p.x) as -1 | 0 | 1;
      const dy = Math.sign(target.y - p.y) as -1 | 0 | 1;
      if (!dx && !dy) {
        walkTarget.current = null;
        return;
      }
      const stepOk = (sx: number, sy: number) => {
        if (!sx && !sy) return false;
        const nx = p.x + sx;
        const ny = p.y + sy;
        if (nx < 0 || ny < 0 || nx >= room.width || ny >= room.height) return false;
        return !blocked.has(`${nx},${ny}`);
      };
      // prefer the axis with more distance left; sidestep on the other when blocked
      const primary: [number, number] = Math.abs(target.x - p.x) >= Math.abs(target.y - p.y) ? [dx, 0] : [0, dy];
      const secondary: [number, number] = primary[0] ? [0, dy] : [dx, 0];
      if (stepOk(...primary)) move(...primary);
      else if (stepOk(...secondary)) move(...secondary);
      else walkTarget.current = null;
    }, 120);
    return () => window.clearInterval(id);
  }, [move, blocked, room]);

  const onWorldClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!tile) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const scale = rect.width / worldW || 1; // CSS transforms don't change layout, but stay safe
      walkTarget.current = {
        x: clamp(Math.floor((event.clientX - rect.left) / (tile * scale)), 0, room.width - 1),
        y: clamp(Math.floor((event.clientY - rect.top) / (tile * scale)), 0, room.height - 1),
      };
    },
    [tile, worldW, room],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowright" || k === "d") { e.preventDefault(); walkTarget.current = null; move(1, 0); }
      else if (k === "arrowleft" || k === "a") { e.preventDefault(); walkTarget.current = null; move(-1, 0); }
      else if (k === "arrowup" || k === "w") { e.preventDefault(); walkTarget.current = null; move(0, -1); }
      else if (k === "arrowdown" || k === "s") { e.preventDefault(); walkTarget.current = null; move(0, 1); }
      else if (k === "enter" || k === " ") { e.preventDefault(); enter(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, enter]);

  // controller: d-pad / left stick walks, A (or Start) steps through the doorway
  useGamepad(
    useCallback(
      (event) => {
        if (event.kind === "move") {
          walkTarget.current = null;
          move(event.dx, event.dy);
        } else if (event.button === "a" || event.button === "start") {
          enter();
        }
      },
      [move, enter],
    ),
  );

  const heroSize = Math.round(tile * 0.8);
  const heroWX = (pos.x + 0.5) * tile;
  const heroWY = (pos.y + 0.5) * tile;
  const exitWX = (exit.x + 0.5) * tile;
  const exitWY = (exit.y + 0.5) * tile;

  // camera: center the hero, clamped so we never show past the map edges
  const camX = worldW <= dims.w ? (dims.w - worldW) / 2 : clamp(dims.w / 2 - heroWX, dims.w - worldW, 0);
  const camY = worldH <= dims.h ? (dims.h - worldH) / 2 : clamp(dims.h / 2 - heroWY, dims.h - worldH, 0);

  const cdx = exit.x - (room.width - 1) / 2;
  const cdy = exit.y - (room.height - 1) / 2;
  const arrow = Math.abs(cdy) >= Math.abs(cdx) ? (cdy < 0 ? "▲" : "▼") : cdx < 0 ? "◀" : "▶";

  return (
    <div className={`hd-explore ${entered ? "hd-explore-out" : ""}`} ref={wrapRef}>
      {tile > 0 && (
        <div
          className="hd-explore-world"
          onClick={onWorldClick}
          style={{ width: worldW, height: worldH, cursor: "pointer", transform: `translate(${Math.round(camX)}px, ${Math.round(camY)}px)` } as CSSProperties}
        >
          <canvas ref={canvasRef} className="pixelated" />
          <div className="hd-exit" style={{ left: exitWX, top: exitWY, width: tile * 1.5, height: tile * 1.5 }}>
            <span className="hd-exit-portal" />
            <span className="hd-exit-arrow">{arrow}</span>
          </div>
          <div className="hd-walker" style={{ left: heroWX, top: heroWY, width: heroSize, height: heroSize, transform: "translate(-50%, -58%)" }}>
            <SpriteActor id={HERO_ID} size={heroSize} state="idle" phase={2} flip={facing === "right"} />
          </div>
        </div>
      )}
      <div className="hd-explore-vignette" />
      <div className="hd-explore-hud">
        <div className="hd-explore-title">{kind === "entrance" ? `Floor ${level} — ${locationName}` : locationName}</div>
        <div className="hd-explore-hint">{hint || "WASD / arrows, click a tile, or gamepad — step into the doorway to descend"}</div>
      </div>
    </div>
  );
}
