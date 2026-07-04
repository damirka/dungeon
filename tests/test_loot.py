import random
import unittest
from collections import Counter, defaultdict

from dungeon_balance.archetypes import build_by_name
from dungeon_balance.config import BalanceConfig
from dungeon_balance.enemies import build_default_dungeon
from dungeon_balance.loot import (
    LootConfig,
    _potion_item,
    _stat_item,
    _weapon_item,
    apply_loot_choice,
    choose_item_by_policy,
    generate_loot_draft,
    item_restore_hp,
    make_level_luck_pool,
    starting_loadout,
)
from dungeon_balance.models import (
    ItemProperty,
    ItemRarity,
    ItemSlot,
    ItemSpec,
    StatModifier,
    StatWeights,
    WeaponProfile,
)
from dungeon_balance.simulator import simulate_dungeon_with_loot


class LootTests(unittest.TestCase):
    def test_loot_draft_is_seed_deterministic(self) -> None:
        config = LootConfig()
        dungeon = build_default_dungeon()
        first_pool = make_level_luck_pool(1, config)
        second_pool = make_level_luck_pool(1, config)

        first = generate_loot_draft(first_pool, dungeon[0], config, random.Random(123))
        second = generate_loot_draft(second_pool, dungeon[0], config, random.Random(123))

        self.assertEqual(first, second)

    def test_loot_draft_avoids_repeated_stat_families(self) -> None:
        config = LootConfig(stat_item_weight=1.0, weapon_item_weight=0.0, consumable_item_weight=0.0)
        dungeon = build_default_dungeon()

        for seed in range(50):
            pool = make_level_luck_pool(1, config)
            draft = generate_loot_draft(pool, dungeon[0], config, random.Random(seed))
            families = [item.tags[0] for item in draft]

            self.assertEqual(len(families), len(set(families)))

    def test_focused_draft_prefers_lane_without_repeating_it(self) -> None:
        config = LootConfig(
            stat_item_weight=1.0,
            weapon_item_weight=0.0,
            consumable_item_weight=0.0,
            focus_draft_chance=1.0,
            early_focus_draft_bonus=0.0,
            focused_stat_choice_chance=1.0,
        )
        dungeon = build_default_dungeon()
        pool = make_level_luck_pool(1, config)

        draft = generate_loot_draft(pool, dungeon[0], config, random.Random(7))
        families = [item.tags[0] for item in draft]

        self.assertIn(families[0], {"strength", "dexterity"})
        self.assertEqual(len(families), len(set(families)))

    def test_loot_draft_avoids_repeated_weapon_styles(self) -> None:
        config = LootConfig(stat_item_weight=0.0, weapon_item_weight=1.0, consumable_item_weight=0.0)
        dungeon = build_default_dungeon()

        for seed in range(50):
            pool = make_level_luck_pool(1, config)
            draft = generate_loot_draft(pool, dungeon[0], config, random.Random(seed))
            styles = [
                prop.target
                for item in draft
                for prop in item.properties
                if prop.property_type == "weapon"
            ]

            self.assertEqual(len(styles), len(set(styles)))

    def test_unique_option_can_appear_as_a_named_top_roll(self) -> None:
        config = LootConfig(
            stat_item_weight=1.0,
            weapon_item_weight=0.0,
            consumable_item_weight=0.0,
            unique_option_chance=1.0,
            focus_draft_chance=0.0,
            early_focus_draft_bonus=0.0,
        )
        dungeon = build_default_dungeon()
        pool = make_level_luck_pool(1, config)

        draft = generate_loot_draft(pool, dungeon[0], config, random.Random(11))

        self.assertTrue(all(item.rarity == ItemRarity.UNIQUE for item in draft))

    def test_rarity_curve_makes_common_items_fade_after_early_floor(self) -> None:
        config = LootConfig()
        dungeon = build_default_dungeon()
        by_level: dict[int, Counter[str]] = defaultdict(Counter)

        for seed in range(200):
            rng = random.Random(seed)
            pools = {}
            for encounter in dungeon:
                pool = pools.setdefault(encounter.level, make_level_luck_pool(encounter.level, config))
                for item in generate_loot_draft(pool, encounter, config, rng):
                    by_level[encounter.level][item.rarity.value] += 1

        level_one_total = sum(by_level[1].values())
        level_two_total = sum(by_level[2].values())
        level_three_total = sum(by_level[3].values())

        self.assertGreater(1 - by_level[1]["common"] / level_one_total, 0.20)
        self.assertGreater(1 - by_level[2]["common"] / level_two_total, 0.65)
        self.assertLess(by_level[3]["common"] / level_three_total, 0.05)

    def test_health_potion_restores_current_hp_without_changing_max_hp(self) -> None:
        config = LootConfig(stat_item_weight=0.0, weapon_item_weight=0.0, consumable_item_weight=1.0)
        dungeon = build_default_dungeon()
        pool = make_level_luck_pool(1, config)

        potion = generate_loot_draft(pool, dungeon[0], config, random.Random(44))[0]
        loadout = starting_loadout()
        updated, current_hp = apply_loot_choice(loadout, 4.0, potion)

        self.assertGreater(item_restore_hp(potion), 0.0)
        self.assertEqual(updated, loadout)
        self.assertEqual(updated.stats().max_hp, 10.0)
        self.assertGreater(current_hp, 4.0)
        self.assertLessEqual(current_hp, 10.0)

    def test_health_bottles_use_fixed_playtest_names_and_amounts(self) -> None:
        config = LootConfig()

        vial = _potion_item(1.0, config, random.Random(1))
        potion = _potion_item(config.uncommon_cost, config, random.Random(2))
        elixir = _potion_item(config.epic_cost, config, random.Random(3))
        phoenix = _potion_item(config.legendary_cost, config, random.Random(4), unique=True)

        self.assertEqual(vial.name, "Crimson Vial")
        self.assertEqual(item_restore_hp(vial), round(config.common_cost * config.potion_hp_per_power))
        self.assertEqual(potion.name, "Crimson Potion")
        self.assertEqual(item_restore_hp(potion), round(config.rare_cost * config.potion_hp_per_power))
        self.assertEqual(elixir.name, "Crimson Elixir")
        self.assertEqual(item_restore_hp(elixir), round(config.epic_cost * config.potion_hp_per_power))
        self.assertEqual(phoenix.name, "Crimson Elixir")
        self.assertEqual(item_restore_hp(phoenix), round(config.legendary_cost * config.potion_hp_per_power))

    def test_policy_can_choose_potion_over_max_hp_when_badly_hurt(self) -> None:
        potion = ItemSpec(
            name="Crimson Potion",
            slot=ItemSlot.CONSUMABLE,
            rarity=ItemRarity.COMMON,
            tier=1,
            power_cost=1.0,
            properties=(ItemProperty("restore_hp", "current_hp", 1.0, 6.0),),
            tags=("heal", "consumable"),
        )
        amulet = ItemSpec(
            name="Vital Amulet",
            slot=ItemSlot.AMULET,
            rarity=ItemRarity.COMMON,
            tier=1,
            power_cost=1.0,
            modifier=StatModifier(name="vital", add_hp=1.2),
            tags=("hp",),
        )

        chosen = choose_item_by_policy(
            (potion, amulet),
            StatWeights(hp=1.0, strength=0.0, dexterity=0.0),
            current_hp=2.0,
            max_hp=10.0,
        )

        self.assertEqual(chosen, potion)

    def test_stat_items_use_distinct_equipment_slots(self) -> None:
        config = LootConfig()

        hp = _stat_item("hp", 1.0, config, random.Random(1))
        strength = _stat_item("strength", 1.0, config, random.Random(2))
        dexterity = _stat_item("dexterity", 1.0, config, random.Random(3))

        self.assertEqual(hp.slot, ItemSlot.AMULET)
        self.assertEqual(strength.slot, ItemSlot.CHARM)
        self.assertEqual(dexterity.slot, ItemSlot.RELIC)

    def test_loadout_keeps_only_one_active_weapon(self) -> None:
        loadout = starting_loadout()
        first = ItemSpec(
            name="Axe",
            slot=ItemSlot.WEAPON,
            rarity=ItemRarity.COMMON,
            tier=1,
            power_cost=1.0,
            weapon=WeaponProfile(name="axe", damage_multiplier=1.1),
        )
        second = ItemSpec(
            name="Rapier",
            slot=ItemSlot.WEAPON,
            rarity=ItemRarity.RARE,
            tier=3,
            power_cost=4.0,
            weapon=WeaponProfile(name="rapier", damage_multiplier=1.2),
        )

        loadout, hp = apply_loot_choice(loadout, 10.0, first)
        loadout, hp = apply_loot_choice(loadout, hp, second)

        self.assertEqual(loadout.weapon.name, "rapier")
        self.assertEqual(sum(item.slot == ItemSlot.WEAPON for item in loadout.items), 1)
        self.assertEqual(loadout.stash, (first,))

    def test_weapon_loot_uses_mapped_asset_recipe(self) -> None:
        item = _weapon_item(4.0, LootConfig(), random.Random(2), focus="dexterity")

        self.assertIsNotNone(item.asset_id)
        self.assertIsNotNone(item.asset_family)
        self.assertIn(f"asset:{item.asset_id}", item.tags)
        self.assertTrue(
            any(prop.property_type == "mapped_weapon_effect" for prop in item.properties)
        )
        self.assertFalse(
            any(prop.property_type == "weapon_effect" for prop in item.properties)
        )

    def test_mapped_double_strike_weapon_effect_becomes_live_weapon_stat(self) -> None:
        found = None
        for seed in range(100):
            item = _weapon_item(4.0, LootConfig(), random.Random(seed), focus="dexterity")
            if any(prop.target == "double_strike" for prop in item.properties):
                found = item
                break

        self.assertIsNotNone(found)
        assert found is not None
        self.assertGreater(found.weapon.double_strike_chance_modifier, 0.0)

    def test_loadout_replaces_same_slot_instead_of_stacking(self) -> None:
        loadout = starting_loadout()
        first = ItemSpec(
            name="Charm 1",
            slot=ItemSlot.CHARM,
            rarity=ItemRarity.COMMON,
            tier=1,
            power_cost=1.0,
            modifier=StatModifier(name="mod 1", add_strength=1.0),
        )
        second = ItemSpec(
            name="Charm 2",
            slot=ItemSlot.CHARM,
            rarity=ItemRarity.COMMON,
            tier=1,
            power_cost=2.0,
            modifier=StatModifier(name="mod 2", add_strength=2.0),
        )

        loadout, current_hp = apply_loot_choice(loadout, 10.0, first)
        loadout, current_hp = apply_loot_choice(loadout, current_hp, second)

        self.assertEqual(loadout.items, (second,))
        self.assertEqual(loadout.stats().strength, 7.0)
        self.assertEqual(loadout.stash, (first,))

    def test_policy_can_skip_downgrades_against_equipped_slot(self) -> None:
        loadout = starting_loadout()
        current = ItemSpec(
            name="Good Charm",
            slot=ItemSlot.CHARM,
            rarity=ItemRarity.RARE,
            tier=3,
            power_cost=4.0,
            modifier=StatModifier(name="good", add_strength=4.0),
        )
        weaker = ItemSpec(
            name="Weak Charm",
            slot=ItemSlot.CHARM,
            rarity=ItemRarity.COMMON,
            tier=1,
            power_cost=1.0,
            modifier=StatModifier(name="weak", add_strength=1.0),
        )
        loadout, current_hp = apply_loot_choice(loadout, 10.0, current)

        chosen = choose_item_by_policy(
            (weaker,),
            StatWeights(hp=0.0, strength=1.0, dexterity=0.0),
            loadout=loadout,
            current_hp=current_hp,
            max_hp=loadout.stats().max_hp,
            allow_skip=True,
        )

        self.assertIsNone(chosen)

    def test_stash_is_capped_at_four_best_leftovers(self) -> None:
        config = LootConfig(wearable_slot_limit=1, stash_slot_limit=4)
        loadout = starting_loadout()
        current_hp = 10.0

        for index in range(1, 7):
            item = ItemSpec(
                name=f"Charm {index}",
                slot=ItemSlot.CHARM,
                rarity=ItemRarity.COMMON,
                tier=1,
                power_cost=float(index),
                modifier=StatModifier(name=f"mod {index}", add_strength=float(index)),
            )
            loadout, current_hp = apply_loot_choice(loadout, current_hp, item, config)

        self.assertEqual(len(loadout.items), 1)
        self.assertEqual(loadout.items[0].name, "Charm 6")
        self.assertEqual([item.name for item in loadout.stash], ["Charm 5", "Charm 4", "Charm 3", "Charm 2"])

    def test_loot_simulation_is_seed_deterministic(self) -> None:
        config = BalanceConfig()
        dungeon = build_default_dungeon(config.dungeon)
        build = build_by_name("survivor")

        first = simulate_dungeon_with_loot(build, config=config, dungeon=dungeon, seed=1234)
        second = simulate_dungeon_with_loot(build, config=config, dungeon=dungeon, seed=1234)

        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
