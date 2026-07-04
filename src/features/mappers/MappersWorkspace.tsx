import { LegacyToolFrame } from "../legacy/LegacyToolFrame";
import { MetricCard } from "../../components/MetricCard";
import { useJsonResource } from "../../services/api";
import { useActiveLegacyTool } from "../workbench/useActiveLegacyTool";
import { WorkspaceChrome } from "../workbench/WorkspaceChrome";
import { ItemCatalogEditor } from "./ItemCatalogEditor";
import { mapperTools, NATIVE_ITEM_EDITOR_ID } from "./mapperTools";

interface CreatureFxCatalog {
  entries?: Array<{
    sheet?: string;
    category?: string;
    combat_profile?: string;
    runtime_status?: string;
    tags?: string[];
  }>;
}

interface ItemCatalog {
  items?: Array<{
    slot?: string;
    runtime_status?: string;
  }>;
}

const TOOL_STORAGE_KEY = "dungeon-workbench.mapper-tool";

function countWhere<T>(items: T[] | undefined, predicate: (item: T) => boolean) {
  return (items || []).filter(predicate).length.toString();
}

export function MappersWorkspace() {
  const { activeTool, activeToolId, selectTool } = useActiveLegacyTool(TOOL_STORAGE_KEY, mapperTools);
  const creatureCatalog = useJsonResource<CreatureFxCatalog>("/data/oryx_creature_fx_catalog.json");
  const itemCatalog = useJsonResource<ItemCatalog>("/data/oryx_item_catalog.json");
  const creatures = creatureCatalog.state === "ready" ? creatureCatalog.data.entries || [] : [];
  const items = itemCatalog.state === "ready" ? itemCatalog.data.items || [] : [];

  return (
    <WorkspaceChrome
      eyebrow="Mappers"
      title={activeTool?.label || "Characters"}
      tools={mapperTools}
      activeToolId={activeToolId}
      onSelectTool={selectTool}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <section className="border-b border-zinc-300 bg-zinc-100 px-4 py-3">
          <div className="grid gap-3 md:grid-cols-6">
            <MetricCard label="Creatures" value={countWhere(creatures, (entry) => entry.sheet === "creatures")} />
            <MetricCard label="FX" value={countWhere(creatures, (entry) => entry.sheet === "fx")} />
            <MetricCard label="Heroes" value={countWhere(creatures, (entry) => entry.category === "hero")} />
            <MetricCard label="Combat Profiles" value={countWhere(creatures, (entry) => Boolean(entry.combat_profile))} />
            <MetricCard label="Items" value={items.length.toString()} />
            <MetricCard label="Weapons" value={countWhere(items, (item) => item.slot === "weapon")} />
          </div>
          {(creatureCatalog.state === "failed" || itemCatalog.state === "failed") && (
            <div className="mt-2 text-sm font-medium text-rose-700">
              {creatureCatalog.state === "failed" ? creatureCatalog.message : itemCatalog.state === "failed" ? itemCatalog.message : ""}
            </div>
          )}
        </section>

        {activeToolId === NATIVE_ITEM_EDITOR_ID ? <ItemCatalogEditor /> : activeTool && <LegacyToolFrame tool={activeTool} />}
      </div>
    </WorkspaceChrome>
  );
}
