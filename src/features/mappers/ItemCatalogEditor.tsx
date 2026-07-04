import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Loader2, Search, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { useJsonResource } from "../../services/api";

/**
 * Native item catalog editor: search, filter, and edit the fields the engine
 * actually consumes (name, slot, rarity band, role, status, tags, notes), with
 * live sprite previews and loot-pool visibility for weapons. Saves through the
 * same /api/save/items endpoint as the legacy mapper; the server re-bakes the
 * engine's weapon templates on every save, so item edits are picked up by the
 * game automatically.
 */

const SAVE_ENDPOINT = "/api/save/items";
const ITEM_SHEET = "/room-assets/oryx_items.png";

const RARITIES = ["common", "uncommon", "rare", "very rare", "epic", "legendary", "unique"] as const;
const ENGINE_SLOTS = ["weapon", "amulet", "charm", "relic", "shield", "focus", "consumable"];

// Mirrors tools/build_weapon_templates.mjs so the editor can show which weapons
// actually enter the loot pool. Keep in sync with the generator.
const WEAPON_FAMILY_STYLE: Record<string, string> = {
  axe: "axe",
  hammer: "axe",
  mace: "axe",
  stick: "axe",
  cane: "axe",
  sword: "sword",
  saber: "sword",
  dagger: "rapier",
  spear: "rapier",
  bow: "rapier",
  crossbow: "rapier",
  staff: "rapier",
  wand: "rapier",
  rod: "rapier",
};
const SUPPORTED_WEAPON_EFFECTS = new Set([
  "weapon_damage",
  "strength",
  "dexterity",
  "hit_chance",
  "crit_chance",
  "crit_damage",
  "damage_roll_quality",
  "double_strike",
  "stagger",
  "on_hit_burn",
  "on_hit_poison",
  "on_hit_freeze",
  "on_hit_shock",
  "boss_damage",
  "execute_damage",
  "first_strike",
  "max_hp",
]);

interface ItemSprite {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  tile_col?: number;
  tile_row?: number;
  sheet?: string;
}

interface CatalogItem {
  id: string;
  name?: string;
  sprite?: ItemSprite;
  visual?: { family?: string };
  slot?: string;
  rarity_band?: string[];
  drop_sources?: string[];
  power_recipe?: Array<{ effect?: string; weight?: number }>;
  tradeoffs?: unknown[];
  tags?: string[];
  runtime_status?: string;
  meaning?: string;
  power_role?: string;
  notes?: string;
}

interface ItemCatalog {
  version?: string;
  source_image?: string;
  tile_size?: number;
  grid?: Record<string, unknown>;
  effect_primitives?: Record<string, unknown>;
  items?: CatalogItem[];
}

type SaveStatus =
  | { state: "idle"; label: string }
  | { state: "saving"; label: string }
  | { state: "saved"; label: string }
  | { state: "failed"; label: string };

function inLootPool(item: CatalogItem): boolean {
  if (item.slot !== "weapon" || !item.sprite) return false;
  const family = item.visual?.family || "weapon";
  if (!WEAPON_FAMILY_STYLE[family]) return false;
  return (item.power_recipe || []).some((entry) => entry.effect && SUPPORTED_WEAPON_EFFECTS.has(entry.effect) && Number(entry.weight) > 0);
}

