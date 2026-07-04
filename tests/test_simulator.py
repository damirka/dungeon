import unittest

from dungeon_balance.archetypes import build_by_name
from dungeon_balance.config import BalanceConfig
from dungeon_balance.enemies import build_default_dungeon
from dungeon_balance.simulator import estimate_win_rate, simulate_dungeon


class SimulatorTests(unittest.TestCase):
    def test_simulation_is_seed_deterministic(self) -> None:
        config = BalanceConfig()
        dungeon = build_default_dungeon(config.dungeon)
        build = build_by_name("strength-dominant")

        first = simulate_dungeon(build, config=config, dungeon=dungeon, seed=123)
        second = simulate_dungeon(build, config=config, dungeon=dungeon, seed=123)

        self.assertEqual(first, second)

    def test_survivor_policy_has_better_win_rate_than_balanced_random_proxy(self) -> None:
        config = BalanceConfig()
        dungeon = build_default_dungeon(config.dungeon)

        survivor = estimate_win_rate(
            build_by_name("survivor"),
            config=config,
            dungeon=dungeon,
            runs=300,
            seed=99,
        )
        random_proxy = estimate_win_rate(
            build_by_name("balanced"),
            config=config,
            dungeon=dungeon,
            runs=300,
            seed=99,
        )

        self.assertGreater(survivor["win_rate"], random_proxy["win_rate"])


if __name__ == "__main__":
    unittest.main()
