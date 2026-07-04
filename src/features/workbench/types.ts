import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export type WorkspaceId = "play" | "playtest" | "mappers" | "levels" | "dungeon";

export interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  accent: string;
  Icon: LucideIcon;
  Component: ComponentType;
}

export interface LegacyTool {
  id: string;
  label: string;
  filename: string;
  href: string;
  Icon: LucideIcon;
}
