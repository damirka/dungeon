import { useMemo } from "react";
import { useApiStatus } from "./services/api";
import { usePersistentState } from "./features/workbench/usePersistentState";
import { WorkbenchShell } from "./features/workbench/WorkbenchShell";
import type { WorkspaceId } from "./features/workbench/types";
import { workspaces } from "./features/workbench/workspaces";

const WORKSPACE_KEY = "dungeon-workbench.workspace";

function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === "string" && workspaces.some((workspace) => workspace.id === value);
}

export function App() {
  const [activeWorkspace, setActiveWorkspace] = usePersistentState<WorkspaceId>(
    WORKSPACE_KEY,
    "play",
    isWorkspaceId
  );
  const { status, refresh } = useApiStatus();

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === activeWorkspace) || workspaces[0],
    [activeWorkspace]
  );
  const ActiveWorkspace = workspace.Component;

  return (
    <WorkbenchShell
      workspaces={workspaces}
      activeWorkspace={activeWorkspace}
      apiStatus={status}
      onRefreshApi={refresh}
      onSelectWorkspace={setActiveWorkspace}
    >
      <ActiveWorkspace />
    </WorkbenchShell>
  );
}
