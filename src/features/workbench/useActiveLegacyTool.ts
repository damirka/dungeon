import { useMemo } from "react";
import { usePersistentState } from "./usePersistentState";
import type { LegacyTool } from "./types";

export function useActiveLegacyTool(storageKey: string, tools: LegacyTool[]) {
  const fallback = tools[0]?.id || "";
  const [activeToolId, setActiveToolId] = usePersistentState(
    storageKey,
    fallback,
    (value): value is string => typeof value === "string" && tools.some((tool) => tool.id === value)
  );

  const activeTool = useMemo(
    () => tools.find((tool) => tool.id === activeToolId) || tools[0],
    [activeToolId, tools]
  );

  function selectTool(tool: LegacyTool) {
    setActiveToolId(tool.id);
  }

  return { activeTool, activeToolId: activeTool?.id || activeToolId, selectTool };
}
