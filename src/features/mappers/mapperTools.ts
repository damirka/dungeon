import { Image, ScanSearch, SlidersHorizontal, Sparkles, WandSparkles } from "lucide-react";
import type { LegacyTool } from "../workbench/types";

/** The native (non-iframe) tool ids rendered by MappersWorkspace itself. */
export const NATIVE_ITEM_EDITOR_ID = "item-editor";

export const mapperTools: LegacyTool[] = [
  {
    id: NATIVE_ITEM_EDITOR_ID,
    label: "Item Editor",
    filename: "",
    href: "",
    Icon: SlidersHorizontal
  },
  {
    id: "character-mapper",
    label: "Characters",
    filename: "creature_fx_mapper.html",
    href: "/legacy/creature_fx_mapper.html?sheet=creatures",
    Icon: Sparkles
  },
  {
    id: "fx-mapper",
    label: "FX",
    filename: "creature_fx_mapper.html",
    href: "/legacy/creature_fx_mapper.html?sheet=fx",
    Icon: WandSparkles
  },
  {
    id: "item-mapper",
    label: "Items",
    filename: "sprite_meaning_mapper.html",
    href: "/legacy/sprite_meaning_mapper.html",
    Icon: ScanSearch
  },
  {
    id: "item-preview",
    label: "Catalog",
    filename: "oryx_item_catalog_preview.html",
    href: "/legacy/oryx_item_catalog_preview.html",
    Icon: Image
  }
];
