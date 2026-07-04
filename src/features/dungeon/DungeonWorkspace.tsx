import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Crown,
  DoorOpen,
  Loader2,
  Map as MapIcon,
  Plus,
  RotateCcw,
  Search,
  Skull,
  Swords,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useJsonResource } from "../../services/api";
import { WorkspaceChrome } from "../workbench/WorkspaceChrome";
import { DUNGEON } from "../playtest/engine";
import { CREATURE_NAMES, LEVEL_ASSIGNED, BOSS_BY_LEVEL } from "../../game/spriteData";
import { liveRooms, roomPoolFor } from "../../game/rooms";
import type { RoomDef } from "../../game/roomData";
import { CreatureSprite } from "./CreatureSprite";
import {
  ARCHETYPE_KEYS,
  BIOME_OPTIONS,
  PLAN_LEVELS,
  PLAN_SAVE_ENDPOINT,
  PLAN_STORAGE_KEY,
  PROFILE_OPTIONS,
  archetypeCoverage,
  defaultBiome,
  defaultBoss,
  defaultBossName,
  defaultRoster,
  emptyFloor,
  emptyPlan,
  mergePlans,
  planSavePayload,
  sanitizePlan,
} from "./planModel";
import type { PlanEnemy, PlanFloor, PlanState } from "./planModel";

// ----------------------------------------------------------------------------
// Creature metadata from the catalog (names, profiles, native floors)
// ----------------------------------------------------------------------------

interface CatalogEntry {
  id?: string;
  sheet?: string;
  name?: string;
  category?: string;
  combat_profile?: string;
  dungeon_level?: number | null;
  ignored?: boolean;
  tags?: string[];
}

interface CreatureFxCatalog {
  entries?: CatalogEntry[];
}

export interface CreatureMeta {
  id: string;
  name: string;
  profile: string;
  nativeLevel: number | null;
  bossCandidate: boolean;
}

const ASSIGNED_BOSS_IDS = new Set<string>([
  ...Object.values(BOSS_BY_LEVEL),
  ...Object.values(LEVEL_ASSIGNED).flatMap((list) => list.filter((a) => a.boss).map((a) => a.id)),
]);

function creatureMetaList(catalog: CreatureFxCatalog | null): CreatureMeta[] {
  const seen = new Set<string>();
  const list: CreatureMeta[] = [];
  for (const entry of catalog?.entries ?? []) {
    if (!entry?.id || entry.sheet !== "creatures" || entry.ignored) continue;
    if (entry.category === "hero" || entry.tags?.includes("hero")) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    list.push({
      id: entry.id,
      name: entry.name || CREATURE_NAMES[entry.id] || entry.id,
      profile: entry.combat_profile || "balanced",
      nativeLevel: Number.isInteger(entry.dungeon_level) ? (entry.dungeon_level as number) : null,
      bossCandidate: entry.category === "boss_enemy" || ASSIGNED_BOSS_IDS.has(entry.id),
    });
  }
  list.sort((a, b) => (a.nativeLevel ?? 9) - (b.nativeLevel ?? 9) || a.name.localeCompare(b.name));
  return list;
}

// ----------------------------------------------------------------------------
// Persistence helpers
// ----------------------------------------------------------------------------

type SaveStatus =
  | { state: "idle"; label: string }
  | { state: "saving"; label: string }
  | { state: "saved"; label: string }
  | { state: "failed"; label: string };

