import re
import unittest
from pathlib import Path

from dungeon_balance.config import BalanceConfig
from dungeon_balance.enemies import EnemyCurve


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "public" / "legacy" / "balance_verifier.html").read_text(encoding="utf-8")


def js_number(name: str) -> float:
    match = re.search(rf"{name}: ([0-9.]+)", HTML)
    if not match:
        raise AssertionError(f"Missing JS constant: {name}")
    return float(match.group(1))


class VerifierHtmlTests(unittest.TestCase):
    def test_embedded_combat_constants_match_python_defaults(self) -> None:
        config = BalanceConfig()

        self.assertEqual(js_number("damageVariance"), config.combat.damage_variance)
        self.assertEqual(js_number("dexterityDamageQualityScale"), config.combat.dexterity_damage_quality_scale)
        self.assertEqual(js_number("maxDamageQuality"), config.combat.max_damage_quality)
        self.assertEqual(js_number("statBudgetGainPerEncounter"), config.dungeon.stat_budget_gain_per_encounter)
        self.assertEqual(js_number("statBudgetGainPerLevel"), config.dungeon.stat_budget_gain_per_level)
        self.assertEqual(js_number("statBudgetGainGrowth"), config.dungeon.stat_budget_gain_growth)

    def test_embedded_enemy_curve_matches_python_defaults(self) -> None:
        curve = EnemyCurve()

        self.assertEqual(js_number("hpGrowth"), curve.hp_growth)
        self.assertEqual(js_number("damageGrowth"), curve.damage_growth)
        self.assertEqual(js_number("bossHpMultiplier"), curve.boss_hp_multiplier)
        self.assertEqual(js_number("bossDamageMultiplier"), curve.boss_damage_multiplier)

    def test_expected_and_rolled_modes_are_present(self) -> None:
        self.assertIn("Apply Expected", HTML)
        self.assertIn("Roll Fight", HTML)
        self.assertIn("Math.random()", HTML)


if __name__ == "__main__":
    unittest.main()
