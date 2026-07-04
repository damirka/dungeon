/**
 * Client-side model for the designer dungeon plan edited in the Dungeon
 * workspace. Persistence mirrors the RoomDesigner: localStorage on every edit
 * (the game reads it live through src/game/dungeonPlan.ts), debounced POST to
 * /api/save/dungeon-plan for the durable copy, per-floor updated_at merge for
 * cross-browser safety.
 */

import { BIOME_BY_LEVEL, BOSS_NAMES, effectiveBossPool, effectiveLevelPools } from "../playtest/engine";
import type { ArchetypeKey } from "../playtest/engine";
import { LEVEL_ASSIGNED, LEVEL_POOL_PROFILE_KEYS } from "../../game/spriteData";
import { DUNGEON_PLAN_STORAGE_KEY } from "../../game/dungeonPlan";

export const PLAN_STORAGE_KEY = DUNGEON_PLAN_STORAGE_KEY;
export const PLAN_SAVE_ENDPOINT = "/api/save/dungeon-plan";
export const PLAN_LEVELS = [1, 2, 3, 4, 5] as const;

export const PROFILE_OPTIONS = ["balanced", "elite", "strength", "dexterity", "caster", "support", "tank", "hp"] as const;
export const BIOME_OPTIONS = [
  { id: "forest", label: "Forest" },
  { id: "sand", label: "Sand" },
  { id: "volcanic", label: "Volcanic" },
  { id: "castle", label: "Castle" },
  { id: "dungeon", label: "Dungeon" },
] as const;

export const ARCHETYPE_KEYS: ArchetypeKey[] = ["raider", "brute", "duelist", "stalker", "mage"];

export interface PlanEnemy {
  id: string;
  profile: string;
  boss: boolean;
}

export interface PlanFloor {
  custom: boolean;
  enemies: PlanEnemy[];
  boss: string; // "" = engine default
  bossName: string; // "" = engine default title
  biome: string; // "" = engine default biome
  notes: string;
  updated_at: string;
}

export interface PlanState {
  version: string;
  levels: Record<string, PlanFloor>;
  curation?: Record<string, unknown>;
}

export function emptyFloor(): PlanFloor {
  return { custom: false, enemies: [], boss: "", bossName: "", biome: "", notes: "", updated_at: "" };
}

export function emptyPlan(): PlanState {
  const levels: Record<string, PlanFloor> = {};
  for (const level of PLAN_LEVELS) levels[String(level)] = emptyFloor();
  return { version: "0.1.0", levels };
}

/** The engine-default roster for a floor: catalog-assigned enemies, or (floors
    without assignments) the archetype pools flattened with a matching profile. */
export function defaultRoster(level: number): PlanEnemy[] {
  const assigned = LEVEL_ASSIGNED[String(level)] || [];
  if (assigned.length) return assigned.map((a) => ({ id: a.id, profile: a.profile, boss: a.boss }));
  const pools = effectiveLevelPools(level, null);
  const seen = new Set<string>();
  const roster: PlanEnemy[] = [];
  for (const key of ARCHETYPE_KEYS) {
    const profile = (LEVEL_POOL_PROFILE_KEYS[key] || ["balanced"])[0];
    for (const id of pools[key]) {
      if (seen.has(id)) continue;
      seen.add(id);
      roster.push({ id, profile, boss: false });
    }
  }
  return roster;
}

export function defaultBoss(level: number): string {
  return effectiveBossPool(level, null)[0] || "";
}

export function defaultBossName(level: number): string {
  return BOSS_NAMES[level] || "";
}

export function defaultBiome(level: number): string {
  return BIOME_BY_LEVEL[level] || "dungeon";
}

function sanitizeEnemies(value: unknown): PlanEnemy[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const enemies: PlanEnemy[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const enemy = raw as Partial<PlanEnemy>;
    const id = typeof enemy.id === "string" ? enemy.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    enemies.push({
      id,
      profile: typeof enemy.profile === "string" && enemy.profile ? enemy.profile : "balanced",
      boss: enemy.boss === true,
    });
  }
  return enemies;
}

function sanitizeFloor(value: unknown): PlanFloor {
  if (!value || typeof value !== "object") return emptyFloor();
  const raw = value as Partial<PlanFloor>;
  const enemies = sanitizeEnemies(raw.enemies);
  return {
    // older saves have no explicit flag: any content means customized
    custom: raw.custom === true || (raw.custom !== false && enemies.length > 0),
    enemies,
    boss: typeof raw.boss === "string" ? raw.boss.trim() : "",
    bossName: typeof raw.bossName === "string" ? raw.bossName.trim() : "",
    biome: typeof raw.biome === "string" && BIOME_OPTIONS.some((b) => b.id === raw.biome) ? raw.biome : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
  };
}

export function sanitizePlan(value: unknown): PlanState {
  const plan = emptyPlan();
  if (!value || typeof value !== "object") return plan;
  const raw = value as Partial<PlanState>;
  if (typeof raw.version === "string" && raw.version) plan.version = raw.version;
  if (raw.curation && typeof raw.curation === "object") plan.curation = raw.curation as Record<string, unknown>;
  const levels = raw.levels && typeof raw.levels === "object" ? raw.levels : {};
  for (const level of PLAN_LEVELS) {
    const key = String(level);
    if (key in levels) plan.levels[key] = sanitizeFloor((levels as Record<string, unknown>)[key]);
  }
  return plan;
}

function timestampValue(value: unknown): number {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) return 0;
  if (time > Date.now() + 24 * 60 * 60 * 1000) return 0; // ignore clock-skew garbage
  return time;
}

/** Per-floor newest-wins merge of the local draft and the saved server plan. */
export function mergePlans(local: PlanState | null, server: PlanState | null): PlanState {
  if (!local) return server ?? emptyPlan();
  if (!server) return local;
  const merged = emptyPlan();
  merged.version = local.version || server.version;
  merged.curation = { ...(server.curation || {}), ...(local.curation || {}) };
  for (const level of PLAN_LEVELS) {
    const key = String(level);
    const a = local.levels[key] ?? emptyFloor();
    const b = server.levels[key] ?? emptyFloor();
    merged.levels[key] = timestampValue(a.updated_at) >= timestampValue(b.updated_at) ? a : b;
  }
  return merged;
}

/** Payload for /api/save/dungeon-plan (only floors carrying content). */
export function planSavePayload(plan: PlanState): Record<string, unknown> {
  const stamp = new Date().toISOString();
  const levels: Record<string, unknown> = {};
  for (const level of PLAN_LEVELS) {
    const key = String(level);
    const floor = plan.levels[key];
    if (!floor) continue;
    const hasContent = floor.custom || floor.enemies.length || floor.boss || floor.bossName || floor.biome || floor.notes;
    if (!hasContent) continue;
    levels[key] = floor;
  }
  return { version: plan.version, updated_at: stamp, exported_at: stamp, levels };
}

/** How the roster covers the engine's combat archetypes, for coverage hints. */
export function archetypeCoverage(roster: PlanEnemy[]): Record<ArchetypeKey, number> {
  const counts = { raider: 0, brute: 0, duelist: 0, stalker: 0, mage: 0 } as Record<ArchetypeKey, number>;
  const regular = roster.filter((enemy) => !enemy.boss);
  const scoped = regular.length ? regular : roster;
  for (const key of ARCHETYPE_KEYS) {
    const profiles = LEVEL_POOL_PROFILE_KEYS[key] || [];
    counts[key] = scoped.filter((enemy) => profiles.includes(enemy.profile)).length;
  }
  return counts;
}
