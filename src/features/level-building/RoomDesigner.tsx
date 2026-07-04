import {
  Blocks,
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  Crosshair,
  DoorOpen,
  Eraser,
  FlipHorizontal,
  Gem,
  Grid2X2,
  Minus,
  MousePointer2,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paintbrush,
  Play,
  Plus,
  RotateCcw,
  Route,
  Save,
  Search,
  Skull,
  Sparkles,
  Square,
  Swords,
  Trash2,
  Redo2,
  Undo2,
  Upload,
  User,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent, MouseEvent } from "react";
import type { ResourceState } from "../../services/api";
import {
  DUNGEON_LEVELS,
  ROOM_KIND_OPTIONS,
  ROOM_PRESETS,
  ROOM_SPRITESHEET,
  ROOM_TILE_LAYERS,
  cellKey,
  createRoom,
  pointKey,
  resizeRoomGridFromEdge,
  presetById,
  sanitizeCatalog
} from "./roomCatalog";
import type {
  DungeonRoom,
  DungeonRoomCatalog,
  MappingTool,
  RoomKind,
  RoomPoint,
  RoomTile,
  RoomTileLayer,
  RoomTileRef,
  RoomView,
  VisualTool
} from "./roomCatalog";

const STORAGE_KEY = "dungeon-workbench.room-catalog";
const SPRITESHEET_STORAGE_KEY = "dungeon-workbench.room-spritesheet.v2";
const SAVE_ENDPOINT = "/api/save/rooms";
const ROOM_CELL_SIZE = 32;
const SHEET_SCALE = 2;
const DEFAULT_CANVAS_ZOOM = 1.45;
const MIN_CANVAS_ZOOM = 0.25;
const MAX_CANVAS_ZOOM = 2.5;
const MAX_HISTORY = 80;
const EDGE_RESIZE_THRESHOLD = 10;
const HERO_SPRITE = {
  url: "/assets/oryx_creatures.png",
  tileSize: 24,
  sheetWidth: 432,
  sheetHeight: 648,
  x: 0,
  y: 0
} as const;
const MOVE_KEYS: Record<string, RoomPoint> = {
  arrowup: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  arrowleft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  d: { x: 1, y: 0 }
};

const ROOM_LAYER_OPTIONS: Array<{ id: RoomTileLayer; label: string; hotkey: string; Icon: typeof Grid2X2 }> = [
  { id: "floor", label: "Floor", hotkey: "1", Icon: Grid2X2 },
  { id: "wall", label: "Wall", hotkey: "2", Icon: Blocks },
  { id: "decor", label: "Decor", hotkey: "3", Icon: Sparkles }
];
const ROOM_RENDER_LAYERS: RoomTileLayer[] = ["floor", "decor", "wall"];

type SaveStatus =
  | { state: "idle"; label: string }
  | { state: "saving"; label: string }
  | { state: "saved"; label: string }
  | { state: "failed"; label: string };
type ResizeMode = "east" | "west" | "south" | "north" | "north-east" | "north-west" | "south-east" | "south-west";

interface RoomDesignerProps {
  roomCatalog: ResourceState<DungeonRoomCatalog>;
}

interface SheetSize {
  width: number;
  height: number;
}

interface ResizeDrag {
  mode: ResizeMode;
  startX: number;
  startY: number;
  startRoom: DungeonRoom;
  latestWidth: number;
  latestHeight: number;
}

interface PaletteTile {
  key: string;
  tile: RoomTileRef;
}

function readLocalCatalog() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<DungeonRoomCatalog>) : null;
  } catch {
    return null;
  }
}

function readLocalSpritesheet() {
  try {
    const source = window.localStorage.getItem(SPRITESHEET_STORAGE_KEY) || "";
    return source === "/assets/oryx_world2.png" || source === "/room-assets/oryx_world2.png" ? "" : source;
  } catch {
    return "";
  }
}

function cloneRoom(room: DungeonRoom): DungeonRoom {
  return JSON.parse(JSON.stringify(room)) as DungeonRoom;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function splitTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function samePoint(point: RoomPoint | null, x: number, y: number) {
  return Boolean(point && point.x === x && point.y === y);
}

function pointInsideRoom(room: DungeonRoom, point: RoomPoint) {
  return point.x >= 0 && point.y >= 0 && point.x < room.width && point.y < room.height;
}

function pointIsObstacle(room: DungeonRoom, point: RoomPoint) {
  return room.obstacles.some((obstacle) => obstacle.x === point.x && obstacle.y === point.y);
}

function pointIsDoor(room: DungeonRoom, point: RoomPoint) {
  return room.doors.some((door) => door.x === point.x && door.y === point.y);
}

function heroCanEnter(room: DungeonRoom, point: RoomPoint) {
  return pointInsideRoom(room, point) && !pointIsObstacle(room, point);
}

function findPlayStart(room: DungeonRoom): RoomPoint {
  const candidates: RoomPoint[] = [];
  if (room.spawn) {
    candidates.push(room.spawn);
  }
  candidates.push({ x: Math.floor(room.width / 2), y: Math.floor(room.height / 2) });
  for (let y = 0; y < room.height; y += 1) {
    for (let x = 0; x < room.width; x += 1) {
      candidates.push({ x, y });
    }
  }
  return candidates.find((point) => heroCanEnter(room, point)) || { x: 0, y: 0 };
}

function removePoint(points: RoomPoint[], x: number, y: number) {
  return points.filter((point) => point.x !== x || point.y !== y);
}

function togglePoint(points: RoomPoint[], point: RoomPoint) {
  return points.some((item) => item.x === point.x && item.y === point.y)
    ? removePoint(points, point.x, point.y)
    : [...points, point].sort((a, b) => a.y - b.y || a.x - b.x);
}

function tileStyle(
  tile: RoomTileRef,
  sheetSize: SheetSize,
  sheetSource: string,
  renderedTileSize = ROOM_CELL_SIZE,
  flipX = false
): CSSProperties {
  const scale = renderedTileSize / ROOM_SPRITESHEET.tileSize;
  const sourceX = ROOM_SPRITESHEET.originX + tile.col * ROOM_SPRITESHEET.tileSize;
  const sourceY = ROOM_SPRITESHEET.originY + tile.row * ROOM_SPRITESHEET.tileSize;
  return {
    backgroundImage: `url(${sheetSource})`,
    backgroundPosition: `-${sourceX * scale}px -${sourceY * scale}px`,
    backgroundSize: `${sheetSize.width * scale}px ${sheetSize.height * scale}px`,
    backgroundRepeat: "no-repeat",
    transform: flipX ? "scaleX(-1)" : undefined,
    transformOrigin: "center",
    imageRendering: "pixelated"
  };
}

function heroSpriteStyle(renderedTileSize: number): CSSProperties {
  const scale = renderedTileSize / HERO_SPRITE.tileSize;
  return {
    width: renderedTileSize,
    height: renderedTileSize,
    backgroundImage: `url(${HERO_SPRITE.url})`,
    backgroundPosition: `-${HERO_SPRITE.x * scale}px -${HERO_SPRITE.y * scale}px`,
    backgroundSize: `${HERO_SPRITE.sheetWidth * scale}px ${HERO_SPRITE.sheetHeight * scale}px`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated"
  };
}

function kindIcon(kind: RoomKind) {
  if (kind === "entrance") {
    return DoorOpen;
  }
  if (kind === "treasury") {
    return Gem;
  }
  if (kind === "special") {
    return Sparkles;
  }
  if (kind === "passage") {
    return Route;
  }
  return Swords;
}

function markerIcon(marker: MappingTool | "paint" | "erase") {
  if (marker === "door") {
    return DoorOpen;
  }
  if (marker === "spawn") {
    return Crosshair;
  }
  if (marker === "player") {
    return User;
  }
  if (marker === "enemy") {
    return Skull;
  }
  if (marker === "clear" || marker === "erase") {
    return Eraser;
  }
  if (marker === "paint") {
    return Paintbrush;
  }
  return Blocks;
}

function markerClass(marker: "obstacle" | "door" | "spawn" | "player" | "enemy") {
  if (marker === "door") {
    return "border-sky-300 bg-sky-500/90 text-white";
  }
  if (marker === "spawn") {
    return "border-emerald-300 bg-emerald-500/90 text-white";
  }
  if (marker === "player") {
    return "border-violet-300 bg-violet-500/90 text-white";
  }
  if (marker === "enemy") {
    return "border-rose-300 bg-rose-500/90 text-white";
  }
  return "border-amber-300 bg-amber-500/90 text-neutral-100";
}

function roomLayer(tile: RoomTile): RoomTileLayer {
  return ROOM_TILE_LAYERS.includes(tile.layer) ? tile.layer : "floor";
}

function sortRoomTiles(tiles: RoomTile[]) {
  const layerOrder = new Map(ROOM_TILE_LAYERS.map((layer, index) => [layer, index]));
  return [...tiles].sort(
    (a, b) => a.y - b.y || a.x - b.x || (layerOrder.get(roomLayer(a)) ?? 0) - (layerOrder.get(roomLayer(b)) ?? 0)
  );
}

function cursorForResizeMode(mode: ResizeMode | null) {
  if (!mode) {
    return undefined;
  }
  if (mode === "east" || mode === "west") {
    return "ew-resize";
  }
  if (mode === "north" || mode === "south") {
    return "ns-resize";
  }
  if (mode === "north-east" || mode === "south-west") {
    return "nesw-resize";
  }
  return "nwse-resize";
}

function withUpdatedRoom(room: DungeonRoom) {
  return { ...room, updated_at: new Date().toISOString() };
}

function catalogSnapshot(catalog: DungeonRoomCatalog) {
  return {
    ...catalog,
    curation: {
      ...(catalog.curation || {}),
      latest_live_update_seen: new Date().toISOString(),
      latest_live_save_source: "room_designer"
    }
  };
}

function timestampValue(value: unknown) {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) {
    return 0;
  }
  // Ignore implausible far-future timestamps (clock skew or bad data). Otherwise
  // a single bogus value would win the per-room merge forever and block real
  // edits from any browser. Treating it as 0 lets the next genuine edit recover.
  if (time > Date.now() + 24 * 60 * 60 * 1000) {
    return 0;
  }
  return time;
}

