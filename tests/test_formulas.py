import unittest

from dungeon_balance.config import CombatConfig
from dungeon_balance.enemies import EnemyCurve, build_default_dungeon
from dungeon_balance.formulas import (
    expected_player_damage_per_turn,
    player_crit_chance,
    player_damage_quality,
    player_hit_chance,
    stat_balance_factor,
)
from dungeon_balance.models import EnemyStats, StatLine, StatWeights, WeaponProfile


class FormulaTests(unittest.TestCase):
    def test_strength_increases_expected_damage(self) -> None:
        config = CombatConfig()
        enemy = EnemyStats(name="dummy", level=1, max_hp=100, damage=1, accuracy=0.5, evasion=5)
        low = StatLine(max_hp=100, strength=8, dexterity=15)
        high = StatLine(max_hp=100, strength=20, dexterity=15)

        self.assertGreater(
            expected_player_damage_per_turn(high, enemy, WeaponProfile(), config),
            expected_player_damage_per_turn(low, enemy, WeaponProfile(), config),
        )

    def test_dexterity_increases_hit_and_crit(self) -> None:
        config = CombatConfig()
        enemy = EnemyStats(name="dummy", level=1, max_hp=100, damage=1, accuracy=0.5, evasion=8)
        low = StatLine(max_hp=100, strength=12, dexterity=6)
        high = StatLine(max_hp=100, strength=12, dexterity=24)

        self.assertGreater(
            player_hit_chance(high, enemy, WeaponProfile(), config),
            player_hit_chance(low, enemy, WeaponProfile(), config),
        )
        self.assertGreater(
            player_crit_chance(high, enemy, WeaponProfile(), config),
            player_crit_chance(low, enemy, WeaponProfile(), config),
        )

    def test_dexterity_improves_damage_roll_quality(self) -> None:
        config = CombatConfig()
        enemy = EnemyStats(name="dummy", level=1, max_hp=100, damage=1, accuracy=0.5, evasion=8)
        low = StatLine(max_hp=100, strength=12, dexterity=6)
        high = StatLine(max_hp=100, strength=12, dexterity=24)

        self.assertGreater(
            player_damage_quality(high, enemy, config),
            player_damage_quality(low, enemy, config),
        )

    def test_enemy_curve_scales_exponentially(self) -> None:
        curve = EnemyCurve()
        dungeon = build_default_dungeon(curve=curve)
        level_one_hp = [enc.enemy.max_hp for enc in dungeon if enc.level == 1 and not enc.is_boss]
        level_five_hp = [enc.enemy.max_hp for enc in dungeon if enc.level == 5 and not enc.is_boss]

        self.assertGreater(min(level_five_hp), max(level_one_hp))

    def test_balance_factor_marks_even_split_as_more_balanced(self) -> None:
        self.assertGreater(
            stat_balance_factor(StatWeights(1, 1, 1)),
            stat_balance_factor(StatWeights(8, 1, 1)),
        )


if __name__ == "__main__":
    unittest.main()
