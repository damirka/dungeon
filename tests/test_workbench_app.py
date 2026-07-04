import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WorkbenchAppTests(unittest.TestCase):
    def test_react_vite_typescript_pnpm_project_is_declared(self) -> None:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))

        self.assertEqual(package["packageManager"], "pnpm@9.15.2")
        self.assertIn("vite", package["scripts"]["dev"])
        self.assertIn("react", package["dependencies"])
        self.assertIn("typescript", package["devDependencies"])
        self.assertIn("tailwindcss", package["devDependencies"])

    def test_workstream_folders_are_split_for_parallel_work(self) -> None:
        for folder in (
            ROOT / "src" / "features" / "playtest",
            ROOT / "src" / "features" / "mappers",
            ROOT / "src" / "features" / "level-building",
            ROOT / "src" / "features" / "legacy",
            ROOT / "src" / "services",
            ROOT / "src" / "lib",
        ):
            self.assertTrue(folder.exists(), folder)

    def test_workspaces_are_registered_outside_app_shell(self) -> None:
        app = (ROOT / "src" / "App.tsx").read_text(encoding="utf-8")
        registry = (ROOT / "src" / "features" / "workbench" / "workspaces.ts").read_text(encoding="utf-8")

        self.assertIn("from \"./features/workbench/workspaces\"", app)
        self.assertIn("PlaytestWorkspace", registry)
        self.assertIn("MappersWorkspace", registry)
        self.assertIn("LevelBuilderWorkspace", registry)

    def test_legacy_tools_live_under_app_public_area(self) -> None:
        for filename in (
            "tactical_playtest.html",
            "balance_verifier.html",
            "creature_fx_mapper.html",
            "sprite_meaning_mapper.html",
            "oryx_item_catalog_preview.html",
        ):
            self.assertTrue((ROOT / "public" / "legacy" / filename).exists(), filename)

    def test_vite_serves_mapper_api_natively(self) -> None:
        config = (ROOT / "vite.config.ts").read_text(encoding="utf-8")

        self.assertIn("mapperApi", config)
        self.assertIn("./tools/mapperApi.mjs", config)
        self.assertNotIn("proxy", config)
        self.assertIn('host: "::"', config)
        self.assertIn('ignored: ["**/data/**"]', config)

    def test_mapper_api_handles_data_assets_and_saves(self) -> None:
        api = (ROOT / "tools" / "mapperApi.mjs").read_text(encoding="utf-8")

        for endpoint in (
            "/api/save/creature-fx",
            "/api/save/items",
            "/api/save/rooms",
            "/api/save/tactical-visuals",
        ):
            self.assertIn(endpoint, api)
        self.assertIn("/api/status", api)
        self.assertIn("configureServer", api)
        self.assertIn("configurePreviewServer", api)

    def test_legacy_mappers_keep_live_save_and_asset_hooks(self) -> None:
        creature_html = (ROOT / "public" / "legacy" / "creature_fx_mapper.html").read_text(encoding="utf-8")
        item_html = (ROOT / "public" / "legacy" / "sprite_meaning_mapper.html").read_text(encoding="utf-8")

        for html, endpoint in (
            (creature_html, "/api/save/creature-fx"),
            (item_html, "/api/save/items"),
        ):
            self.assertIn(endpoint, html)
            self.assertIn("LIVE_SAVE_ENABLED", html)
            self.assertIn("saveToServer", html)
            self.assertIn("fetch(LIVE_SAVE_ENDPOINT", html)
        self.assertIn("/api/save/tactical-visuals", creature_html)
        self.assertIn("/assets/oryx_items.png", item_html)
        self.assertIn("/assets/oryx_creatures.png", creature_html)
        self.assertIn("/assets/oryx_fx.png", creature_html)

    def test_native_workspaces_read_shared_data_services(self) -> None:
        playtest = (ROOT / "src" / "features" / "playtest" / "PlaytestWorkspace.tsx").read_text(encoding="utf-8")
        mappers = (ROOT / "src" / "features" / "mappers" / "MappersWorkspace.tsx").read_text(encoding="utf-8")
        levels = (ROOT / "src" / "features" / "level-building" / "LevelBuilderWorkspace.tsx").read_text(encoding="utf-8")

        self.assertIn("useJsonResource", playtest)
        self.assertIn("/data/balance_metrics_latest.json", playtest)
        self.assertIn("Copy Snapshot", playtest)
        self.assertIn("buildBalanceExport", playtest)
        self.assertIn("/data/oryx_creature_fx_catalog.json", mappers)
        self.assertIn("/data/oryx_item_catalog.json", mappers)
        self.assertIn("/data/dungeon_biome_plan.json", levels)
        self.assertIn("/data/dungeon_room_catalog.json", levels)

    def test_room_designer_uses_live_save_and_world_tilesheet(self) -> None:
        designer = (ROOT / "src" / "features" / "level-building" / "RoomDesigner.tsx").read_text(encoding="utf-8")
        room_catalog = (ROOT / "src" / "features" / "level-building" / "roomCatalog.ts").read_text(encoding="utf-8")
        catalog = ROOT / "data" / "dungeon_room_catalog.json"

        self.assertTrue(catalog.exists())
        self.assertIn("dungeon-workbench.room-catalog", designer)
        self.assertIn("/api/save/rooms", designer)
        self.assertIn("/room-assets/oryx_16bit_fantasy_world_trans.png", room_catalog)
        self.assertIn('RoomKind = "entrance" | "encounter" | "treasury" | "special" | "passage"', room_catalog)
        self.assertIn('RoomTileLayer = "floor" | "wall" | "decor"', room_catalog)
        self.assertIn('id: "entrance", label: "Entrance"', room_catalog)
        self.assertIn("ROOM_TILE_LAYERS", designer)
        self.assertIn('ROOM_RENDER_LAYERS: RoomTileLayer[] = ["floor", "decor", "wall"]', designer)
        self.assertIn("getResizeModeFromPointer", designer)
        self.assertIn("pickVisualCell", designer)
        self.assertIn("tileFlipped", designer)
        self.assertIn("Mirror horizontally (R)", designer)
        self.assertIn("redoStack", designer)
        self.assertIn("handleRedo", designer)
        self.assertIn("window.confirm", designer)
        self.assertIn("HERO_SPRITE", designer)
        self.assertIn("handleHeroStep", designer)
        self.assertIn("heroCanEnter", designer)
        self.assertIn("Play room", designer)
        self.assertIn("Reset hero", designer)
        self.assertIn("overflow-y-scroll", designer)
        self.assertIn("selectInitialCatalog", designer)
        self.assertIn("latest_live_save_at", designer)
        self.assertIn("localStorage", designer)

    def test_character_and_fx_mappers_are_distinct_tools(self) -> None:
        tools = (ROOT / "src" / "features" / "mappers" / "mapperTools.ts").read_text(encoding="utf-8")

        self.assertIn('id: "character-mapper"', tools)
        self.assertIn('href: "/legacy/creature_fx_mapper.html?sheet=creatures"', tools)
        self.assertIn('id: "fx-mapper"', tools)
        self.assertIn('href: "/legacy/creature_fx_mapper.html?sheet=fx"', tools)

    def test_legacy_adapter_is_isolated_from_core_shell(self) -> None:
        legacy_adapter = ROOT / "src" / "features" / "legacy" / "LegacyToolFrame.tsx"

        self.assertTrue(legacy_adapter.exists())
        self.assertFalse((ROOT / "src" / "components" / "LegacyToolFrame.tsx").exists())

if __name__ == "__main__":
    unittest.main()
