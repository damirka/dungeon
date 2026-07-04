import type { LegacyTool } from "./types";

interface ToolTabsProps {
  tools: LegacyTool[];
  activeToolId: string;
  onSelectTool: (tool: LegacyTool) => void;
}

export function ToolTabs({ tools, activeToolId, onSelectTool }: ToolTabsProps) {
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--panel)] p-1">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => onSelectTool(tool)}
          className={`flex h-9 items-center gap-2 whitespace-nowrap rounded px-3 text-sm font-medium transition ${
            tool.id === activeToolId
              ? "bg-[var(--ember)] text-[var(--on-ember)]"
              : "text-[var(--ink-dim)] hover:bg-[var(--panel-2)] hover:text-[var(--ink)]"
          }`}
        >
          <tool.Icon className="size-4" aria-hidden="true" />
          <span>{tool.label}</span>
        </button>
      ))}
    </div>
  );
}
