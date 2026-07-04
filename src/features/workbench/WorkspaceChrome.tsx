import type { ReactNode } from "react";
import type { LegacyTool } from "./types";
import { ToolTabs } from "./ToolTabs";

interface WorkspaceChromeProps {
  eyebrow: string;
  title: string;
  tools?: LegacyTool[];
  activeToolId?: string;
  onSelectTool?: (tool: LegacyTool) => void;
  children: ReactNode;
}

export function WorkspaceChrome({
  eyebrow,
  title,
  tools = [],
  activeToolId = "",
  onSelectTool,
  children
}: WorkspaceChromeProps) {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[var(--bg)] text-[var(--ink)]">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--bg-1)] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)]">{eyebrow}</div>
          <h2 className="truncate text-lg font-semibold text-[var(--ink)]" style={{ fontFamily: "var(--font-display)" }}>{title}</h2>
        </div>

        {onSelectTool && <ToolTabs tools={tools} activeToolId={activeToolId} onSelectTool={onSelectTool} />}
      </header>

      {children}
    </section>
  );
}
