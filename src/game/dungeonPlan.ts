/**
 * Runtime dungeon-plan loader. The Dungeon workspace persists the designer's
 * per-floor plan (enemy rosters, bosses, biomes) to
 * localStorage["dungeon-workbench.dungeon-plan"] on every edit, and to
 * data/dungeon_plan.json on save. The game reads the SAME live source so plan
 * edits show up in the next run immediately (no regeneration step):
 *
 *   localStorage (live edits)  →  /data file (saved)  →  engine defaults
 */

import type { DungeonPlan, DungeonPlanLevel } from "../features/playtest/engine";

const STORAGE_KEY = "dungeon-workbench.dungeon-plan";

interface RawPlanEnemy {
  id?: string;
  profile?: string;
  boss?: boolean;
}

interface RawPlanLevel {
  custom?: boolean;
  enemies?: RawPlanEnemy[];
  boss?: string;
  bossName?: string;
  biome?: string;
  notes?: string;
}

interface RawPlan {
  levels?: Record<string, RawPlanLevel>;
}

function normalizeLevel(raw: RawPlanLevel | undefined): DungeonPlanLevel | null {
  if (!raw || typeof raw !== "object") return null;
  const enemies = (Array.isArray(raw.enemies) ? raw.enemies : [])
    .filter((e) => e && typeof e.id === "string" && e.id.trim().length > 0)
    .map((e) => ({ id: (e.id as string).trim(), profile: typeof e.profile === "string" ? e.profile : "balanced", boss: e.boss === true }));
  const level: DungeonPlanLevel = {};
  if (enemies.length) level.enemies = enemies;
  if (typeof raw.boss === "string" && raw.boss.trim()) level.boss = raw.boss.trim();
  if (typeof raw.bossName === "string" && raw.bossName.trim()) level.bossName = raw.bossName.trim();
  if (typeof raw.biome === "string" && raw.biome.trim()) level.biome = raw.biome.trim();
  return Object.keys(level).length ? level : null;
}

/** Parse a stored plan; returns null when it holds no effective overrides. */
export function parseDungeonPlan(raw: RawPlan | null): DungeonPlan | null {
  if (!raw || typeof raw !== "object" || !raw.levels || typeof raw.levels !== "object") return null;
  const levels: Record<string, DungeonPlanLevel> = {};
  for (const key of ["1", "2", "3", "4", "5"]) {
    // Only floors the designer explicitly customized override the engine.
    const rawLevel = raw.levels[key];
    if (rawLevel && rawLevel.custom === false) continue;
    const level = normalizeLevel(rawLevel);
    if (level) levels[key] = level;
  }
  return Object.keys(levels).length ? { levels } : null;
}

// async refresh from the saved plan file (covers a fresh browser profile)
let serverPlan: DungeonPlan | null = null;
if (typeof fetch === "function") {
  void fetch("/data/dungeon_plan.json")
    .then((r) => (r.ok ? (r.json() as Promise<RawPlan>) : null))
    .then((raw) => {
      serverPlan = parseDungeonPlan(raw);
    })
    .catch(() => {});
}

/** The freshest designer plan available right now, or null for engine defaults. */
export function liveDungeonPlan(): DungeonPlan | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as RawPlan;
      if (parsed && typeof parsed === "object") {
        // A local draft is authoritative even when it customizes nothing —
        // "reset to defaults" must beat a stale server copy fetched at load.
        return parseDungeonPlan(parsed);
      }
    }
  } catch {
    /* ignore malformed local state */
  }
  return serverPlan;
}

export const DUNGEON_PLAN_STORAGE_KEY = STORAGE_KEY;
