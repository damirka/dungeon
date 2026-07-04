import type { ReactNode } from "react";
import type { ApiStatus } from "../../services/api";
import type { WorkspaceDefinition, WorkspaceId } from "./types";
import { RuneLogo } from "../play/icons";

interface WorkbenchShellProps {
  workspaces: WorkspaceDefinition[];
  activeWorkspace: WorkspaceId;
  apiStatus: ApiStatus;
  onRefreshApi: () => void;
  onSelectWorkspace: (workspace: WorkspaceId) => void;
  children: ReactNode;
}

export function WorkbenchShell({
  workspaces,
  activeWorkspace,
  apiStatus,
  onRefreshApi,
  onSelectWorkspace,
  children,
}: WorkbenchShellProps) {
  const dot = apiStatus.state === "online" ? "var(--heal)" : apiStatus.state === "offline" ? "var(--ink-faint)" : "var(--gold)";

  return (
    <div className="hd-shell">
      <nav className="hd-rail" aria-label="Workbench areas">
        <div className="hd-rail-logo" title="Hollow Descent">
          <RuneLogo size={36} />
        </div>
        {workspaces.map((item) => (
          <button
            key={item.id}
            type="button"
            className="hd-rail-btn"
            data-active={item.id === activeWorkspace}
            onClick={() => onSelectWorkspace(item.id)}
            title={item.label}
          >
            <item.Icon className="size-5" aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
        <div style={{ marginTop: "auto" }}>
          <button
            type="button"
            onClick={onRefreshApi}
            title={`Mapper API: ${apiStatus.label}`}
            aria-label="Mapper API status"
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: dot,
              border: "none",
              cursor: "pointer",
              boxShadow: `0 0 8px ${dot}`,
            }}
          />
        </div>
      </nav>
      <main className="hd-main">{children}</main>
    </div>
  );
}