function readLocalPlan(): PlanState | null {
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    return raw ? sanitizePlan(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Small display pieces
// ----------------------------------------------------------------------------

const BIOME_SWATCH: Record<string, string> = {
  forest: "bg-emerald-500",
  sand: "bg-amber-400",
  volcanic: "bg-orange-600",
  castle: "bg-slate-400",
  dungeon: "bg-violet-500",
};

function biomeLabel(id: string): string {
  return BIOME_OPTIONS.find((b) => b.id === id)?.label || id;
}

function SaveChip({ status }: { status: SaveStatus }): JSX.Element {
  const icon =
    status.state === "saving" ? (
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
    ) : status.state === "saved" ? (
      <Cloud className="size-3.5 text-emerald-400" aria-hidden="true" />
    ) : status.state === "failed" ? (
      <CloudOff className="size-3.5 text-amber-400" aria-hidden="true" />
    ) : (
      <Cloud className="size-3.5 text-neutral-500" aria-hidden="true" />
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs font-medium text-neutral-300">
      {icon}
      {status.label}
    </span>
  );
}

function RoomCoverageLine({
  label,
  Icon,
  coverage,
}: {
  label: string;
  Icon: typeof DoorOpen;
  coverage: { pool: RoomDef[]; levelScoped: boolean };
}): JSX.Element {
  const names = coverage.pool.map((room) => room.name).slice(0, 3);
  const extra = coverage.pool.length - names.length;
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
      <span className="w-16 shrink-0 font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
      {coverage.pool.length === 0 ? (
        <span className="inline-flex items-center gap-1 text-rose-400">
          <AlertTriangle className="size-3.5" aria-hidden="true" /> no authored room — procedural corridor
        </span>
      ) : (
        <span className="truncate text-neutral-300">
          {names.join(", ")}
          {extra > 0 ? ` +${extra}` : ""}
          {!coverage.levelScoped && (
            <span className="ml-1.5 inline-flex items-center gap-1 text-amber-400">
              <AlertTriangle className="size-3 shrink-0" aria-hidden="true" /> borrowed (none assigned to this floor)
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function CoverageChips({ roster }: { roster: PlanEnemy[] }): JSX.Element {
  const coverage = archetypeCoverage(roster);
  return (
    <div className="flex flex-wrap gap-1.5">
      {ARCHETYPE_KEYS.map((key) => (
        <span
          key={key}
          className={`rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize ${
            coverage[key] > 0
              ? "border-white/10 bg-black/30 text-neutral-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }`}
          title={coverage[key] > 0 ? `${coverage[key]} enemies match the ${key} profile set` : `No ${key}-profile enemies — the engine falls back to the full floor roster`}
        >
          {key} {coverage[key]}
        </span>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Workspace
// ----------------------------------------------------------------------------

export function DungeonWorkspace(): JSX.Element {
  const serverPlanResource = useJsonResource<unknown>("/data/dungeon_plan.json");
  const creatureCatalog = useJsonResource<CreatureFxCatalog>("/data/oryx_creature_fx_catalog.json");

  const [plan, setPlan] = useState<PlanState>(() => emptyPlan());
  const [hydrated, setHydrated] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle", label: "Local draft" });
  const [roomsNonce, setRoomsNonce] = useState(0);
  const didHydrate = useRef(false);

  // hydrate: newest-wins per floor between the local draft and the saved file
  useEffect(() => {
    if (didHydrate.current || serverPlanResource.state === "loading") return;
    const serverPlan = serverPlanResource.state === "ready" ? sanitizePlan(serverPlanResource.data) : null;
    didHydrate.current = true;
    setPlan(mergePlans(readLocalPlan(), serverPlan));
    setHydrated(true);
  }, [serverPlanResource]);

  // authored rooms can change in the Levels workspace — refresh coverage on focus
  useEffect(() => {
    const bump = () => setRoomsNonce((value) => value + 1);
    window.addEventListener("focus", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const saveToServer = useCallback(async (payload: Record<string, unknown>, signal?: AbortSignal, attempt = 0): Promise<void> => {
    setSaveStatus({ state: "saving", label: attempt > 0 ? "Retrying save" : "Saving" });
    try {
      const response = await fetch(PLAN_SAVE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const result = (await response.json()) as { levels?: number };
      setSaveStatus({ state: "saved", label: `Saved · ${result.levels ?? 0} custom floors` });
    } catch (error) {
      if ((error as Error).name === "AbortError" || signal?.aborted) return;
      if (attempt < 3) {
        window.setTimeout(() => void saveToServer(payload, signal, attempt + 1), 800 * (attempt + 1));
        return;
      }
      setSaveStatus({ state: "failed", label: "Saved locally" });
    }
  }, []);

  const latestPayload = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // server save below is the durable copy
    }
    const payload = planSavePayload(plan);
    latestPayload.current = payload;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void saveToServer(payload, controller.signal), 650);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [plan, hydrated, saveToServer]);

  useEffect(() => {
    const flush = () => {
      const payload = latestPayload.current;
      if (!payload || typeof navigator.sendBeacon !== "function") return;
      try {
        navigator.sendBeacon(PLAN_SAVE_ENDPOINT, new Blob([JSON.stringify(payload)], { type: "application/json" }));
      } catch {
        // best effort — localStorage still holds the latest copy
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const creatures = useMemo(
    () => creatureMetaList(creatureCatalog.state === "ready" ? creatureCatalog.data : null),
    [creatureCatalog],
  );
  const creatureById = useMemo(() => new Map(creatures.map((c) => [c.id, c])), [creatures]);

  const roomCoverage = useMemo(() => {
    const rooms = liveRooms();
    const byLevel = new Map<number, Record<"entrance" | "encounter" | "boss", { pool: RoomDef[]; levelScoped: boolean }>>();
    for (const level of PLAN_LEVELS) {
      byLevel.set(level, {
        entrance: roomPoolFor(rooms, level, "entrance"),
        encounter: roomPoolFor(rooms, level, "encounter"),
        boss: roomPoolFor(rooms, level, "boss"),
      });
    }
    return byLevel;
    // roomsNonce re-reads localStorage-backed authored rooms
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsNonce]);

  const updateFloor = useCallback((level: number, mutate: (floor: PlanFloor) => PlanFloor) => {
    setPlan((current) => {
      const key = String(level);
      const floor = current.levels[key] ?? emptyFloor();
      return {
        ...current,
        levels: { ...current.levels, [key]: { ...mutate(floor), updated_at: new Date().toISOString() } },
      };
    });
  }, []);

  const customizeFloor = useCallback(
    (level: number) => {
      updateFloor(level, (floor) => ({
        ...floor,
        custom: true,
        enemies: floor.enemies.length ? floor.enemies : defaultRoster(level),
        boss: floor.boss || defaultBoss(level),
        bossName: floor.bossName || defaultBossName(level),
        biome: floor.biome || defaultBiome(level),
      }));
    },
    [updateFloor],
  );

  const resetFloor = useCallback(
    (level: number) => {
      updateFloor(level, () => emptyFloor());
    },
    [updateFloor],
  );

  const selectedKey = String(selectedLevel);
  const selectedFloor = plan.levels[selectedKey] ?? emptyFloor();

  return (
    <WorkspaceChrome eyebrow="Dungeon" title="Dungeon Map">
      <div className="min-h-0 flex-1 overflow-auto bg-neutral-950 text-neutral-200">
        <div className="flex w-full flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-neutral-900 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <MapIcon className="size-4 text-neutral-300" aria-hidden="true" />
              {DUNGEON.levels} floors × {DUNGEON.encountersPerLevel} encounters + boss. Floor changes go live in Play on the next run — no export step.
            </div>
            <SaveChip status={saveStatus} />
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]">
            {/* ------------------------------- map ------------------------------- */}
            <div className="flex flex-col gap-2.5">
              {PLAN_LEVELS.map((level) => {
                const key = String(level);
                const floor = plan.levels[key] ?? emptyFloor();
                const roster = floor.custom && floor.enemies.length ? floor.enemies : defaultRoster(level);
                const bossId = (floor.custom && floor.boss) || defaultBoss(level);
                const bossName = (floor.custom && floor.bossName) || defaultBossName(level) || CREATURE_NAMES[bossId] || "Boss";
                const biome = (floor.custom && floor.biome) || defaultBiome(level);
                const coverage = roomCoverage.get(level);
                const selected = selectedLevel === level;
                const regulars = roster.filter((enemy) => !enemy.boss);
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSelectedLevel(level)}
                    className={`rounded-md border bg-neutral-900 px-4 py-3 text-left transition-colors ${
                      selected ? "border-amber-400/60 ring-1 ring-amber-400/40" : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 items-center justify-center rounded bg-black/40 text-sm font-bold text-neutral-200">{level}</span>
                        <span className={`size-2.5 rounded-full ${BIOME_SWATCH[biome] || "bg-neutral-500"}`} aria-hidden="true" />
                        <span className="text-sm font-semibold capitalize">{biomeLabel(biome)}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
                            floor.custom ? "bg-amber-500/15 text-amber-300" : "bg-white/10 text-neutral-400"
                          }`}
                        >
                          {floor.custom ? "Custom" : "Default"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-neutral-300">
                        <Skull className="size-4 text-neutral-500" aria-hidden="true" />
                        <CreatureSprite id={bossId} size={28} />
                        <span className="font-medium">{bossName}</span>
                      </div>
                    </div>

                    {/* run path: entrance → encounters → boss */}
                    <div className="mt-2.5 flex items-center gap-1.5" aria-hidden="true">
                      <DoorOpen className="size-4 text-neutral-500" />
                      {Array.from({ length: DUNGEON.encountersPerLevel }, (_, i) => (
                        <span key={i} className="h-1.5 w-6 rounded-full bg-white/15" />
                      ))}
                      <Skull className="size-4 text-rose-400/80" />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {regulars.slice(0, 14).map((enemy) => (
                        <CreatureSprite key={enemy.id} id={enemy.id} size={26} />
                      ))}
                      {regulars.length > 14 && <span className="text-xs text-neutral-500">+{regulars.length - 14}</span>}
                      <span className="ml-1 text-xs text-neutral-500">{regulars.length} enemy types</span>
                    </div>

                    {coverage && (
                      <div className="mt-2 flex flex-col gap-1 border-t border-white/5 pt-2">
                        <RoomCoverageLine label="Entrance" Icon={DoorOpen} coverage={coverage.entrance} />
                        <RoomCoverageLine label="Rooms" Icon={Swords} coverage={coverage.encounter} />
                        <RoomCoverageLine label="Boss" Icon={Skull} coverage={coverage.boss} />
                      </div>
                    )}
                  </button>
                );
              })}
              <p className="px-1 text-xs text-neutral-500">
                Room coverage reads the live Levels catalog: assign rooms to floors in the Levels workspace and they are picked up here and in Play
                automatically.
              </p>
            </div>

            {/* --------------------------- floor editor --------------------------- */}
            <FloorEditor
              level={selectedLevel}
              floor={selectedFloor}
              creatures={creatures}
              creatureById={creatureById}
              catalogState={creatureCatalog.state}
              onCustomize={() => customizeFloor(selectedLevel)}
              onReset={() => resetFloor(selectedLevel)}
              onChange={(mutate) => updateFloor(selectedLevel, mutate)}
            />
          </div>
        </div>
      </div>
    </WorkspaceChrome>
  );
}

// ----------------------------------------------------------------------------
// Floor editor
// ----------------------------------------------------------------------------

function FloorEditor({
  level,
  floor,
  creatures,
  creatureById,
  catalogState,
  onCustomize,
  onReset,
  onChange,
}: {
  level: number;
  floor: PlanFloor;
  creatures: CreatureMeta[];
  creatureById: Map<string, CreatureMeta>;
  catalogState: "loading" | "ready" | "failed";
  onCustomize: () => void;
  onReset: () => void;
  onChange: (mutate: (floor: PlanFloor) => PlanFloor) => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [floorFilter, setFloorFilter] = useState<string>("all");

  const roster = floor.custom && floor.enemies.length ? floor.enemies : defaultRoster(level);
  const inRoster = useMemo(() => new Set(roster.map((enemy) => enemy.id)), [roster]);
  const bossId = (floor.custom && floor.boss) || defaultBoss(level);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creatures.filter((creature) => {
      if (profileFilter !== "all" && creature.profile !== profileFilter) return false;
      if (floorFilter === "unassigned" && creature.nativeLevel !== null) return false;
      if (floorFilter !== "all" && floorFilter !== "unassigned" && creature.nativeLevel !== Number(floorFilter)) return false;
      if (q && !creature.name.toLowerCase().includes(q) && !creature.id.includes(q)) return false;
      return true;
    });
  }, [creatures, query, profileFilter, floorFilter]);

  const addEnemy = (creature: CreatureMeta) => {
    onChange((current) => {
      const base = current.custom && current.enemies.length ? current.enemies : defaultRoster(level);
      if (base.some((enemy) => enemy.id === creature.id)) return current;
      return {
        ...current,
        custom: true,
        boss: current.boss || defaultBoss(level),
        bossName: current.bossName || defaultBossName(level),
        biome: current.biome || defaultBiome(level),
        enemies: [...base, { id: creature.id, profile: creature.profile, boss: false }],
      };
    });
  };

  const mutateRoster = (mutate: (enemies: PlanEnemy[]) => PlanEnemy[]) => {
    onChange((current) => {
      const base = current.custom && current.enemies.length ? current.enemies : defaultRoster(level);
      return {
        ...current,
        custom: true,
        boss: current.boss || defaultBoss(level),
        bossName: current.bossName || defaultBossName(level),
        biome: current.biome || defaultBiome(level),
        enemies: mutate(base),
      };
    });
  };

  return (
    <section className="flex h-fit flex-col gap-3 rounded-md border border-white/10 bg-neutral-900 p-4 xl:sticky xl:top-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Level {level} — {floor.custom ? "custom floor" : "engine defaults"}
        </h3>
        {floor.custom ? (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-300 hover:bg-white/10"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" /> Reset to engine default
          </button>
        ) : (
          <button
            type="button"
            onClick={onCustomize}
            className="inline-flex items-center gap-1.5 rounded bg-amber-500/90 px-2.5 py-1 text-xs font-bold text-neutral-950 hover:bg-amber-400"
          >
            <Wand2 className="size-3.5" aria-hidden="true" /> Customize this floor
          </button>
        )}
      </div>

      {!floor.custom && (
        <p className="text-xs leading-5 text-neutral-500">
          This floor runs on the engine's built-in roster (creature catalog assignments). Customize it to swap the biome, the boss, or to mix in
          enemy types normally assigned to other floors.
        </p>
      )}

      {/* biome + boss title */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-400">
          Biome
          <select
            value={(floor.custom && floor.biome) || defaultBiome(level)}
            onChange={(event) => onChange((current) => ({ ...current, custom: true, biome: event.target.value }))}
            className="rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm font-normal text-neutral-200"
          >
            {BIOME_OPTIONS.map((biome) => (
              <option key={biome.id} value={biome.id}>
                {biome.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-400">
          Boss title
          <input
            type="text"
            value={(floor.custom && floor.bossName) || defaultBossName(level)}
            onChange={(event) => onChange((current) => ({ ...current, custom: true, bossName: event.target.value }))}
            className="rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm font-normal text-neutral-200"
          />
        </label>
      </div>

      {/* boss picker */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
          <Crown className="size-3.5" aria-hidden="true" /> Boss
        </div>
        <div className="flex flex-wrap gap-1.5">
          {creatures
            .filter((creature) => creature.bossCandidate || creature.id === bossId)
            .map((creature) => (
              <button
                key={creature.id}
                type="button"
                title={`${creature.name}${creature.nativeLevel ? ` — floor ${creature.nativeLevel}` : ""}`}
                onClick={() => onChange((current) => ({ ...current, custom: true, boss: creature.id }))}
                className={`rounded border p-1 ${
                  creature.id === bossId ? "border-amber-400/70 bg-amber-500/15" : "border-white/10 bg-black/30 hover:border-white/30"
                }`}
              >
                <CreatureSprite id={creature.id} size={30} />
              </button>
            ))}
        </div>
        <p className="text-[11px] text-neutral-500">Any creature below can also be promoted with its ★ toggle; picks here override the floor boss.</p>
      </div>

      {/* roster */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
            <Swords className="size-3.5" aria-hidden="true" /> Enemy roster · {roster.filter((enemy) => !enemy.boss).length}
          </div>
          <CoverageChips roster={roster} />
        </div>
        <ul className="flex max-h-72 flex-col gap-1 overflow-auto pr-1">
          {roster.map((enemy) => {
            const meta = creatureById.get(enemy.id);
            const foreign = meta?.nativeLevel != null && meta.nativeLevel !== level;
            return (
              <li key={enemy.id} className="flex items-center gap-2 rounded border border-white/5 bg-black/25 px-2 py-1">
                <CreatureSprite id={enemy.id} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm">{meta?.name || CREATURE_NAMES[enemy.id] || enemy.id}</span>
                {foreign && (
                  <span
                    className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-300"
                    title={`Normally assigned to floor ${meta?.nativeLevel}`}
                  >
                    F{meta?.nativeLevel}
                  </span>
                )}
                <select
                  value={enemy.profile}
                  onChange={(event) =>
                    mutateRoster((enemies) => enemies.map((e) => (e.id === enemy.id ? { ...e, profile: event.target.value } : e)))
                  }
                  className="rounded border border-white/10 bg-black/40 px-1 py-0.5 text-xs text-neutral-300"
                  title="Combat profile — controls which engine archetypes use this creature"
                >
                  {PROFILE_OPTIONS.map((profile) => (
                    <option key={profile} value={profile}>
                      {profile}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => mutateRoster((enemies) => enemies.map((e) => (e.id === enemy.id ? { ...e, boss: !e.boss } : e)))}
                  className={`rounded px-1 text-sm ${enemy.boss ? "text-amber-300" : "text-neutral-600 hover:text-neutral-300"}`}
                  title={enemy.boss ? "Boss candidate — click to make a regular enemy" : "Mark as boss candidate"}
                >
                  ★
                </button>
                <button
                  type="button"
                  onClick={() => mutateRoster((enemies) => enemies.filter((e) => e.id !== enemy.id))}
                  className="rounded p-0.5 text-neutral-500 hover:text-rose-400"
                  title="Remove from this floor"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* add enemies */}
      <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
          <Plus className="size-3.5" aria-hidden="true" /> Add enemy types
          <span className="font-normal text-neutral-500">— including ones assigned to other floors</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search creatures"
              className="w-full rounded border border-white/15 bg-black/30 py-1.5 pl-7 pr-2 text-sm text-neutral-200"
            />
          </div>
          <select
            value={profileFilter}
            onChange={(event) => setProfileFilter(event.target.value)}
            className="rounded border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-neutral-300"
          >
            <option value="all">All profiles</option>
            {PROFILE_OPTIONS.map((profile) => (
              <option key={profile} value={profile}>
                {profile}
              </option>
            ))}
          </select>
          <select
            value={floorFilter}
            onChange={(event) => setFloorFilter(event.target.value)}
            className="rounded border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-neutral-300"
          >
            <option value="all">All floors</option>
            {PLAN_LEVELS.map((planLevel) => (
              <option key={planLevel} value={String(planLevel)}>
                Assigned to floor {planLevel}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>
        </div>

        {catalogState === "loading" && <div className="text-xs text-neutral-500">Loading creature catalog…</div>}
        {catalogState === "failed" && <div className="text-xs text-rose-400">Creature catalog failed to load — enemy picker unavailable.</div>}

        <ul className="grid max-h-64 grid-cols-2 gap-1 overflow-auto pr-1">
          {candidates.map((creature) => {
            const added = inRoster.has(creature.id);
            return (
              <li key={creature.id}>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => addEnemy(creature)}
                  className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left ${
                    added
                      ? "cursor-default border-emerald-500/30 bg-emerald-500/10"
                      : "border-white/5 bg-black/25 hover:border-white/25"
                  }`}
                  title={added ? "Already on this floor" : `Add ${creature.name} to floor ${level}`}
                >
                  <CreatureSprite id={creature.id} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-neutral-200">{creature.name}</span>
                    <span className="block text-[10px] text-neutral-500">
                      {creature.profile}
                      {creature.nativeLevel ? ` · floor ${creature.nativeLevel}` : " · unassigned"}
                    </span>
                  </span>
                  {added && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
          {catalogState === "ready" && candidates.length === 0 && (
            <li className="col-span-2 py-2 text-center text-xs text-neutral-500">No creatures match the current filters.</li>
          )}
        </ul>
      </div>

      {/* notes */}
      <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-400">
        Floor notes
        <textarea
          value={floor.notes}
          onChange={(event) => onChange((current) => ({ ...current, notes: event.target.value }))}
          rows={2}
          placeholder="Design intent for this floor (saved with the plan)"
          className="resize-y rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm font-normal text-neutral-200"
        />
      </label>
    </section>
  );
}
