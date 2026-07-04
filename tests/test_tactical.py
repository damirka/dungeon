import random
import unittest

from dungeon_balance.archetypes import build_by_name
from dungeon_balance.config import BalanceConfig
from dungeon_balance.loot import LootConfig
from dungeon_balance.tactical import (
    EnemyGroup,
    EnemyIntent,
    PlayerAction,
    TacticalEnemy,
    _action_mana_cost,
    _ability_guard_reduction,
    _choose_action,
    _choose_intent,
    _resolve_player_attack,
    _resolve_player_sweep,
    _resolve_riposte_counter,
    _sweep_damage_multiplier,
    _player_hit_probability,
    build_randomized_tactical_dungeon,
    build_tactical_dungeon,
    estimate_tactical_loot_win_rate,
    simulate_tactical_combat,
    simulate_tactical_dungeon_with_loot,
)
from dungeon_balance.models import EnemyStats, StatLine, WeaponProfile


class TacticalTests(unittest.TestCase):
    def test_tactical_dungeon_contains_multi_enemy_rooms(self) -> None:
        groups = build_tactical_dungeon(BalanceConfig())

        self.assertEqual(len(groups), 40)
        self.assertTrue(any(len(group.enemies) > 1 for group in groups))

    def test_randomized_tactical_dungeon_preserves_structure(self) -> None:
        config = BalanceConfig()
        first = build_randomized_tactical_dungeon(config, random.Random(111))
        second = build_randomized_tactical_dungeon(config, random.Random(111))
        different = build_randomized_tactical_dungeon(config, random.Random(112))

        self.assertEqual(first, second)
        self.assertEqual(len(first), 40)
        self.assertEqual(sum(group.is_boss for group in first), config.dungeon.levels)
        self.assertEqual([group.level for group in first[7::8]], [1, 2, 3, 4, 5])
        self.assertEqual(
            [group.enemy.name for group in first[7::8]],
            [
                "L1 Boss Raider",
                "L2 Boss Duelist",
                "L3 Boss Stalker",
                "L4 Boss Brute",
                "L5 Boss Stalker",
            ],
        )
        self.assertIn(3, {len(group.enemies) for group in first if not group.is_boss})
        self.assertTrue(
            all(
                any(tag.startswith("power-") for tag in group.enemy.tags)
                for group in first
                if not group.is_boss
            )
        )
        self.assertNotEqual(
            [(group.level, group.enemy.name, group.is_boss) for group in first],
            [(group.level, group.enemy.name, group.is_boss) for group in different],
        )

    def test_tactical_simulation_is_seed_deterministic(self) -> None:
        config = BalanceConfig()
        groups = build_tactical_dungeon(config)
        build = build_by_name("survivor")

        first = simulate_tactical_dungeon_with_loot(build, config=config, groups=groups, seed=222)
        second = simulate_tactical_dungeon_with_loot(build, config=config, groups=groups, seed=222)

        self.assertEqual(first, second)

    def test_skilled_tactical_policy_beats_random_tactical_policy(self) -> None:
        config = BalanceConfig()
        groups = build_tactical_dungeon(config)
        loot = LootConfig()

        skilled = estimate_tactical_loot_win_rate(
            build_by_name("survivor"),
            config=config,
            groups=groups,
            loot_config=loot,
            runs=200,
            seed=333,
        )
        random = estimate_tactical_loot_win_rate(
            build_by_name("balanced"),
            config=config,
            groups=groups,
            loot_config=loot,
            runs=200,
            seed=333,
            action_policy="random",
            loot_policy="random",
        )

        self.assertGreater(skilled["avg_rooms_cleared"], random["avg_rooms_cleared"])

    def test_tactical_estimate_reports_depth_gates(self) -> None:
        config = BalanceConfig()
        groups = build_tactical_dungeon(config)
        summary = estimate_tactical_loot_win_rate(
            build_by_name("survivor"),
            config=config,
            groups=groups,
            loot_config=LootConfig(),
            runs=50,
            seed=919,
        )

        self.assertIn("rooms_p50", summary)
        self.assertIn("rooms_p90", summary)
        self.assertIn("reach_l3_boss_rate", summary)
        self.assertIn("clear_l3_boss_rate", summary)
        self.assertIn("l3_boss_clear_given_reached", summary)
        self.assertGreaterEqual(summary["reach_l2_rate"], summary["reach_l3_rate"])
        self.assertGreaterEqual(summary["reach_l3_boss_rate"], summary["clear_l3_boss_rate"])
        self.assertLessEqual(summary["l3_boss_clear_given_reached"], 1.0)

    def test_heavy_hit_penalty_scales_with_enemy_evasion(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=8, dexterity=8)
        slow = EnemyStats(name="slow", level=1, max_hp=10, damage=1, accuracy=0.5, evasion=2.5)
        evasive = EnemyStats(name="evasive", level=1, max_hp=10, damage=1, accuracy=0.5, evasion=8.0)

        slow_gap = _player_hit_probability(
            player, slow, WeaponProfile(), config, PlayerAction.ATTACK
        ) - _player_hit_probability(player, slow, WeaponProfile(), config, PlayerAction.HEAVY)
        evasive_gap = _player_hit_probability(
            player, evasive, WeaponProfile(), config, PlayerAction.ATTACK
        ) - _player_hit_probability(player, evasive, WeaponProfile(), config, PlayerAction.HEAVY)

        self.assertGreater(evasive_gap, slow_gap)

    def test_sweep_damage_multiplier_scales_with_dexterity(self) -> None:
        config = BalanceConfig()
        low_dex = StatLine(max_hp=10, strength=8, dexterity=5)
        high_dex = StatLine(max_hp=10, strength=8, dexterity=15)

        self.assertGreater(
            _sweep_damage_multiplier(high_dex, config.tactical),
            _sweep_damage_multiplier(low_dex, config.tactical),
        )

    def test_sweep_can_hit_multiple_enemies(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=8, dexterity=14)
        enemy = EnemyStats(name="dummy", level=1, max_hp=20, damage=0, accuracy=0.5, evasion=0)
        enemies = [
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
        ]

        damage, hits, misses, _, _, _ = _resolve_player_sweep(
            enemies, player, WeaponProfile(), config, random.Random(1)
        )

        self.assertGreater(damage, 0.0)
        self.assertGreaterEqual(hits + misses, 2)
        self.assertLess(enemies[0].hp + enemies[1].hp, enemy.max_hp * 2)

    def test_axe_sunder_accumulates_on_successful_heavy_hit(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=8, dexterity=8)
        enemy = EnemyStats(name="dummy", level=1, max_hp=50, damage=0, accuracy=0.5, evasion=0)
        enemies = [TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE)]
        weapon = WeaponProfile(name="crushing axe", sunder_on_hit=1, sunder_on_heavy_hit=1)

        damage, hits, misses, _, _, _ = _resolve_player_attack(
            enemies, 0, PlayerAction.HEAVY, player, weapon, config, random.Random(1)
        )

        self.assertGreater(damage, 0.0)
        self.assertEqual(hits, 1)
        self.assertEqual(misses, 0)
        self.assertEqual(enemies[0].sunder, 2)

    def test_stunning_axe_can_interrupt_on_heavy_hit(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=8, dexterity=8)
        enemy = EnemyStats(name="dummy", level=1, max_hp=50, damage=0, accuracy=0.5, evasion=0)
        enemies = [TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.HEAVY)]
        weapon = WeaponProfile(name="stunning axe", stun_on_heavy_hit_chance=1.0)

        _, hits, misses, _, _, interrupted = _resolve_player_attack(
            enemies, 0, PlayerAction.HEAVY, player, weapon, config, random.Random(1)
        )

        self.assertEqual(hits, 1)
        self.assertEqual(misses, 0)
        self.assertTrue(enemies[0].interrupted)
        self.assertEqual(interrupted, ("dummy",))

    def test_skilled_policy_does_not_auto_sweep_two_sturdy_enemies(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=5, dexterity=5)
        enemy = EnemyStats(name="dummy", level=1, max_hp=20, damage=0.1, accuracy=0.5, evasion=3.7)
        enemies = (
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
        )

        action, target_index = _choose_action(
            player,
            current_hp=10,
            enemies=enemies,
            weapon=WeaponProfile(),
            build=build_by_name("balanced"),
            config=config,
        )

        self.assertEqual(action, PlayerAction.ATTACK)
        self.assertEqual(target_index, 0)

    def test_skilled_policy_does_not_quick_boss_strike_by_default(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=5, dexterity=5)
        boss = EnemyStats(
            name="boss",
            level=2,
            max_hp=60,
            damage=2.0,
            accuracy=0.70,
            evasion=4.5,
            tags=("boss",),
        )
        enemies = (
            TacticalEnemy(enemy=boss, hp=boss.max_hp, intent=EnemyIntent.STRIKE),
        )

        action, target_index = _choose_action(
            player,
            current_hp=10,
            enemies=enemies,
            weapon=WeaponProfile(),
            build=build_by_name("survivor"),
            config=config,
        )

        self.assertEqual(action, PlayerAction.ATTACK)
        self.assertEqual(target_index, 0)

    def test_skilled_policy_uses_heavy_with_payoff_weapon(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=5, dexterity=5)
        enemy = EnemyStats(name="dummy", level=1, max_hp=20, damage=0.1, accuracy=0.5, evasion=3.7)
        enemies = (
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
        )

        action, target_index = _choose_action(
            player,
            current_hp=10,
            enemies=enemies,
            weapon=WeaponProfile(name="heavy sword", heavy_damage_multiplier=1.12),
            build=build_by_name("balanced"),
            config=config,
        )

        self.assertEqual(action, PlayerAction.HEAVY)
        self.assertEqual(target_index, 0)

    def test_skilled_policy_quick_interrupts_boss_heavy_even_at_low_dex(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=5, dexterity=5)
        boss = EnemyStats(
            name="boss",
            level=2,
            max_hp=60,
            damage=2.0,
            accuracy=0.70,
            evasion=4.5,
            tags=("boss",),
        )
        enemies = (
            TacticalEnemy(enemy=boss, hp=boss.max_hp, intent=EnemyIntent.HEAVY),
        )

        action, target_index = _choose_action(
            player,
            current_hp=10,
            enemies=enemies,
            weapon=WeaponProfile(),
            build=build_by_name("survivor"),
            config=config,
        )

        self.assertEqual(action, PlayerAction.QUICK)
        self.assertEqual(target_index, 0)

    def test_balanced_swordsman_uses_base_ability_before_guard_on_priority_threat(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=5, dexterity=5)
        enemy = EnemyStats(
            name="dummy",
            level=1,
            max_hp=50,
            damage=2.0,
            accuracy=0.8,
            evasion=3.7,
            tags=("hp-check",),
        )
        enemies = (
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
        )
        build = build_by_name("balanced")

        action, target_index = _choose_action(
            player,
            current_hp=4,
            enemies=enemies,
            weapon=WeaponProfile(),
            build=build,
            config=config,
            ability_available=True,
        )
        fallback_action, _ = _choose_action(
            player,
            current_hp=4,
            enemies=enemies,
            weapon=WeaponProfile(),
            build=build,
            config=config,
            ability_available=False,
        )

        self.assertEqual(action, PlayerAction.ABILITY)
        self.assertIsNone(target_index)
        self.assertEqual(fallback_action, PlayerAction.GUARD)
        self.assertLess(
            _ability_guard_reduction(build.base_ability, EnemyIntent.STRIKE, config.tactical),
            config.tactical.player_guard_reduction,
        )
        self.assertGreater(build.base_ability.counter_damage_multiplier, 0.0)

    def test_skilled_policy_saves_mana_costed_riposte_for_priority_threats(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=5, dexterity=5)
        enemy = EnemyStats(name="dummy", level=1, max_hp=50, damage=2.0, accuracy=0.8, evasion=3.7)
        enemies = (
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
        )

        action, _ = _choose_action(
            player,
            current_hp=4,
            enemies=enemies,
            weapon=WeaponProfile(),
            build=build_by_name("balanced"),
            config=config,
            ability_available=True,
        )

        self.assertEqual(action, PlayerAction.GUARD)

    def test_riposte_counter_damages_the_attacker(self) -> None:
        config = BalanceConfig()
        build = build_by_name("balanced")
        player = StatLine(max_hp=10, strength=8, dexterity=8)
        enemy = EnemyStats(name="dummy", level=1, max_hp=20, damage=1.0, accuracy=0.8, evasion=0.0)
        enemies = [TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE)]

        damage, hits, misses, _, defeated = _resolve_riposte_counter(
            enemies,
            0,
            player,
            WeaponProfile(),
            build.base_ability,
            config,
            random.Random(1),
        )

        self.assertGreater(damage, 0.0)
        self.assertEqual(hits, 1)
        self.assertEqual(misses, 0)
        self.assertLess(enemies[0].hp, enemy.max_hp)
        self.assertEqual(defeated, ())

    def test_riposte_counter_triggers_on_guaranteed_enemy_attack(self) -> None:
        config = BalanceConfig()
        build = build_by_name("balanced")
        player = StatLine(max_hp=20, strength=8, dexterity=8)
        enemy = EnemyStats(
            name="missy",
            level=1,
            max_hp=60,
            damage=10.0,
            accuracy=0.0,
            evasion=0.0,
            tags=("hp-check",),
        )

        result = simulate_tactical_combat(
            player,
            8.0,
            EnemyGroup(level=1, enemies=(enemy,), is_boss=False),
            WeaponProfile(),
            config,
            random.Random(6),
            build=build,
        )

        self.assertEqual(result.log[0].action, PlayerAction.ABILITY)
        self.assertEqual(result.enemy_misses, 0)
        self.assertGreater(result.enemy_hits, 0)
        self.assertGreater(result.log[0].damage_taken, 0.0)
        self.assertGreater(result.log[0].damage_dealt, 0.0)

    def test_mana_gates_expensive_tactical_actions(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=5, dexterity=5)
        enemy = EnemyStats(
            name="dummy",
            level=1,
            max_hp=50,
            damage=2.0,
            accuracy=0.8,
            evasion=3.7,
            tags=("hp-check",),
        )
        enemies = (
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE),
        )
        build = build_by_name("balanced")

        with_mana, _ = _choose_action(
            player,
            current_hp=4,
            enemies=enemies,
            weapon=WeaponProfile(),
            build=build,
            config=config,
            ability_available=True,
            current_mana=config.tactical.max_mana,
        )
        no_mana, _ = _choose_action(
            player,
            current_hp=4,
            enemies=enemies,
            weapon=WeaponProfile(),
            build=build,
            config=config,
            ability_available=True,
            current_mana=0,
        )

        self.assertEqual(with_mana, PlayerAction.ABILITY)
        self.assertEqual(no_mana, PlayerAction.GUARD)
        self.assertEqual(_action_mana_cost(PlayerAction.HEAVY, config), config.tactical.heavy_mana_cost)
        self.assertEqual(_action_mana_cost(PlayerAction.ABILITY, config, build.base_ability), build.base_ability.mana_cost)

    def test_support_mage_does_not_heal_healthy_allies(self) -> None:
        config = BalanceConfig()
        mage = EnemyStats(
            name="mage",
            level=2,
            max_hp=6,
            damage=1,
            accuracy=0.5,
            evasion=5,
            tags=("mage-support",),
        )
        ally = EnemyStats(name="ally", level=2, max_hp=20, damage=2, accuracy=0.5, evasion=3)
        enemies = (
            TacticalEnemy(enemy=ally, hp=ally.max_hp, intent=EnemyIntent.STRIKE),
            TacticalEnemy(enemy=mage, hp=mage.max_hp, intent=EnemyIntent.STRIKE),
        )

        observed = {
            _choose_intent(mage, 1, random.Random(seed), enemies, config.tactical, 1)
            for seed in range(40)
        }

        self.assertNotIn(EnemyIntent.HEAL, observed)

    def test_support_mage_can_heal_injured_ally(self) -> None:
        config = BalanceConfig()
        mage = EnemyStats(
            name="mage",
            level=2,
            max_hp=6,
            damage=1,
            accuracy=0.5,
            evasion=5,
            tags=("mage-support",),
        )
        ally = EnemyStats(name="ally", level=2, max_hp=20, damage=2, accuracy=0.5, evasion=3)
        enemies = (
            TacticalEnemy(enemy=ally, hp=5, intent=EnemyIntent.STRIKE),
            TacticalEnemy(enemy=mage, hp=mage.max_hp, intent=EnemyIntent.STRIKE),
        )

        observed = {
            _choose_intent(mage, 1, random.Random(seed), enemies, config.tactical, 1)
            for seed in range(80)
        }

        self.assertIn(EnemyIntent.HEAL, observed)

    def test_support_shield_absorbs_player_damage_before_hp(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=8, dexterity=8)
        enemy = EnemyStats(name="dummy", level=1, max_hp=20, damage=0, accuracy=0.5, evasion=0)
        enemies = [
            TacticalEnemy(
                enemy=enemy,
                hp=enemy.max_hp,
                intent=EnemyIntent.STRIKE,
                shield=100,
                shield_turns=1,
            )
        ]

        damage, hits, misses, _, _, _ = _resolve_player_attack(
            enemies, 0, PlayerAction.ATTACK, player, WeaponProfile(), config, random.Random(1)
        )

        self.assertGreater(damage, 0.0)
        self.assertEqual(hits, 1)
        self.assertEqual(misses, 0)
        self.assertEqual(enemies[0].hp, enemy.max_hp)
        self.assertLess(enemies[0].shield, 100)

    def test_invisibility_lowers_player_hit_chance(self) -> None:
        config = BalanceConfig()
        player = StatLine(max_hp=10, strength=8, dexterity=8)
        enemy = EnemyStats(name="dummy", level=1, max_hp=20, damage=0, accuracy=0.5, evasion=4)
        weapon = WeaponProfile()

        visible = _player_hit_probability(player, enemy, weapon, config, PlayerAction.ATTACK)
        invisible = _player_hit_probability(
            player,
            enemy,
            weapon,
            config,
            PlayerAction.ATTACK,
            invisible=True,
        )

        self.assertLess(invisible, visible)


if __name__ == "__main__":
    unittest.main()
