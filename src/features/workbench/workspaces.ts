import { Boxes, Castle, Map, Swords } from "lucide-react";
import { DungeonWorkspace } from "../dungeon/DungeonWorkspace";
import { LevelBuilderWorkspace } from "../level-building/LevelBuilderWorkspace";
import { MappersWorkspace } from "../mappers/MappersWorkspace";
import { PlayWorkspace } from "../play/PlayWorkspace";
import type { WorkspaceDefinition } from "./types";

const allWorkspaces: WorkspaceDefinition[] = [
  { id: "play", label: "Play", Icon: Swords, accent: "bg-orange-500", Component: PlayWorkspace },
  { id: "mappers", label: "Mappers", Icon: Boxes, accent: "bg-sky-500", Component: MappersWorkspace },
  { id: "levels", label: "Levels", Icon: Map, accent: "bg-amber-500", Component: LevelBuilderWorkspace },
  { id: "dungeon", label: "Dungeon", Icon: Castle, accent: "bg-violet-500", Component: DungeonWorkspace }
];

// Production builds (e.g. the Vercel deploy) publish the GAME plus the room
// designer: Levels works without the local save API by keeping edits in
// localStorage and sharing them as files via Export / Import. The remaining
// workspaces stay dev-only — their save endpoints exist only in the local
// Vite mapper-API plugin.
const PROD_WORKSPACES = new Set(["play", "levels"]);
export const workspaces: WorkspaceDefinition[] =
  import.meta.env.PROD ? allWorkspaces.filter((workspace) => PROD_WORKSPACES.has(workspace.id)) : allWorkspaces;