function ItemSpriteChip({ sprite, size = 32 }: { sprite?: ItemSprite; size?: number }): JSX.Element {
  const [sheet, setSheet] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const image = new Image();
    image.onload = () => setSheet({ w: image.naturalWidth, h: image.naturalHeight });
    image.src = ITEM_SHEET;
  }, []);
  if (!sprite || !Number.isFinite(sprite.x) || !Number.isFinite(sprite.y) || !sheet) {
    return <span className="inline-block rounded bg-zinc-200" style={{ width: size, height: size }} />;
  }
  const tile = sprite.w || 16;
  const scale = size / tile;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${ITEM_SHEET})`,
    backgroundPosition: `-${(sprite.x || 0) * scale}px -${(sprite.y || 0) * scale}px`,
    backgroundSize: `${sheet.w * scale}px ${sheet.h * scale}px`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };
  return <span className="inline-block shrink-0 rounded bg-zinc-900/90" style={style} />;
}

export function ItemCatalogEditor(): JSX.Element {
  const resource = useJsonResource<ItemCatalog>("/data/oryx_item_catalog.json");
  const [catalog, setCatalog] = useState<ItemCatalog | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [query, setQuery] = useState("");
  const [slotFilter, setSlotFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle", label: "Loaded from data file" });
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || resource.state !== "ready") return;
    hydrated.current = true;
    setCatalog(resource.data);
    setBaseline(JSON.stringify(resource.data.items || []));
  }, [resource]);

  const items = useMemo(() => catalog?.items || [], [catalog]);
  const dirty = useMemo(() => JSON.stringify(items) !== baseline, [items, baseline]);

  const slots = useMemo(() => {
    const observed = new Set<string>(ENGINE_SLOTS);
    for (const item of items) if (item.slot) observed.add(item.slot);
    return [...observed].sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (slotFilter !== "all" && (item.slot || "unmapped") !== slotFilter) return false;
      if (statusFilter !== "all" && (item.runtime_status || "planned") !== statusFilter) return false;
      if (
        q &&
        !(item.name || "").toLowerCase().includes(q) &&
        !item.id.toLowerCase().includes(q) &&
        !(item.tags || []).some((tag) => tag.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [items, query, slotFilter, statusFilter]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) || filtered[0] || null, [items, selectedId, filtered]);

  const updateItem = useCallback((id: string, patch: Partial<CatalogItem>) => {
    setCatalog((current) =>
      current
        ? { ...current, items: (current.items || []).map((item) => (item.id === id ? { ...item, ...patch } : item)) }
        : current,
    );
  }, []);

  const save = useCallback(async () => {
    if (!catalog) return;
    setSaveStatus({ state: "saving", label: "Saving" });
    const stamp = new Date().toISOString();
    try {
      const response = await fetch(SAVE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: catalog.version,
          source_image: catalog.source_image,
          tile_size: catalog.tile_size,
          grid: catalog.grid,
          effect_primitives: catalog.effect_primitives,
          updated_at: stamp,
          exported_at: stamp,
          entries: catalog.items || [],
        }),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const result = (await response.json()) as { entries?: number; weapon_templates?: number };
      setBaseline(JSON.stringify(catalog.items || []));
      setSaveStatus({
        state: "saved",
        label: `Saved ${result.entries ?? 0} items · ${result.weapon_templates ?? 0} weapon templates re-baked`,
      });
    } catch (error) {
      setSaveStatus({ state: "failed", label: `Save failed: ${(error as Error).message}` });
    }
  }, [catalog]);

  const revert = useCallback(() => {
    if (!catalog) return;
    setCatalog({ ...catalog, items: JSON.parse(baseline) as CatalogItem[] });
  }, [catalog, baseline]);

  if (resource.state === "loading" || !catalog) {
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">Loading item catalog…</div>;
  }
  if (resource.state === "failed") {
    return <div className="flex flex-1 items-center justify-center text-sm text-rose-600">Item catalog failed to load: {resource.message}</div>;
  }

  const lootWeapons = items.filter(inLootPool).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-100 text-zinc-900">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-300 bg-white px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, id, or tag"
            className="w-64 rounded border border-zinc-300 py-1.5 pl-7 pr-2 text-sm"
          />
        </div>
        <select value={slotFilter} onChange={(event) => setSlotFilter(event.target.value)} className="rounded border border-zinc-300 px-2 py-1.5 text-sm">
          <option value="all">All slots</option>
          {slots.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="live">live</option>
          <option value="planned">planned</option>
        </select>
        <span className="text-xs text-zinc-500">
          {filtered.length} / {items.length} items · {lootWeapons} weapons in the loot pool
        </span>
        <div className="ml-auto flex items-center gap-2">
          {saveStatus.state === "saving" && <Loader2 className="size-4 animate-spin text-zinc-500" aria-hidden="true" />}
          {saveStatus.state === "saved" && <Cloud className="size-4 text-emerald-600" aria-hidden="true" />}
          {saveStatus.state === "failed" && <CloudOff className="size-4 text-rose-600" aria-hidden="true" />}
          <span className="max-w-72 truncate text-xs text-zinc-500">{saveStatus.label}</span>
          <button
            type="button"
            onClick={revert}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 enabled:hover:bg-zinc-100 disabled:opacity-40"
          >
            <Undo2 className="size-3.5" aria-hidden="true" /> Revert
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saveStatus.state === "saving"}
            className="rounded bg-sky-600 px-3 py-1.5 text-xs font-bold text-white enabled:hover:bg-sky-500 disabled:opacity-40"
          >
            Save catalog
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_24rem]">
        {/* item table */}
        <div className="min-h-0 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-2 py-2">Slot</th>
                <th className="px-2 py-2">Rarity band</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Loot</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`cursor-pointer border-b border-zinc-200 ${selected?.id === item.id ? "bg-sky-50" : "hover:bg-zinc-50"}`}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <ItemSpriteChip sprite={item.sprite} size={28} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.name || <span className="italic text-zinc-400">unnamed</span>}</div>
                        <div className="truncate text-[11px] text-zinc-400">{item.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-zinc-600">{item.slot || "unmapped"}</td>
                  <td className="px-2 py-1.5 text-xs text-zinc-500">{(item.rarity_band || []).join(", ") || "—"}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        (item.runtime_status || "planned") === "live" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200 text-zinc-600"
                      }`}
                    >
                      {item.runtime_status || "planned"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {item.slot === "weapon" &&
                      (inLootPool(item) ? (
                        <span title="Drops as a loot weapon (valid style + supported effects)">
                          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                        </span>
                      ) : (
                        <span title="Weapon is NOT in the loot pool — family has no style mapping or no supported effects">
                          <AlertTriangle className="size-4 text-amber-500" aria-hidden="true" />
                        </span>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-sm text-zinc-500">No items match the current filters.</div>}
        </div>

        {/* detail editor */}
        <aside className="min-h-0 overflow-auto border-l border-zinc-300 bg-white p-4">
          {!selected ? (
            <div className="text-sm text-zinc-500">Select an item to edit it.</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <ItemSpriteChip sprite={selected.sprite} size={48} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{selected.name || "unnamed"}</div>
                  <div className="truncate text-xs text-zinc-400">
                    {selected.id} · {selected.visual?.family || "unknown family"}
                  </div>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">
                Name
                <input
                  type="text"
                  value={selected.name || ""}
                  onChange={(event) => updateItem(selected.id, { name: event.target.value })}
                  className="rounded border border-zinc-300 px-2 py-1.5 text-sm font-normal"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">
                  Slot
                  <select
                    value={selected.slot || "unmapped"}
                    onChange={(event) => updateItem(selected.id, { slot: event.target.value })}
                    className="rounded border border-zinc-300 px-2 py-1.5 text-sm font-normal"
                  >
                    {[...new Set(["unmapped", ...slots])].map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">
                  Runtime status
                  <select
                    value={selected.runtime_status || "planned"}
                    onChange={(event) => updateItem(selected.id, { runtime_status: event.target.value })}
                    className="rounded border border-zinc-300 px-2 py-1.5 text-sm font-normal"
                  >
                    <option value="planned">planned</option>
                    <option value="live">live</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">
                Rarity band
                <div className="flex flex-wrap gap-1">
                  {RARITIES.map((rarity) => {
                    const active = (selected.rarity_band || []).includes(rarity);
                    return (
                      <button
                        key={rarity}
                        type="button"
                        onClick={() => {
                          const band = new Set(selected.rarity_band || []);
                          if (active) band.delete(rarity);
                          else band.add(rarity);
                          updateItem(selected.id, { rarity_band: RARITIES.filter((r) => band.has(r)) });
                        }}
                        className={`rounded border px-2 py-1 text-[11px] font-medium ${
                          active ? "border-sky-500 bg-sky-100 text-sky-700" : "border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50"
                        }`}
                      >
                        {rarity}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">
                Power role
                <input
                  type="text"
                  value={selected.power_role || ""}
                  onChange={(event) => updateItem(selected.id, { power_role: event.target.value })}
                  placeholder="e.g. instant_consumable, stat_stick"
                  className="rounded border border-zinc-300 px-2 py-1.5 text-sm font-normal"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">
                Tags (comma separated)
                <input
                  type="text"
                  value={(selected.tags || []).join(", ")}
                  onChange={(event) =>
                    updateItem(selected.id, {
                      tags: [...new Set(event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))],
                    })
                  }
                  className="rounded border border-zinc-300 px-2 py-1.5 text-sm font-normal"
                />
              </label>

              <div className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">
                Power recipe <span className="font-normal">(edited in the legacy Items mapper for now)</span>
                <ul className="flex flex-col gap-0.5 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-normal text-zinc-600">
                  {(selected.power_recipe || []).length === 0 && <li className="italic text-zinc-400">no effects</li>}
                  {(selected.power_recipe || []).map((entry, index) => (
                    <li key={index} className="flex items-center justify-between gap-2">
                      <span className={entry.effect && SUPPORTED_WEAPON_EFFECTS.has(entry.effect) ? "" : "text-amber-600"}>
                        {entry.effect || "?"}
                        {selected.slot === "weapon" && entry.effect && !SUPPORTED_WEAPON_EFFECTS.has(entry.effect) && " (not engine-supported)"}
                      </span>
                      <span className="tabular-nums text-zinc-400">{entry.weight}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">
                Notes
                <textarea
                  value={selected.notes || ""}
                  onChange={(event) => updateItem(selected.id, { notes: event.target.value })}
                  rows={3}
                  className="resize-y rounded border border-zinc-300 px-2 py-1.5 text-sm font-normal"
                />
              </label>

              {selected.slot === "weapon" && !inLootPool(selected) && (
                <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                  This weapon will NOT drop in game: it needs a family with a style mapping ({Object.keys(WEAPON_FAMILY_STYLE).join(", ")}) and at
                  least one engine-supported effect in its power recipe.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
