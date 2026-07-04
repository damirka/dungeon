import { Copy, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricCard } from "../../components/MetricCard";
import { numberValue, pct } from "../../lib/format";
import { useJsonResource } from "../../services/api";
import { WorkspaceChrome } from "../workbench/WorkspaceChrome";

interface BalanceMetrics {
  updated_at?: string;
  status?: string;
  canonical_runtime?: string;
  react_metrics_status?: string;
  sample?: {
    source?: string;
    canonical_for_current_react_game?: boolean;
    runs?: number;
    build?: string;
    character?: string;
    starting_weapon?: string;
    action_policy?: string;
    loot_policy?: string;
    encounter_model?: string;
  };
  core_metrics?: {
    win_rate?: number;
    avg_rooms_cleared?: number;
    rooms_p50?: number;
    rooms_p90?: number;
    rooms_p95?: number;
    rooms_p99?: number;
  };
  floor_reach_rates?: Record<string, number | undefined>;
  boss_gates?: {
    reach_l2_boss_rate?: number;
    clear_l2_boss_rate?: number;
    reach_l3_boss_rate?: number;
    clear_l3_boss_rate?: number;
    reach_l4_boss_rate?: number;
    clear_l4_boss_rate?: number;
    reach_l5_boss_rate?: number;
    clear_l5_boss_rate?: number;
  };
  conditional_boss_pass_rates?: Record<string, number | undefined>;
  weapon_lift_sample?: {
    runs_per_weapon?: number;
    seed?: number;
    rows?: Array<{
      weapon: string;
      win_rate?: number;
      reach_l3_boss_rate?: number;
      reach_l4_boss_rate?: number;
      reach_l5_rate?: number;
      rooms_p90?: number;
      win_lift_points?: number;
      l3_boss_lift_points?: number;
    }>;
  };
  interpretation?: string[];
}

function labelValue(value?: string) {
  return value ? value.replace(/_/g, " ") : "-";
}

function compactStatus(value?: string) {
  if (value === "historical_reference_until_react_batch_runner_exists") return "Historical reference";
  if (value === "pending_native_typescript_batch_runner") return "Pending TS runner";
  return labelValue(value);
}

function buildBalanceExport(data: BalanceMetrics) {
  const sample = data.sample || {};
  const core = data.core_metrics || {};
  const boss = data.boss_gates || {};
  const rows = data.weapon_lift_sample?.rows || [];

  return `# Dungeon Balance Snapshot

Updated: ${data.updated_at || "-"}
Status: ${labelValue(data.status)}
Canonical runtime: ${data.canonical_runtime || "-"}
React metrics: ${labelValue(data.react_metrics_status)}
Sample source: ${labelValue(sample.source)}
Character: ${sample.character || sample.build || "-"}
Build policy: ${sample.build || "-"}
Weapon: ${sample.starting_weapon || "-"}
Runs: ${sample.runs ?? "-"}
Action policy: ${sample.action_policy || "-"}
Loot policy: ${sample.loot_policy || "-"}
Encounter model: ${labelValue(sample.encounter_model)}

## Core
- Win rate: ${pct(core.win_rate)}
- Avg rooms: ${numberValue(core.avg_rooms_cleared)}
- Rooms p50/p90/p95/p99: ${numberValue(core.rooms_p50)} / ${numberValue(core.rooms_p90)} / ${numberValue(core.rooms_p95)} / ${numberValue(core.rooms_p99)}

## Boss Gates
- Reach L2 boss: ${pct(boss.reach_l2_boss_rate)} | clear: ${pct(boss.clear_l2_boss_rate)}
- Reach L3 boss: ${pct(boss.reach_l3_boss_rate)} | clear: ${pct(boss.clear_l3_boss_rate)}
- Reach L4 boss: ${pct(boss.reach_l4_boss_rate)} | clear: ${pct(boss.clear_l4_boss_rate)}
- Reach L5 boss: ${pct(boss.reach_l5_boss_rate)} | clear: ${pct(boss.clear_l5_boss_rate)}

## Weapon Lift
${rows.length ? rows.map((row) => `- ${row.weapon}: win ${pct(row.win_rate)} | L3B ${pct(row.reach_l3_boss_rate)} | L4B ${pct(row.reach_l4_boss_rate)} | win lift ${numberValue(row.win_lift_points)} pts`).join("\n") : "- no weapon lift sample"}

## Notes
${data.interpretation?.length ? data.interpretation.map((item) => `- ${item}`).join("\n") : "- none"}
`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PlaytestWorkspace() {
  const metrics = useJsonResource<BalanceMetrics>("/data/balance_metrics_latest.json");
  const data = metrics.state === "ready" ? metrics.data : null;
  const sample = data?.sample;
  const [exportStatus, setExportStatus] = useState("");
  const exportText = useMemo(() => (data ? buildBalanceExport(data) : ""), [data]);

  async function copySnapshot() {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      setExportStatus("Copied balance snapshot");
    } catch {
      downloadText("dungeon-balance-snapshot.md", exportText);
      setExportStatus("Downloaded balance snapshot");
    }
  }

  function downloadSnapshot() {
    if (!exportText) return;
    downloadText("dungeon-balance-snapshot.md", exportText);
    setExportStatus("Downloaded balance snapshot");
  }

  return (
    <WorkspaceChrome
      eyebrow="Playtest"
      title="React Balance"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <section className="border-b border-zinc-300 bg-zinc-100 px-4 py-3">
          <div className="grid gap-3 md:grid-cols-5">
            <MetricCard
              label="Ref Win Rate"
              value={pct(data?.core_metrics?.win_rate)}
              detail={sample?.canonical_for_current_react_game === false ? "historical" : sample?.character || sample?.build}
            />
            <MetricCard
              label="Ref Avg Rooms"
              value={numberValue(data?.core_metrics?.avg_rooms_cleared)}
              detail={sample?.starting_weapon}
            />
            <MetricCard label="Ref Rooms p90" value={numberValue(data?.core_metrics?.rooms_p90)} />
            <MetricCard label="Ref L3 Boss" value={pct(data?.boss_gates?.reach_l3_boss_rate)} />
            <MetricCard label="React Metrics" value={compactStatus(data?.react_metrics_status)} />
          </div>
          {metrics.state === "failed" && (
            <div className="mt-2 text-sm font-medium text-rose-700">{metrics.message}</div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-300 pt-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              {sample?.runs ? `${sample.runs.toLocaleString()} historical reference` : "No sample loaded"}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {exportStatus && <span className="text-sm font-medium text-emerald-700">{exportStatus}</span>}
              <button
                type="button"
                onClick={copySnapshot}
                disabled={!exportText}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy size={16} />
                Copy Snapshot
              </button>
              <button
                type="button"
                onClick={downloadSnapshot}
                disabled={!exportText}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={16} />
                Download
              </button>
            </div>
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-auto bg-white px-4 py-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-md border border-zinc-300 bg-zinc-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Canonical Runtime</div>
              <div className="mt-2 font-mono text-sm text-zinc-900">{data?.canonical_runtime || "src/features/playtest/engine"}</div>
            </div>
            <div className="rounded-md border border-zinc-300 bg-zinc-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Snapshot Status</div>
              <div className="mt-2 text-sm font-semibold text-zinc-900">{compactStatus(data?.status)}</div>
            </div>
            <div className="rounded-md border border-zinc-300 bg-zinc-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Next Metric</div>
              <div className="mt-2 text-sm font-semibold text-zinc-900">{compactStatus(data?.react_metrics_status)}</div>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceChrome>
  );
}
