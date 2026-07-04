import { Boxes, Castle, FlaskConical, Map, Swords } from "lucide-react";
import { DungeonWorkspace } from "../dungeon/DungeonWorkspace";
import { LevelBuilderWorkspace } from "../level-building/LevelBuilderWorkspace";
import { MappersWorkspace } from "../mappers/MappersWorkspace";
import { PlayWorkspace } from "../play/PlayWorkspace";
import { PlaytestWorkspace } from "../playtest/PlaytestWorkspace";
import type { WorkspaceDefinition } from "./types";

export const workspaces: WorkspaceDefinition[] = [
  { id: "play", label: "Play", Icon: Swords, accent: "bg-orange-500", Component: PlayWorkspace },
  { id: "playtest", label: "Playtest", Icon: FlaskConical, accent: "bg-emerald-500", Component: PlaytestWorkspace },
  { id: "mappers", label: "Mappers", Icon: Boxes, accent: "bg-sky-500", Component: MappersWorkspace },
  { id: "levels", label: "Levels", Icon: Map, accent: "bg-amber-500", Component: LevelBuilderWorkspace },
  { id: "dungeon", label: "Dungeon", Icon: Castle, accent: "bg-violet-500", Component: DungeonWorkspace }
];
