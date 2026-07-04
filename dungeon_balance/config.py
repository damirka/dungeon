from __future__ import annotations

from dataclasses import dataclass, field

from .models import StatConversion


@dataclass(frozen=True)
class TacticalConfig:
    """Tunable constants for intent-based combat.

    The classic duel simulator remains the control model. These values drive
    the richer tactical simulator where enemy intents are visible and encounters
    can contain more than one enemy.
    """

    attack_damage_multiplier: float = 1.00

    heavy_damage_multiplier: float = 1.60
    heavy_hit_modifier: float = -0.20
    heavy_evasion_hit_penalty_scale: float = 0.004
    heavy_evasion_hit_penalty_floor: float = 3.50
    heavy_evasion_hit_penalty_max: float = 0.08
    heavy_guard_ignore: float = 0.45
    sunder_damage_bonus_per_stack: float = 0.075
    sunder_quick_effectiveness: float = 0.35
    sunder_heavy_effectiveness: float = 1.08
    sunder_max_stacks: int = 3

    quick_damage_multiplier: float = 0.45
    quick_hit_modifier: float = 0.10
    quick_crit_modifier: float = 0.025
    quick_quality_bonus: float = 0.07

    sweep_damage_multiplier: float = 0.42
    sweep_hit_modifier: float = -0.04
    sweep_quality_bonus: float = 0.05
    sweep_dexterity_damage_per_point: float = 0.014
    sweep_max_dexterity_damage_bonus: float = 0.18
    sweep_glancing_damage_multiplier: float = 0.12
    sweep_auto_damage_ratio: float = 0.82

    double_strike_base_chance: float = 0.01
    double_strike_per_dexterity: float = 0.0040
    max_double_strike_chance: float = 0.16
    double_strike_damage_multiplier: float = 0.45

    quick_interrupt_base_chance: float = 0.09
    quick_interrupt_per_dexterity: float = 0.0075
    max_interrupt_chance: float = 0.32

    player_guard_reduction: float = 0.52
    pierce_guard_reduction: float = 0.26
    enemy_guard_reduction: float = 0.45

    strike_damage_multiplier: float = 1.04
    heavy_intent_damage_multiplier: float = 1.72
    heavy_intent_hit_modifier: float = -0.06
    pierce_damage_multiplier: float = 0.80
    pierce_hit_modifier: float = 0.04
    aim_accuracy_bonus: float = 0.16
    aim_damage_bonus: float = 0.20

    group_primary_hp_factor: float = 0.68
    group_primary_damage_factor: float = 0.40
    group_support_hp_factor: float = 0.50
    group_support_damage_factor: float = 0.30

    mage_support_hp_factor: float = 0.46
    mage_support_damage_factor: float = 0.24
    mage_support_accuracy_delta: float = 0.04
    mage_support_evasion_factor: float = 1.12
    support_heal_damage_multiplier: float = 2.40
    support_shield_damage_multiplier: float = 2.15
    support_shield_max_hp_fraction: float = 0.42
    support_heal_threshold: float = 0.76
    support_invisibility_hit_penalty: float = 0.18

    max_mana: int = 4
    starting_mana: int = 4
    mana_regen_per_round: int = 1
    attack_mana_cost: int = 0
    heavy_mana_cost: int = 2
    quick_mana_cost: int = 1
    sweep_mana_cost: int = 2
    guard_mana_cost: int = 0


@dataclass(frozen=True)
class CombatConfig:
    """Tunable combat constants.

    The defaults are intentionally conservative: dexterity gives player-side
    reliability and crits, but caps keep low-dex builds from becoming
    impossible and high-dex builds from becoming deterministic.
    """

    min_player_hit_chance: float = 0.32
    max_player_hit_chance: float = 0.95
    base_player_hit_chance: float = 0.57
    dexterity_hit_scale: float = 0.062
    dexterity_hit_exponent: float = 0.62
    enemy_evasion_hit_scale: float = 0.038
    enemy_evasion_exponent: float = 0.55

    base_crit_chance: float = 0.03
    dexterity_crit_scale: float = 0.024
    dexterity_crit_exponent: float = 0.72
    enemy_evasion_crit_scale: float = 0.006
    max_crit_chance: float = 0.55
    crit_multiplier: float = 1.80

    dexterity_damage_quality_scale: float = 0.030
    dexterity_damage_quality_exponent: float = 0.62
    enemy_evasion_damage_quality_scale: float = 0.016
    enemy_evasion_damage_quality_exponent: float = 0.55
    max_damage_quality: float = 0.30

    base_player_damage: float = 1.0
    strength_damage_scale: float = 1.0
    strength_damage_exponent: float = 1.0

    damage_variance: float = 0.12
    max_combat_rounds: int = 200


@dataclass(frozen=True)
class DungeonConfig:
    levels: int = 5
    encounters_per_level: int = 7

    initial_stat_budget: float = 0.0
    stat_budget_gain_per_encounter: float = 1.55
    stat_budget_gain_per_level: float = 3.25
    stat_budget_gain_growth: float = 1.08

    post_encounter_heal_fraction: float = 0.00
    post_level_heal_fraction: float = 0.00
    current_hp_from_max_hp_gain_fraction: float = 1.00


@dataclass(frozen=True)
class BalanceConfig:
    combat: CombatConfig = field(default_factory=CombatConfig)
    dungeon: DungeonConfig = field(default_factory=DungeonConfig)
    stats: StatConversion = field(default_factory=StatConversion)
    tactical: TacticalConfig = field(default_factory=TacticalConfig)
