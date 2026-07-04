import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "oryx_creature_fx_catalog.json"
MAPPER_HTML = ROOT / "public" / "legacy" / "creature_fx_mapper.html"
TACTICAL_VISUALS = ROOT / "data" / "tactical_enemy_visuals.js"


class CreatureFxMapperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        cls.entries = cls.catalog["entries"]

    def test_creature_entries_are_vertical_animation_pairs(self) -> None:
        creatures = [entry for entry in self.entries if entry["sheet"] == "creatures"]

        self.assertGreater(len(creatures), 0)
        self.assertEqual(self.catalog["sheets"]["creatures"]["tile_size"], 24)
        for entry in creatures:
            frames = entry["animation"]["frames"]
            rows = [frame["tile_row"] for frame in frames]

            self.assertEqual(entry["animation"]["kind"], "vertical_pair")
            self.assertEqual(len(frames), 2)
            self.assertEqual(frames[0]["w"], 24)
            self.assertEqual(frames[0]["h"], 24)
            self.assertEqual(rows[1], rows[0] + 1)
            self.assertEqual(rows[0] % 2, 0)
            self.assertEqual(frames[0]["tile_col"], frames[1]["tile_col"])

    def test_fx_entries_are_single_frame(self) -> None:
        fx_entries = [entry for entry in self.entries if entry["sheet"] == "fx"]

        self.assertGreater(len(fx_entries), 0)
        self.assertEqual(self.catalog["sheets"]["fx"]["tile_size"], 16)
        self.assertIn("connected opaque component bounds", self.catalog["detection"]["method"])
        self.assertTrue(all(entry["id"].startswith("fx_cmp_") for entry in fx_entries))
        self.assertTrue(any(entry["sprite"]["w"] > 16 or entry["sprite"]["h"] > 16 for entry in fx_entries))
        for entry in fx_entries:
            self.assertEqual(entry["animation"]["kind"], "single")
            self.assertEqual(len(entry["animation"]["frames"]), 1)

    def test_mapper_loads_creature_fx_seed_and_separate_storage(self) -> None:
        html = MAPPER_HTML.read_text(encoding="utf-8")

        self.assertIn("/data/oryx_creature_fx_catalog_seed.js", html)
        self.assertIn("/data/tactical_enemy_visuals.js", html)
        self.assertIn("dungeon_creature_fx_mapper_v1", html)
        self.assertRegex(html, re.compile(r"vertical_pair"))
        self.assertIn("background-image:url('${imageUrl}')", html)
        self.assertIn('"hero"', html)
        self.assertIn("frame.x ?? frame.tile_col * tile", html)
        self.assertIn("game-usage-overlay", html)
        self.assertIn("profileInput", html)
        self.assertIn("attackPicker", html)
        self.assertIn("ATTACK_TYPE_OPTIONS", html)
        self.assertIn("setAttackType", html)
        self.assertIn("propsInput", html)
        self.assertIn("spellPicker", html)
        self.assertIn("SPELL_OPTIONS", html)
        self.assertIn("enemy_spells", html)
        self.assertIn("gamePoolPicker", html)
        self.assertIn("bossSlotInput", html)
        self.assertIn("TACTICAL_VISUALS_SAVE_ENDPOINT", html)
        self.assertIn("protectedFromEnemyPools", html)
        self.assertIn("gameFilter", html)
        self.assertIn("ignoredOverlay", html)
        self.assertIn("ignored-marker", html)
        self.assertIn("gameHighlightBtn", html)
        self.assertIn("gameHighlightsVisible", html)
        self.assertIn("selectedIds", html)
        self.assertIn("selectedEntries()", html)
        self.assertIn("event.shiftKey", html)
        self.assertIn("LOCKED_SHEET", html)
        self.assertIn('["creatures", "fx"].includes(REQUESTED_SHEET)', html)
        self.assertNotIn("attacksInput", html)

    def test_combined_mapper_supports_locked_character_and_fx_modes(self) -> None:
        html = MAPPER_HTML.read_text(encoding="utf-8")

        self.assertIn("Character Mapper", html)
        self.assertIn("FX Mapper", html)
        self.assertIn("selectedSheet = LOCKED_SHEET", html)
        self.assertIn("els.sheetFilter.hidden = true", html)

    def test_curated_first_two_creature_rows_are_preserved(self) -> None:
        by_id = {entry["id"]: entry for entry in self.entries}

        self.assertEqual(by_id["cre_p00_c00"]["name"], "Knight")
        self.assertEqual(by_id["cre_p00_c00"]["category"], "hero")
        self.assertIn("hero", by_id["cre_p00_c00"]["tags"])
        self.assertNotIn("enemy_candidate", by_id["cre_p00_c00"]["tags"])
        self.assertEqual(by_id["cre_p01_c00"]["name"], "Bandit With Dagger")
        self.assertEqual(by_id["cre_p01_c17"]["name"], "Royal Knight 2")

    def test_curated_creatures_have_name_aware_combat_profiles(self) -> None:
        by_id = {entry["id"]: entry for entry in self.entries}

        self.assertEqual(by_id["cre_p07_c00"]["name"], "Goblin Rogue")
        self.assertEqual(by_id["cre_p07_c00"]["visual"]["family"], "humanoid")
        self.assertEqual(by_id["cre_p07_c00"]["combat_profile"], "dexterity")
        self.assertIn("pierce", by_id["cre_p07_c00"]["attack_types"])
        self.assertEqual(by_id["cre_p08_c00"]["combat_profile"], "hp")
        self.assertIn("undead", by_id["cre_p08_c00"]["unit_props"])
        self.assertEqual(by_id["cre_p10_c04"]["combat_profile"], "caster")
        self.assertIn("burn", by_id["cre_p10_c04"]["attack_types"])

    def test_tactical_visual_usage_file_marks_units_used_in_game(self) -> None:
        usage = TACTICAL_VISUALS.read_text(encoding="utf-8")

        self.assertIn("window.TACTICAL_ENEMY_VISUALS", usage)
        self.assertIn("cre_p07_c00", usage)
        self.assertIn("cre_p08_c14", usage)
        self.assertIn("cre_p10_c04", usage)

    def test_hero_category_units_are_not_in_tactical_enemy_visuals(self) -> None:
        usage = TACTICAL_VISUALS.read_text(encoding="utf-8")
        heroes = [entry for entry in self.entries if entry["sheet"] == "creatures" and entry["category"] == "hero"]

        self.assertGreater(len(heroes), 0)
        for hero in heroes:
            self.assertNotIn(f'"{hero["id"]}"', usage)


if __name__ == "__main__":
    unittest.main()
