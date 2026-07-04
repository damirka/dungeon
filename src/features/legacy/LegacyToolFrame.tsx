import { ExternalLink, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { LegacyTool } from "../workbench/types";

interface LegacyToolFrameProps {
  tool: LegacyTool;
}

export function LegacyToolFrame({ tool }: LegacyToolFrameProps) {
  const [reloadToken, setReloadToken] = useState(0);
  const src = useMemo(() => {
    if (reloadToken === 0) {
      return tool.href;
    }
    const separator = tool.href.includes("?") ? "&" : "?";
    return `${tool.href}${separator}reload=${reloadToken}`;
  }, [reloadToken, tool.href]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--bg-1)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <tool.Icon className="size-4 shrink-0 text-[var(--ink-faint)]" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-[var(--ink-dim)]">{tool.filename}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            className="grid size-8 place-items-center rounded-md border border-[var(--line-2)] bg-[var(--panel)] text-[var(--ink-dim)] hover:border-[var(--ember-deep)] hover:text-[var(--ink)]"
            title="Reload tool"
            aria-label="Reload tool"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </button>
          <a
            href={tool.href}
            target="_blank"
            rel="noreferrer"
            className="grid size-8 place-items-center rounded-md border border-[var(--line-2)] bg-[var(--panel)] text-[var(--ink-dim)] hover:border-[var(--ember-deep)] hover:text-[var(--ink)]"
            title="Open tool in new tab"
            aria-label="Open tool in new tab"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
      <iframe
        key={`${tool.id}-${reloadToken}`}
        className="min-h-0 flex-1 border-0 bg-white"
        title={tool.label}
        src={src}
      />
    </div>
  );
}