function catalogTimestamp(catalog: Partial<DungeonRoomCatalog> | null) {
  if (!catalog) {
    return 0;
  }
  const curation = catalog.curation || {};
  const roomStamp = Array.isArray(catalog.rooms)
    ? Math.max(0, ...catalog.rooms.map((room) => timestampValue(room.updated_at)))
    : 0;
  return Math.max(
    timestampValue(curation.latest_live_update_seen),
    timestampValue(curation.latest_live_save_at),
    roomStamp
  );
}

/**
 * Merge the browser's local draft with the saved server catalog PER ROOM, taking
 * whichever copy of each room was edited most recently (room.updated_at). This is
 * the key to cross-browser persistence: two sessions (e.g. different dev-server
 * ports → separate localStorage) share one data file, and a whole-catalog
 * last-write-wins would let a stale browser overwrite another's rooms. A per-room
 * merge keeps each room's newest edit, so markers authored anywhere survive.
 *
 * Note: a room present locally but absent on the server is kept (treated as a
 * local-only draft), so cross-browser *deletions* don't propagate automatically.
 * That's the safe trade-off — favour never losing authored data.
 */
function selectInitialCatalog(
  localCatalog: Partial<DungeonRoomCatalog> | null,
  serverCatalog: DungeonRoomCatalog | null
) {
  if (!localCatalog) {
    return serverCatalog;
  }
  if (!serverCatalog) {
    return localCatalog;
  }
  const localRooms: DungeonRoom[] = Array.isArray(localCatalog.rooms) ? localCatalog.rooms : [];
  const serverRooms: DungeonRoom[] = Array.isArray(serverCatalog.rooms) ? serverCatalog.rooms : [];
  const localById = new Map<string, DungeonRoom>();
  for (const room of localRooms) {
    if (room?.id) localById.set(room.id, room);
  }
  const matched = new Set<string>();
  const mergedRooms: DungeonRoom[] = serverRooms.map((serverRoom) => {
    const id = serverRoom?.id;
    if (!id) return serverRoom;
    matched.add(id);
    const localRoom = localById.get(id);
    return localRoom && timestampValue(localRoom.updated_at) > timestampValue(serverRoom.updated_at)
      ? localRoom
      : serverRoom;
  });
  for (const room of localRooms) {
    if (!room?.id || !matched.has(room.id)) {
      mergedRooms.push(room);
    }
  }
  const base = catalogTimestamp(localCatalog) >= catalogTimestamp(serverCatalog) ? localCatalog : serverCatalog;
  return { ...base, rooms: mergedRooms };
}

function tileIsNotEmpty(data: Uint8ClampedArray) {
  let active = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha > 12) {
      active += 1;
    }
  }
  return active > data.length / 4 * 0.02;
}

