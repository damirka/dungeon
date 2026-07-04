import { AlertTriangle, CheckCircle2, CircleDashed, MapPinned } from "lucide-react";
import { humanizeId } from "../../lib/format";
import { useJsonResource } from "../../services/api";
import { WorkspaceChrome } from "../workbench/WorkspaceChrome";
import { RoomDesigner } from "./RoomDesigner";
import type { DungeonRoomCatalog } from "./roomCatalog";

interface BiomePlan {
  updated_at?: string;
  progression?: Array<{
    level: number;
    biome: string;
    enemy_groups: string[];
    mapping_status: string;
    notes: string;
  }>;
  future_paths?: {
    enabled: boolean;
    intent?: string;
    example_shape?: string;
  };
}

function statusIcon(status: string) {
  if (status === "partial") {
    return <CircleDashed className="size-4 text-amber-600" aria-hidden="true" />;
  }
  if (status === "live") {
    return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />;
  }
  return <AlertTriangle className="size-4 text-neutral-500" aria-hidden="true" />;
}

export function LevelBuilderWorkspace() {
  const biomePlan = useJsonResource<BiomePlan>("/data/dungeon_biome_plan.json");
  const roomCatalog = useJsonResource<DungeonRoomCatalog>("/data/dungeon_room_catalog.json");

  const plan = biomePlan.state === "ready" ? biomePlan.data : null;

  return (
    <WorkspaceChrome eyebrow="Levels" title="Room Design">
      <div className="min-h-0 flex-1 overflow-auto bg-neutral-950 text-neutral-200">
        <div className="flex w-full flex-col gap-3 p-3">
          <RoomDesigner roomCatalog={roomCatalog} />

          <section className="rounded-md border border-white/10 bg-neutral-900">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <MapPinned className="size-5 text-neutral-300" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Biome Progression</h3>
              </div>
              <span className="text-xs font-medium text-neutral-500">{plan?.updated_at || "loading"}</span>
            </div>

            {biomePlan.state === "failed" && (
              <div className="px-4 py-5 text-sm text-rose-700">{biomePlan.message}</div>
            )}

            {biomePlan.state === "loading" && (
              <div className="px-4 py-5 text-sm text-neutral-500">Loading biome plan</div>
            )}

            {plan?.progression && (
              <div className="divide-y divide-white/10">
                {plan.progression.map((level) => (
                  <article key={level.level} className="grid gap-3 px-4 py-4 md:grid-cols-[7rem_1fr_11rem]">
                    <div>
                      <div className="text-xs font-semibold uppercase text-neutral-500">Level {level.level}</div>
                      <div className="mt-1 text-sm font-semibold capitalize">{humanizeId(level.biome)}</div>
                    </div>
                    <div>
                      <div className="flex flex-wrap gap-1.5">
                        {level.enemy_groups.map((group) => (
                          <span
                            key={group}
                            className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs font-medium text-neutral-300"
                          >
                            {humanizeId(group)}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">{level.notes}</p>
                    </div>
                    <div className="flex items-start gap-2 text-sm font-medium capitalize text-neutral-300">
                      {statusIcon(level.mapping_status)}
                      {level.mapping_status}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {plan?.future_paths && (
            <section className="rounded-md border border-white/10 bg-neutral-900 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Route Shape</h3>
                  <p className="mt-1 text-sm text-neutral-400">{plan.future_paths.example_shape}</p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                    plan.future_paths.enabled
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-white/10 text-neutral-300"
                  }`}
                >
                  {plan.future_paths.enabled ? "enabled" : "later"}
                </span>
              </div>
            </section>
          )}
        </div>
      </div>
    </WorkspaceChrome>
  );
}