export function RoomDesigner({ roomCatalog }: RoomDesignerProps) {
  const [catalog, setCatalog] = useState<DungeonRoomCatalog>(() => sanitizeCatalog());
  const [hydrated, setHydrated] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState(catalog.rooms[0]?.id || "");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<RoomKind | "all">("all");
  const [levelFilter, setLevelFilter] = useState<number | "all">("all");
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [view, setView] = useState<RoomView>("visuals");
  const [visualTool, setVisualTool] = useState<VisualTool>("paint");
  const [activeLayer, setActiveLayer] = useState<RoomTileLayer>("floor");
  const [tileFlipped, setTileFlipped] = useState(false);
  const [mappingTool, setMappingTool] = useState<MappingTool>("obstacle");
  const [canvasZoom, setCanvasZoom] = useState(DEFAULT_CANVAS_ZOOM);
  const [fitMode, setFitMode] = useState(true);
  const [libOpen, setLibOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const selectedTileButtonRef = useRef<HTMLButtonElement | null>(null);
  const [tileQuery, setTileQuery] = useState("");
  const [history, setHistory] = useState<DungeonRoom[]>([]);
  const [redoStack, setRedoStack] = useState<DungeonRoom[]>([]);
  const [paletteTiles, setPaletteTiles] = useState<PaletteTile[]>([]);
  const [selectedTile, setSelectedTile] = useState<RoomTileRef>({ sheet: "oryx_world2", col: 0, row: 0 });
  const [playMode, setPlayMode] = useState(false);
  const [heroPosition, setHeroPosition] = useState<RoomPoint | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle", label: "Local draft" });
  const [sheetSource, setSheetSource] = useState(() => readLocalSpritesheet() || ROOM_SPRITESHEET.url);
  const [sheetState, setSheetState] = useState<"loading" | "ready" | "missing">("loading");
  const [sheetSize, setSheetSize] = useState<SheetSize>({
    width: ROOM_SPRITESHEET.fallbackWidth,
    height: ROOM_SPRITESHEET.fallbackHeight
  });
  const didHydrate = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const resizeDrag = useRef<ResizeDrag | null>(null);
  const [resizeHover, setResizeHover] = useState<ResizeMode | null>(null);
  const [hoverCell, setHoverCell] = useState<RoomPoint | null>(null);

  useEffect(() => {
    if (didHydrate.current || roomCatalog.state === "loading") {
      return;
    }
    const localCatalog = readLocalCatalog();
    const serverCatalog = roomCatalog.state === "ready" ? roomCatalog.data : null;
    const initial = sanitizeCatalog(selectInitialCatalog(localCatalog, serverCatalog));
    didHydrate.current = true;
    setCatalog(initial);
    setActiveRoomId(initial.rooms[0]?.id || "");
    setHydrated(true);
  }, [roomCatalog]);

  const activeRoom = useMemo(
    () => catalog.rooms.find((room) => room.id === activeRoomId) || catalog.rooms[0],
    [activeRoomId, catalog.rooms]
  );

  useEffect(() => {
    if (!activeRoom && catalog.rooms[0]) {
      setActiveRoomId(catalog.rooms[0].id);
    }
    if (hydrated && !activeRoom && catalog.rooms.length === 0) {
      setActiveRoomId("");
      setShowPresetPicker(true);
    }
  }, [activeRoom, catalog.rooms, hydrated]);

  useEffect(() => {
    setHistory([]);
    setRedoStack([]);
    setPlayMode(false);
    setHeroPosition(null);
  }, [activeRoomId]);

  const saveToServer = useCallback(
    async (snapshot: DungeonRoomCatalog, signal?: AbortSignal, attempt = 0): Promise<void> => {
      setSaveStatus({ state: "saving", label: attempt > 0 ? "Retrying save" : "Saving" });
      try {
        const response = await fetch(SAVE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
          signal
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const result = (await response.json()) as { rooms?: number };
        setSaveStatus({ state: "saved", label: `Saved ${result.rooms ?? snapshot.rooms.length}` });
      } catch (error) {
        if ((error as Error).name === "AbortError" || signal?.aborted) {
          // a newer edit superseded this save; it will be saved by its own pass
          return;
        }
        // transient backend hiccup — retry a couple of times before giving up
        if (attempt < 3) {
          window.setTimeout(() => {
            void saveToServer(snapshot, signal, attempt + 1);
          }, 800 * (attempt + 1));
          return;
        }
        setSaveStatus({ state: "failed", label: "Saved locally" });
      }
    },
    []
  );

  const latestSnapshot = useRef<DungeonRoomCatalog | null>(null);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const snapshot = catalogSnapshot(catalog);
    latestSnapshot.current = snapshot;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // localStorage may be full (e.g. a large uploaded spritesheet). The server
      // save below is the durable copy, so never let this break autosave.
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void saveToServer(snapshot, controller.signal);
    }, 650);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [catalog, hydrated, saveToServer]);

  // Flush the latest edits to the server when the tab is hidden or the page is
  // unloaded (close / reload / navigate). The debounced save above is aborted on
  // unmount, so without this the final edits could reach localStorage but never
  // the data file — which is how cross-session work gets lost. sendBeacon runs
  // reliably during unload.
  useEffect(() => {
    const flush = () => {
      const snapshot = latestSnapshot.current;
      if (!snapshot || typeof navigator.sendBeacon !== "function") {
        return;
      }
      try {
        navigator.sendBeacon(
          SAVE_ENDPOINT,
          new Blob([JSON.stringify(snapshot)], { type: "application/json" })
        );
      } catch {
        // best effort — localStorage still holds the latest copy
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const tileSize = ROOM_SPRITESHEET.tileSize;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        setSheetState("missing");
        return;
      }
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0);
      const tiles: PaletteTile[] = [];
      const cols = Math.floor((width - ROOM_SPRITESHEET.originX) / tileSize);
      const rows = Math.floor((height - ROOM_SPRITESHEET.originY) / tileSize);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const sourceX = ROOM_SPRITESHEET.originX + col * tileSize;
          const sourceY = ROOM_SPRITESHEET.originY + row * tileSize;
          const data = context.getImageData(sourceX, sourceY, tileSize, tileSize).data;
          if (tileIsNotEmpty(data)) {
            tiles.push({ key: `${col}:${row}`, tile: { sheet: "oryx_world2", col, row } });
          }
        }
      }
      setSheetSize({ width, height });
      setPaletteTiles(tiles);
      setSheetState("ready");
      if (!tiles.some((item) => item.tile.col === selectedTile.col && item.tile.row === selectedTile.row) && tiles[0]) {
        setSelectedTile(tiles[0].tile);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setSheetState("missing");
      }
    };
    setSheetState("loading");
    image.src = sheetSource;
    return () => {
      cancelled = true;
    };
  }, [selectedTile.col, selectedTile.row, sheetSource]);

  // Track the canvas viewport so the room can be scaled to fit it.
  useEffect(() => {
    const node = canvasViewportRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => setViewport({ w: node.clientWidth, h: node.clientHeight }));
    observer.observe(node);
    setViewport({ w: node.clientWidth, h: node.clientHeight });
    return () => observer.disconnect();
  }, [activeRoomId, libOpen, paletteOpen]);

  // In fit mode, keep the whole room visible as the viewport / room size changes.
  useEffect(() => {
    if (!fitMode || !activeRoom || viewport.w < 40 || viewport.h < 40) {
      return;
    }
    const pad = 28;
    const fit = Math.min(
      (viewport.w - pad) / (activeRoom.width * ROOM_CELL_SIZE),
      (viewport.h - pad) / (activeRoom.height * ROOM_CELL_SIZE)
    );
    setCanvasZoom(clamp(fit, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM));
  }, [fitMode, activeRoom, viewport.w, viewport.h]);

  const zoomBy = useCallback((delta: number) => {
    setFitMode(false);
    setCanvasZoom((value) => clamp(value + delta, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM));
  }, []);

  // Reveal the active tile in the palette (e.g. after the eyedropper picks one).
  useEffect(() => {
    selectedTileButtonRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedTile.col, selectedTile.row]);

  // Recompute fit from the live viewport (used by the Fit button so it works even
  // when fit mode is already on, and on mount once layout settles).
  const fitNow = useCallback(() => {
    setFitMode(true);
    const node = canvasViewportRef.current;
    if (!node || !activeRoom) {
      return;
    }
    const w = node.clientWidth;
    const h = node.clientHeight;
    if (w < 40 || h < 40) {
      return;
    }
    const pad = 28;
    const fit = Math.min((w - pad) / (activeRoom.width * ROOM_CELL_SIZE), (h - pad) / (activeRoom.height * ROOM_CELL_SIZE));
    setCanvasZoom(clamp(fit, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM));
  }, [activeRoom]);

  const updateActiveRoom = useCallback(
    (updater: (room: DungeonRoom) => DungeonRoom, options: { recordHistory?: boolean } = {}) => {
      setCatalog((current) => ({
        ...current,
        rooms: current.rooms.map((room) => {
          if (room.id !== activeRoomId) {
            return room;
          }
          const nextRoom = withUpdatedRoom(updater(room));
          if (options.recordHistory !== false && JSON.stringify(nextRoom) !== JSON.stringify(room)) {
            setHistory((items) => [cloneRoom(room), ...items].slice(0, MAX_HISTORY));
            setRedoStack([]);
          }
          return nextRoom;
        })
      }));
    },
    [activeRoomId]
  );

  const handleUndo = useCallback(() => {
    const previous = history[0];
    if (!previous) {
      return;
    }
    setCatalog((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== activeRoomId) {
          return room;
        }
        setRedoStack((items) => [cloneRoom(room), ...items].slice(0, MAX_HISTORY));
        return withUpdatedRoom(cloneRoom(previous));
      })
    }));
    setHistory((items) => items.slice(1));
  }, [activeRoomId, history]);

  const handleRedo = useCallback(() => {
    const next = redoStack[0];
    if (!next) {
      return;
    }
    setCatalog((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== activeRoomId) {
          return room;
        }
        setHistory((items) => [cloneRoom(room), ...items].slice(0, MAX_HISTORY));
        return withUpdatedRoom(cloneRoom(next));
      })
    }));
    setRedoStack((items) => items.slice(1));
  }, [activeRoomId, redoStack]);

  const handleHeroStep = useCallback(
    (delta: RoomPoint) => {
      if (!activeRoom) {
        return;
      }
      const origin = heroPosition && heroCanEnter(activeRoom, heroPosition) ? heroPosition : findPlayStart(activeRoom);
      const next = { x: origin.x + delta.x, y: origin.y + delta.y };
      if (!heroCanEnter(activeRoom, next)) {
        setHeroPosition(origin);
        return;
      }
      setHeroPosition(next);
      if (pointIsDoor(activeRoom, next)) {
        setPlayMode(false);
      }
    },
    [activeRoom, heroPosition]
  );

  const handlePlayToggle = () => {
    if (!activeRoom) {
      return;
    }
    setPlayMode((current) => {
      if (current) {
        setHeroPosition(null);
        return false;
      }
      setView("mapping");
      setHeroPosition(findPlayStart(activeRoom));
      return true;
    });
  };

  const handlePlayReset = () => {
    if (activeRoom) {
      setHeroPosition(findPlayStart(activeRoom));
    }
  };

  useEffect(() => {
    if (!playMode || !activeRoom) {
      return;
    }
    setHeroPosition((current) => (current && heroCanEnter(activeRoom, current) ? current : findPlayStart(activeRoom)));
  }, [activeRoom, playMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) {
        return;
      }
      const key = event.key.toLowerCase();
      const heroMove = MOVE_KEYS[key];
      if (playMode && heroMove) {
        event.preventDefault();
        handleHeroStep(heroMove);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        setView((current) => (current === "visuals" ? "mapping" : "visuals"));
      }
      const layer = ROOM_LAYER_OPTIONS.find((option) => option.hotkey === event.key);
      if (layer) {
        event.preventDefault();
        setView("visuals");
        setActiveLayer(layer.id);
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setView("visuals");
        setTileFlipped((current) => !current);
      }
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && key === "z" && event.shiftKey) {
        event.preventDefault();
        handleRedo();
      } else if (modifier && key === "z") {
        event.preventDefault();
        handleUndo();
      } else if (event.ctrlKey && key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleHeroStep, handleRedo, handleUndo, playMode]);

  const filteredRooms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.rooms.filter((room) => {
      const matchesQuery =
        !needle ||
        room.name.toLowerCase().includes(needle) ||
        room.id.toLowerCase().includes(needle) ||
        room.tags.some((tag) => tag.toLowerCase().includes(needle));
      const matchesKind = kindFilter === "all" || room.room_kind === kindFilter;
      const matchesLevel = levelFilter === "all" || room.dungeon_levels.includes(levelFilter);
      return matchesQuery && matchesKind && matchesLevel;
    });
  }, [catalog.rooms, kindFilter, levelFilter, query]);

  const filteredPaletteTiles = useMemo(() => {
    const needle = tileQuery.trim().toLowerCase();
    if (!needle) {
      return paletteTiles;
    }
    return paletteTiles.filter((item) => item.key.includes(needle) || `tile ${item.tile.col} ${item.tile.row}`.includes(needle));
  }, [paletteTiles, tileQuery]);

  const tileMap = useMemo(() => {
    const tiles = new Map<string, Partial<Record<RoomTileLayer, RoomTile>>>();
    for (const tile of activeRoom?.tiles || []) {
      const key = cellKey(tile.x, tile.y);
      const layers = tiles.get(key) || {};
      layers[roomLayer(tile)] = tile;
      tiles.set(key, layers);
    }
    return tiles;
  }, [activeRoom?.tiles]);

  const obstacleSet = useMemo(
    () => new Set((activeRoom?.obstacles || []).map(pointKey)),
    [activeRoom?.obstacles]
  );
  const doorSet = useMemo(() => new Set((activeRoom?.doors || []).map(pointKey)), [activeRoom?.doors]);
  const enemySpawnSet = useMemo(() => new Set((activeRoom?.enemy_spawns || []).map(pointKey)), [activeRoom?.enemy_spawns]);

  const cells = useMemo(() => {
    if (!activeRoom) {
      return [];
    }
    return Array.from({ length: activeRoom.width * activeRoom.height }, (_, index) => ({
      x: index % activeRoom.width,
      y: Math.floor(index / activeRoom.width)
    }));
  }, [activeRoom]);

  const handleCreateRoom = (presetId: string) => {
    const room = createRoom(presetById(presetId), catalog.rooms.length + 1);
    setCatalog((current) => ({ ...current, rooms: [room, ...current.rooms] }));
    setActiveRoomId(room.id);
    setShowPresetPicker(false);
  };

  const handleDuplicateRoom = () => {
    if (!activeRoom) {
      return;
    }
    const room = withUpdatedRoom({
      ...cloneRoom(activeRoom),
      id: `room-${Date.now().toString(36)}`,
      name: `${activeRoom.name} Copy`
    });
    setCatalog((current) => ({ ...current, rooms: [room, ...current.rooms] }));
    setActiveRoomId(room.id);
  };

  const handleDeleteRoom = () => {
    if (!activeRoom) {
      return;
    }
    if (!window.confirm(`Delete "${activeRoom.name}"? This cannot be undone.`)) {
      return;
    }
    const remaining = catalog.rooms.filter((room) => room.id !== activeRoom.id);
    setCatalog((current) => ({ ...current, rooms: current.rooms.filter((room) => room.id !== activeRoom.id) }));
    setActiveRoomId(remaining[0]?.id || "");
    if (remaining.length === 0) {
      setShowPresetPicker(true);
    }
  };

  const getResizeModeFromPointer = useCallback((clientX: number, clientY: number): ResizeMode | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const insideExpanded =
      clientX >= rect.left - EDGE_RESIZE_THRESHOLD &&
      clientX <= rect.right + EDGE_RESIZE_THRESHOLD &&
      clientY >= rect.top - EDGE_RESIZE_THRESHOLD &&
      clientY <= rect.bottom + EDGE_RESIZE_THRESHOLD;
    if (!insideExpanded) {
      return null;
    }
    const nearLeft = Math.abs(clientX - rect.left) <= EDGE_RESIZE_THRESHOLD;
    const nearRight = Math.abs(clientX - rect.right) <= EDGE_RESIZE_THRESHOLD;
    const nearTop = Math.abs(clientY - rect.top) <= EDGE_RESIZE_THRESHOLD;
    const nearBottom = Math.abs(clientY - rect.bottom) <= EDGE_RESIZE_THRESHOLD;
    const horizontal = nearLeft ? "west" : nearRight ? "east" : "";
    const vertical = nearTop ? "north" : nearBottom ? "south" : "";
    if (horizontal && vertical) {
      return `${vertical}-${horizontal}` as ResizeMode;
    }
    return (horizontal || vertical || null) as ResizeMode | null;
  }, []);

  const handleResizeStart = (mode: ResizeMode, event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeRoom) {
      return;
    }
    const startingRoom = cloneRoom(activeRoom);
    setHistory((items) => [startingRoom, ...items].slice(0, MAX_HISTORY));
    setRedoStack([]);
    resizeDrag.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRoom: startingRoom,
      latestWidth: startingRoom.width,
      latestHeight: startingRoom.height
    };

    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      const drag = resizeDrag.current;
      if (!drag) {
        return;
      }
      const cellSize = Math.max(1, Math.round(ROOM_CELL_SIZE * canvasZoom));
      const deltaX = Math.round((moveEvent.clientX - drag.startX) / cellSize);
      const deltaY = Math.round((moveEvent.clientY - drag.startY) / cellSize);
      const pullsWest = drag.mode.includes("west");
      const pullsEast = drag.mode.includes("east");
      const pullsNorth = drag.mode.includes("north");
      const pullsSouth = drag.mode.includes("south");
      const rawWidth = pullsWest
        ? drag.startRoom.width - deltaX
        : pullsEast
          ? drag.startRoom.width + deltaX
          : drag.startRoom.width;
      const nextWidthBase = Math.max(3, rawWidth);
      const nextWidth =
        nextWidthBase % 2 === 0
          ? Math.max(3, nextWidthBase + (nextWidthBase > drag.startRoom.width ? 1 : -1))
          : nextWidthBase;
      const nextHeight = Math.max(
        3,
        pullsNorth
          ? drag.startRoom.height - deltaY
          : pullsSouth
            ? drag.startRoom.height + deltaY
            : drag.startRoom.height
      );
      if (nextWidth === drag.latestWidth && nextHeight === drag.latestHeight) {
        return;
      }
      drag.latestWidth = nextWidth;
      drag.latestHeight = nextHeight;
      const shiftX = pullsWest ? nextWidth - drag.startRoom.width : 0;
      const shiftY = pullsNorth ? nextHeight - drag.startRoom.height : 0;
      const resized = resizeRoomGridFromEdge(drag.startRoom, nextWidth, nextHeight, shiftX, shiftY);
      setCatalog((current) => ({
        ...current,
        rooms: current.rooms.map((room) => (room.id === drag.startRoom.id ? resized : room))
      }));
    };

    const handleEnd = () => {
      resizeDrag.current = null;
      setResizeHover(null);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
  };

  const handleMapMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (resizeDrag.current) {
      return;
    }
    if (playMode) {
      setResizeHover(null);
      return;
    }
    setResizeHover(getResizeModeFromPointer(event.clientX, event.clientY));
  };

  const handleMapMouseDownCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (playMode || event.button !== 0) {
      return;
    }
    const mode = getResizeModeFromPointer(event.clientX, event.clientY);
    if (mode) {
      handleResizeStart(mode, event);
    }
  };

  const handleLevelToggle = (level: number) => {
    updateActiveRoom((room) => {
      const hasLevel = room.dungeon_levels.includes(level);
      const levels = hasLevel
        ? room.dungeon_levels.filter((item) => item !== level)
        : [...room.dungeon_levels, level].sort();
      return { ...room, dungeon_levels: levels.length > 0 ? levels : [level] };
    });
  };

  const paintVisualCell = (x: number, y: number, forceTool?: VisualTool) => {
    const tool = forceTool || visualTool;
    updateActiveRoom((room) => {
      const nextTiles = room.tiles.filter((tile) => tile.x !== x || tile.y !== y || roomLayer(tile) !== activeLayer);
      if (tool === "erase") {
        return { ...room, tiles: nextTiles };
      }
      return {
        ...room,
        tiles: sortRoomTiles([
          ...nextTiles,
          { x, y, layer: activeLayer, ...(tileFlipped ? { flip_x: true } : {}), tile: selectedTile }
        ])
      };
    });
  };

  const paintMappingCell = (x: number, y: number, forceTool?: MappingTool) => {
    const point = { x, y };
    const tool = forceTool || mappingTool;
    updateActiveRoom((room) => {
      const clearedBattle = samePoint(room.battle_spawn, x, y) ? null : room.battle_spawn;
      const enemiesWithout = removePoint(room.enemy_spawns, x, y);
      if (tool === "clear") {
        return {
          ...room,
          obstacles: removePoint(room.obstacles, x, y),
          doors: removePoint(room.doors, x, y),
          spawn: samePoint(room.spawn, x, y) ? null : room.spawn,
          battle_spawn: clearedBattle,
          enemy_spawns: enemiesWithout
        };
      }
      if (tool === "spawn") {
        return {
          ...room,
          obstacles: removePoint(room.obstacles, x, y),
          doors: removePoint(room.doors, x, y),
          spawn: samePoint(room.spawn, x, y) ? null : point
        };
      }
      if (tool === "player") {
        // the player's battle position must stand on open ground, alone
        return {
          ...room,
          obstacles: removePoint(room.obstacles, x, y),
          doors: removePoint(room.doors, x, y),
          enemy_spawns: enemiesWithout,
          battle_spawn: samePoint(room.battle_spawn, x, y) ? null : point
        };
      }
      if (tool === "enemy") {
        // enemy candidate cells must be open ground and not the player's cell
        return {
          ...room,
          obstacles: removePoint(room.obstacles, x, y),
          doors: removePoint(room.doors, x, y),
          battle_spawn: clearedBattle,
          enemy_spawns: togglePoint(room.enemy_spawns, point)
        };
      }
      if (tool === "door") {
        return {
          ...room,
          obstacles: removePoint(room.obstacles, x, y),
          doors: togglePoint(room.doors, point),
          spawn: samePoint(room.spawn, x, y) ? null : room.spawn,
          battle_spawn: clearedBattle,
          enemy_spawns: enemiesWithout
        };
      }
      return {
        ...room,
        obstacles: togglePoint(room.obstacles, point),
        doors: removePoint(room.doors, x, y),
        spawn: samePoint(room.spawn, x, y) ? null : room.spawn,
        battle_spawn: clearedBattle,
        enemy_spawns: enemiesWithout
      };
    });
  };

  const pickVisualCell = (x: number, y: number) => {
    if (resizeDrag.current) {
      return;
    }
    const layerTiles = tileMap.get(cellKey(x, y));
    const pickedLayer =
      (layerTiles?.[activeLayer] ? activeLayer : [...ROOM_RENDER_LAYERS].reverse().find((layer) => Boolean(layerTiles?.[layer]))) ||
      null;
    if (!pickedLayer) {
      return;
    }
    const pickedTile = layerTiles?.[pickedLayer];
    if (!pickedTile) {
      return;
    }
    setSelectedTile(pickedTile.tile);
    setActiveLayer(pickedLayer);
    setTileFlipped(pickedTile.flip_x === true);
    setVisualTool("paint");
    setView("visuals");
    setTileQuery(""); // ensure the picked tile isn't hidden by an active filter
  };

  const handleCellAction = (x: number, y: number, forceErase = false) => {
    if (playMode || resizeDrag.current) {
      return;
    }
    if (view === "visuals") {
      paintVisualCell(x, y, forceErase ? "erase" : undefined);
    } else {
      paintMappingCell(x, y, forceErase ? "clear" : undefined);
    }
  };

  const handleDragCell = (event: MouseEvent<HTMLButtonElement>, x: number, y: number) => {
    if (playMode || resizeDrag.current) {
      return;
    }
    if (event.buttons !== 1 && event.buttons !== 2) {
      return;
    }
    handleCellAction(x, y, event.buttons === 2);
  };

  const handleFillEmpty = () => {
    updateActiveRoom((room) => {
      const existing = new Set(
        room.tiles.filter((tile) => roomLayer(tile) === activeLayer).map((tile) => cellKey(tile.x, tile.y))
      );
      const additions: RoomTile[] = [];
      for (let y = 0; y < room.height; y += 1) {
        for (let x = 0; x < room.width; x += 1) {
          if (!existing.has(cellKey(x, y))) {
            additions.push({ x, y, layer: activeLayer, ...(tileFlipped ? { flip_x: true } : {}), tile: selectedTile });
          }
        }
      }
      return { ...room, tiles: sortRoomTiles([...room.tiles, ...additions]) };
    });
  };

  const handleClearLayer = () => {
    updateActiveRoom((room) => ({ ...room, tiles: room.tiles.filter((tile) => roomLayer(tile) !== activeLayer) }));
  };

  const handleSheetUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result || "");
      if (!source) {
        return;
      }
      setSheetSource(source);
      try {
        window.localStorage.setItem(SPRITESHEET_STORAGE_KEY, source);
      } catch {
        setSaveStatus({ state: "failed", label: "Sheet loaded for session" });
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleResetSheet = () => {
    try {
      window.localStorage.removeItem(SPRITESHEET_STORAGE_KEY);
    } catch {
      // Browser storage may be unavailable in private contexts.
    }
    setSheetSource(ROOM_SPRITESHEET.url);
  };

  const handleSaveNow = () => {
    const snapshot = catalogSnapshot(catalog);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    void saveToServer(snapshot);
  };

  const SelectedKindIcon = activeRoom ? kindIcon(activeRoom.room_kind) : Plus;
  const SaveIcon = saveStatus.state === "failed" ? CloudOff : saveStatus.state === "saved" ? CheckCircle2 : Cloud;
  const selectedPreset = presetById(activeRoom?.preset || ROOM_PRESETS[0].id);
  const selectedTilePreviewStyle = sheetState === "ready" ? tileStyle(selectedTile, sheetSize, sheetSource, 56, tileFlipped) : {};
  const zoomedCell = Math.max(1, Math.round(ROOM_CELL_SIZE * canvasZoom));
  const effectiveCanvasZoom = zoomedCell / ROOM_CELL_SIZE;

  return (
    <section className="flex h-[calc(100vh-6.25rem)] min-h-0 gap-2 overflow-hidden text-neutral-200">
      {!libOpen && (
        <button
          type="button"
          onClick={() => setLibOpen(true)}
          className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 py-3 text-neutral-400 hover:border-amber-400/60 hover:text-amber-300"
          title="Show room library"
        >
          <PanelLeftOpen className="size-4" aria-hidden="true" />
          <span className="[writing-mode:vertical-rl] text-[11px] font-semibold uppercase tracking-[0.18em]">Rooms</span>
        </button>
      )}
      <aside className={`${libOpen ? "flex" : "hidden"} w-64 shrink-0 max-h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-neutral-900`}>
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Room Library</div>
            <div className="text-sm font-semibold text-neutral-100">{catalog.rooms.length} rooms · {filteredRooms.length} shown</div>
          </div>
          <button
            type="button"
            onClick={() => setLibOpen(false)}
            className="grid size-7 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
            title="Hide library"
            aria-label="Hide library"
          >
            <PanelLeftClose className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-3 pb-2 pt-2">
          <button
            type="button"
            onClick={() => setShowPresetPicker(true)}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-3 text-sm font-semibold text-neutral-950 hover:bg-amber-400"
          >
            <Plus className="size-4" aria-hidden="true" />
            New Room
          </button>
        </div>

        <div className="border-b border-white/10 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-600" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rooms"
              className="h-10 w-full rounded-md border border-white/10 bg-neutral-950 pl-9 pr-3 text-sm outline-none focus:border-amber-400"
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as RoomKind | "all")}
              className="h-9 rounded-md border border-white/10 bg-neutral-950 px-2 text-sm"
            >
              <option value="all">All types</option>
              {ROOM_KIND_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={levelFilter}
              onChange={(event) => setLevelFilter(event.target.value === "all" ? "all" : Number(event.target.value))}
              className="h-9 rounded-md border border-white/10 bg-neutral-950 px-2 text-sm"
            >
              <option value="all">All levels</option>
              {DUNGEON_LEVELS.map((level) => (
                <option key={level} value={level}>
                  L{level}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-black/20 p-2">
          <div className="flex flex-col gap-2">
            {filteredRooms.map((room) => {
              const Icon = kindIcon(room.room_kind);
              const selected = room.id === activeRoom?.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveRoomId(room.id)}
                  className={`rounded-md border p-3 text-left transition ${
                    selected
                      ? "border-amber-400/70 bg-amber-500/10 text-neutral-100 ring-1 ring-amber-400/30"
                      : "border-white/10 bg-neutral-950 text-neutral-100 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={selected ? "mt-0.5 size-4 text-amber-300" : "mt-0.5 size-4 text-neutral-500"} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{room.name}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {room.width}x{room.height} · {ROOM_KIND_OPTIONS.find((option) => option.id === room.room_kind)?.label}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {room.dungeon_levels.map((level) => (
                      <span
                        key={level}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-neutral-300"
                      >
                        L{level}
                      </span>
                    ))}
                    {room.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-white/10 bg-neutral-900 p-3">
          {showPresetPicker ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase text-neutral-500">Starter Size</div>
                {catalog.rooms.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPresetPicker(false)}
                    className="text-xs font-semibold text-neutral-500 hover:text-amber-300"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {ROOM_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleCreateRoom(preset.id)}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-neutral-950 px-3 py-2 text-left text-sm hover:border-amber-400/60"
                >
                  <span className="font-semibold">{preset.label}</span>
                  <span className="text-xs font-medium text-neutral-500">{preset.width}x{preset.height}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setShowPresetPicker(true)}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-3 text-sm font-semibold text-neutral-950 hover:bg-amber-400"
              >
                <Plus className="size-4" aria-hidden="true" />
                New Room
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 max-h-full min-h-0 flex-col overflow-y-auto rounded-lg border border-white/10 bg-neutral-900">
        {activeRoom ? (
          <>
        <header className="border-b border-white/10 bg-black/20 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md border border-white/10 bg-black/30">
              <SelectedKindIcon className="size-5 text-neutral-300" aria-hidden="true" />
            </div>
            <input
              value={activeRoom.name}
              onChange={(event) => updateActiveRoom((room) => ({ ...room, name: event.target.value }))}
              className="h-10 min-w-56 flex-1 rounded-md border border-white/10 bg-neutral-950 px-3 text-base font-semibold outline-none focus:border-amber-400"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleUndo}
                disabled={history.length === 0}
                className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-amber-400/60 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                title="Undo"
                aria-label="Undo"
              >
                <Undo2 className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-amber-400/60 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                title="Redo"
                aria-label="Redo"
              >
                <Redo2 className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleSaveNow}
                className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-amber-400/60 hover:text-amber-300"
                title="Save now"
                aria-label="Save now"
              >
                <Save className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleDuplicateRoom}
                className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-amber-400/60 hover:text-amber-300"
                title="Duplicate room"
                aria-label="Duplicate room"
              >
                <Copy className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleDeleteRoom}
                className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-rose-500 hover:text-rose-700"
                title="Delete room"
                aria-label="Delete room"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[16rem_11rem_1fr]">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Type</div>
              <div className="grid grid-cols-2 gap-1">
                {ROOM_KIND_OPTIONS.map((option) => {
                  const Icon = kindIcon(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => updateActiveRoom((room) => ({ ...room, room_kind: option.id }))}
                      className={`flex h-9 items-center justify-center gap-2 rounded-md border px-2 text-sm font-medium ${
                        activeRoom.room_kind === option.id
                          ? "border-amber-400 bg-amber-500 text-neutral-950"
                          : "border-white/10 text-neutral-300 hover:border-white/30"
                      }`}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Levels</div>
              <div className="grid grid-cols-5 gap-1">
                {DUNGEON_LEVELS.map((level) => (
                  <label
                    key={level}
                    className={`flex h-9 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold ${
                      activeRoom.dungeon_levels.includes(level)
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                        : "border-white/10 bg-neutral-950 text-neutral-400 hover:border-white/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={activeRoom.dungeon_levels.includes(level)}
                      onChange={() => handleLevelToggle(level)}
                      className="sr-only"
                    />
                    L{level}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Tags</div>
              <input
                value={activeRoom.tags.join(", ")}
                onChange={(event) => updateActiveRoom((room) => ({ ...room, tags: splitTags(event.target.value) }))}
                placeholder="starter, locked, elite"
                className="h-9 w-full rounded-md border border-white/10 bg-neutral-950 px-3 text-sm outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[18rem_1fr]">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Grid</div>
              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <div className="flex h-10 items-center rounded-md border border-white/10 bg-neutral-950">
                  <span className="border-r border-white/10 px-2 text-xs font-semibold text-neutral-500">W</span>
                  <span className="min-w-0 flex-1 px-2 text-sm font-semibold text-neutral-100">{activeRoom.width}</span>
                </div>
                <div className="flex h-10 items-center rounded-md border border-white/10 bg-neutral-950">
                  <span className="border-r border-white/10 px-2 text-xs font-semibold text-neutral-500">H</span>
                  <span className="min-w-0 flex-1 px-2 text-sm font-semibold text-neutral-100">{activeRoom.height}</span>
                </div>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {selectedPreset.label} template
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Notes</div>
              <input
                value={activeRoom.notes}
                onChange={(event) => updateActiveRoom((room) => ({ ...room, notes: event.target.value }))}
                className="h-10 w-full rounded-md border border-white/10 bg-neutral-950 px-3 text-sm outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-neutral-900 px-3 py-2">
          <div className="flex rounded-md border border-white/10 bg-black/30 p-1">
            {[
              { id: "visuals" as RoomView, label: "Visuals", Icon: Paintbrush },
              { id: "mapping" as RoomView, label: "Mapping", Icon: Grid2X2 }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold ${
                  view === item.id ? "bg-amber-500 text-neutral-950" : "text-neutral-300 hover:bg-white/10"
                }`}
              >
                <item.Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={handlePlayToggle}
              className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                playMode
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-white/10 text-neutral-300 hover:border-amber-400/60"
              }`}
              title={playMode ? "Stop room playtest" : "Play room"}
              aria-label={playMode ? "Stop room playtest" : "Play room"}
            >
              {playMode ? <Square className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              {playMode ? "Stop" : "Play"}
            </button>
            {playMode && (
              <button
                type="button"
                onClick={handlePlayReset}
                className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-amber-400/60 hover:text-amber-300"
                title="Reset hero"
                aria-label="Reset hero"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => zoomBy(-0.15)}
              className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-amber-400/60"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" aria-hidden="true" />
            </button>
            <span className="w-12 text-center text-xs font-semibold text-neutral-400">{Math.round(effectiveCanvasZoom * 100)}%</span>
            <button
              type="button"
              onClick={() => zoomBy(0.15)}
              className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-amber-400/60"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={fitNow}
              className={`grid size-9 place-items-center rounded-md border ${
                fitMode ? "border-amber-400 bg-amber-500/15 text-amber-300" : "border-white/10 text-neutral-300 hover:border-amber-400/60"
              }`}
              title="Fit room to screen"
              aria-label="Fit room to screen"
            >
              <Maximize2 className="size-4" aria-hidden="true" />
            </button>

            {view === "visuals" ? (
              <>
                <div className="flex rounded-md border border-white/10 bg-black/30 p-1">
                  {ROOM_LAYER_OPTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveLayer(item.id)}
                      className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs font-semibold ${
                        activeLayer === item.id ? "bg-amber-500 text-neutral-950" : "text-neutral-300 hover:bg-white/10"
                      }`}
                      title={`${item.label} layer (${item.hotkey})`}
                    >
                      <item.Icon className="size-3.5" aria-hidden="true" />
                      {item.label}
                      <span className={activeLayer === item.id ? "text-white/60" : "text-neutral-600"}>{item.hotkey}</span>
                    </button>
                  ))}
                </div>
                {[
                  { id: "paint" as VisualTool, label: "Paint", Icon: Paintbrush },
                  { id: "erase" as VisualTool, label: "Erase", Icon: Eraser }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVisualTool(item.id)}
                    className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                      visualTool === item.id
                        ? "border-amber-400 bg-amber-500 text-neutral-950"
                        : "border-white/10 text-neutral-300 hover:border-amber-400/60"
                    }`}
                  >
                    <item.Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTileFlipped((current) => !current)}
                  className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                    tileFlipped
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : "border-white/10 text-neutral-300 hover:border-amber-400/60"
                  }`}
                  title="Mirror horizontally (R)"
                  aria-label="Mirror horizontally"
                >
                  <FlipHorizontal className="size-4" aria-hidden="true" />
                  Mirror
                  <span className={tileFlipped ? "text-emerald-700" : "text-neutral-600"}>R</span>
                </button>
                <button
                  type="button"
                  onClick={handleFillEmpty}
                  className="flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm font-medium text-neutral-300 hover:border-amber-400/60"
                >
                  <MousePointer2 className="size-4" aria-hidden="true" />
                  Fill Empty
                </button>
                <button
                  type="button"
                  onClick={handleClearLayer}
                  className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-rose-500 hover:text-rose-700"
                  title={`Clear ${activeLayer} layer`}
                  aria-label={`Clear ${activeLayer} layer`}
                >
                  <Eraser className="size-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              [
                { id: "obstacle" as MappingTool, label: "Obstacle" },
                { id: "door" as MappingTool, label: "Door" },
                { id: "spawn" as MappingTool, label: "Spawn" },
                { id: "player" as MappingTool, label: "Player" },
                { id: "enemy" as MappingTool, label: "Enemy" },
                { id: "clear" as MappingTool, label: "Clear" }
              ].map((item) => {
                const Icon = markerIcon(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMappingTool(item.id)}
                    className={`flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
                      mappingTool === item.id
                        ? "border-amber-400 bg-amber-500 text-neutral-950"
                        : "border-white/10 text-neutral-300 hover:border-amber-400/60"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div ref={canvasViewportRef} className="flex min-h-[320px] flex-1 items-center justify-center overflow-hidden bg-neutral-950 p-4">
          <div
            className="relative rounded-md bg-black/40 p-2 shadow-2xl ring-1 ring-white/10"
            onMouseMove={handleMapMouseMove}
            onMouseLeave={() => {
              if (!resizeDrag.current) {
                setResizeHover(null);
              }
              setHoverCell(null);
            }}
            onMouseDownCapture={handleMapMouseDownCapture}
            style={{ cursor: playMode ? undefined : cursorForResizeMode(resizeDrag.current?.mode || resizeHover) }}
          >
            <div
              ref={gridRef}
              className="inline-grid overflow-hidden rounded"
              style={{ gridTemplateColumns: `repeat(${activeRoom.width}, ${zoomedCell}px)` }}
            >
              {cells.map(({ x, y }) => {
                const key = cellKey(x, y);
                const layerTiles = tileMap.get(key);
                const hasTile = ROOM_TILE_LAYERS.some((layer) => Boolean(layerTiles?.[layer]));
                const showPlacementPreview =
                  !playMode && view === "visuals" && visualTool === "paint" && hoverCell?.x === x && hoverCell?.y === y;
                const hasHero = playMode && heroPosition?.x === x && heroPosition.y === y;
                const heroSize = Math.max(20, Math.round(zoomedCell * 0.74));
                const marker: "obstacle" | "door" | "spawn" | "enemy" | null = samePoint(activeRoom.spawn, x, y)
                  ? "spawn"
                  : doorSet.has(key)
                    ? "door"
                    : enemySpawnSet.has(key)
                      ? "enemy"
                      : obstacleSet.has(key)
                        ? "obstacle"
                        : null;
                const MarkerIcon = marker ? markerIcon(marker) : null;
                const isBattleSpawn = view === "mapping" && samePoint(activeRoom.battle_spawn, x, y);
                return (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (playMode) {
                        return;
                      }
                      if (event.button === 1) {
                        pickVisualCell(x, y);
                        return;
                      }
                      handleCellAction(x, y, event.button === 2);
                    }}
                    onMouseEnter={(event) => {
                      setHoverCell({ x, y });
                      handleDragCell(event, x, y);
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                    className="relative grid place-items-center bg-zinc-700"
                    style={{
                      width: zoomedCell,
                      height: zoomedCell
                    }}
                    aria-label={`Cell ${x + 1}, ${y + 1}`}
                  >
                    {!hasTile && <span className="absolute inset-0 bg-[linear-gradient(135deg,#3f3f46_25%,#52525b_25%,#52525b_50%,#3f3f46_50%,#3f3f46_75%,#52525b_75%)] bg-[length:12px_12px]" />}
                    {ROOM_RENDER_LAYERS.map((layer) => {
                      const tile = layerTiles?.[layer];
                      return tile ? (
                        <span
                          key={layer}
                          className="absolute inset-0"
                          style={tileStyle(tile.tile, sheetSize, sheetSource, zoomedCell, tile.flip_x === true)}
                          aria-hidden="true"
                        />
                      ) : null;
                    })}
                    {showPlacementPreview && (
                      <span
                        className="pointer-events-none absolute inset-0 opacity-80 ring-2 ring-inset ring-emerald-300"
                        style={tileStyle(selectedTile, sheetSize, sheetSource, zoomedCell, tileFlipped)}
                        aria-hidden="true"
                      />
                    )}
                    {view === "mapping" && marker && MarkerIcon && (
                      <span className={`absolute inset-1 grid place-items-center rounded border ${markerClass(marker)}`}>
                        <MarkerIcon className="size-4" aria-hidden="true" />
                      </span>
                    )}
                    {isBattleSpawn && (
                      <span
                        className={`pointer-events-none absolute inset-1 z-20 grid place-items-center rounded border ${markerClass("player")}`}
                        title="Player battle start"
                      >
                        <User className="size-4" aria-hidden="true" />
                      </span>
                    )}
                    {hasHero && (
                      <span
                        className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
                        aria-hidden="true"
                      >
                        <span
                          className="relative grid place-items-center rounded-full border-2 border-white bg-emerald-400 shadow-[0_3px_8px_rgba(0,0,0,0.65)]"
                          style={{ width: heroSize, height: heroSize }}
                        >
                          <span
                            className="absolute inset-0 rounded-full bg-emerald-300/85"
                            aria-hidden="true"
                          />
                          <span
                            className="relative block drop-shadow-[0_2px_2px_rgba(0,0,0,0.75)]"
                            style={heroSpriteStyle(heroSize)}
                            aria-hidden="true"
                          />
                        </span>
                      </span>
                    )}
                    <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-zinc-500/55" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
          </>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center bg-white/5 p-6">
            <div className="w-full max-w-3xl rounded-md border border-white/10 bg-neutral-950 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-md border border-white/10 bg-black/30">
                  <Plus className="size-5 text-neutral-300" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Create a room</h3>
                  <p className="mt-1 text-sm text-neutral-500">Choose a starter size.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ROOM_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleCreateRoom(preset.id)}
                    className="rounded-md border border-white/10 bg-neutral-950 p-3 text-left hover:border-amber-400/60 hover:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-neutral-100">{preset.label}</span>
                      <span className="rounded bg-white/5 px-2 py-1 text-xs font-semibold text-neutral-400">
                        {preset.width}x{preset.height}
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-neutral-500">{preset.intent}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className={`${paletteOpen ? "flex" : "hidden"} w-72 shrink-0 max-h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-neutral-900`}>
        <div className="border-b border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className="grid size-7 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
                title="Hide palette"
                aria-label="Hide palette"
              >
                <PanelRightClose className="size-4" aria-hidden="true" />
              </button>
              <div>
                <div className="text-xs font-semibold uppercase text-neutral-500">Tile Palette</div>
                <div className="text-sm font-semibold">{ROOM_SPRITESHEET.label}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-neutral-950 px-2 py-1 text-xs font-medium text-neutral-400">
              <SaveIcon
                className={`size-4 ${
                  saveStatus.state === "failed"
                    ? "text-rose-600"
                    : saveStatus.state === "saved"
                      ? "text-emerald-600"
                      : "text-neutral-500"
                }`}
                aria-hidden="true"
              />
              {saveStatus.label}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div
              className="size-14 rounded-md border border-white/10 bg-black/30"
              style={selectedTilePreviewStyle}
              aria-hidden="true"
            />
            <div className="min-w-0 text-sm">
              <div className="font-semibold">Tile {selectedTile.col}, {selectedTile.row}</div>
              <div className="text-xs text-neutral-500">
                {sheetSource.startsWith("data:") ? "Uploaded sheet" : "Built-in sheet"} · {paletteTiles.length} tiles · {activeLayer}
                {tileFlipped ? " · mirrored" : ""}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-600" aria-hidden="true" />
              <input
                value={tileQuery}
                onChange={(event) => setTileQuery(event.target.value)}
                placeholder="Tile id"
                className="h-9 w-full rounded-md border border-white/10 bg-neutral-950 pl-9 pr-2 text-sm outline-none focus:border-amber-400"
              />
            </div>
            <label className="grid size-9 cursor-pointer place-items-center rounded-md border border-white/10 bg-neutral-950 text-neutral-300 hover:border-amber-400/60 hover:text-amber-300" title="Load PNG">
              <Upload className="size-4" aria-hidden="true" />
              <input type="file" accept="image/png,image/*" onChange={handleSheetUpload} className="sr-only" />
            </label>
            <button
              type="button"
              onClick={handleResetSheet}
              className="grid size-9 place-items-center rounded-md border border-white/10 text-neutral-300 hover:border-amber-400/60"
              title="Use built-in sheet"
              aria-label="Use built-in sheet"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
          </div>

          {roomCatalog.state === "failed" && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300">
              Catalog file not found yet; local draft is active.
            </div>
          )}
        </div>

        <div
          className="max-h-full min-h-0 flex-1 overflow-y-scroll overscroll-contain bg-zinc-950 p-3"
          onWheel={(event) => event.stopPropagation()}
        >
          {sheetState === "missing" ? (
            <div className="grid min-h-[30rem] place-items-center rounded-md border border-white/10 bg-zinc-900 p-4 text-center">
              <label className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-md border border-dashed border-white/20 bg-zinc-950 px-4 py-8 text-neutral-300 hover:border-emerald-400 hover:text-white">
                <Upload className="size-8 text-emerald-300" aria-hidden="true" />
                <span className="text-sm font-semibold">Load world sheet PNG</span>
                <span className="text-xs text-neutral-600">Built-in sheet unavailable</span>
                <input type="file" accept="image/png,image/*" onChange={handleSheetUpload} className="sr-only" />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(46px,1fr))] gap-2">
              {filteredPaletteTiles.map((item) => {
                const selected = item.tile.col === selectedTile.col && item.tile.row === selectedTile.row;
                return (
                  <button
                    key={item.key}
                    ref={selected ? selectedTileButtonRef : undefined}
                    type="button"
                    onClick={() => {
                      setSelectedTile(item.tile);
                      setVisualTool("paint");
                    }}
                    className={`grid place-items-center rounded border p-1 ${
                      selected
                        ? "border-amber-400 bg-amber-500/20 ring-1 ring-amber-400/60"
                        : "border-white/10 bg-neutral-900 hover:border-white/40"
                    }`}
                    title={`Tile ${item.tile.col}, ${item.tile.row}`}
                    aria-label={`Tile ${item.tile.col}, ${item.tile.row}`}
                  >
                    <span
                      className="block size-10"
                      style={tileStyle(item.tile, sheetSize, sheetSource, 40)}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
              {sheetState === "loading" && (
                <div className="col-span-full rounded-md border border-white/10 bg-zinc-900 p-4 text-sm text-neutral-400">
                  Building tile palette
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {!paletteOpen && (
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border border-white/10 bg-neutral-900 py-3 text-neutral-400 hover:border-amber-400/60 hover:text-amber-300"
          title="Show tile palette"
        >
          <PanelRightOpen className="size-4" aria-hidden="true" />
          <span className="[writing-mode:vertical-rl] text-[11px] font-semibold uppercase tracking-[0.18em]">Tiles</span>
        </button>
      )}
    </section>
  );
}
