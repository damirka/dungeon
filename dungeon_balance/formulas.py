from __future__ import annotations

from math import prod

from .config import CombatConfig
from .models import CombatProjection, EnemyStats, StatLine, StatWeights, WeaponProfile


EPSILON = 1e-9


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def player_base_damage(
    player: StatLine,
    weapon: WeaponProfile,
    config: CombatConfig,
) -> float:
    strength_damage = config.strength_damage_scale * (
        max(0.0, player.strength) ** config.strength_damage_exponent
    )
    return max(0.0, (config.base_player_damage + strength_damage + weapon.flat_damage)) * (
        weapon.damage_multiplier
    )


def player_hit_chance(
    player: StatLine,
    enemy: EnemyStats,
    weapon: WeaponProfile,
    config: CombatConfig,
) -> float:
    dexterity_bonus = config.dexterity_hit_scale * (
        max(0.0, player.dexterity) ** config.dexterity_hit_exponent
    )
    evasion_penalty = config.enemy_evasion_hit_scale * (
        max(0.0, enemy.evasion) ** config.enemy_evasion_exponent
    )
    raw = config.base_player_hit_chance + dexterity_bonus - evasion_penalty + weapon.hit_modifier
    return clamp(raw, config.min_player_hit_chance, config.max_player_hit_chance)


def player_crit_chance(
    player: StatLine,
    enemy: EnemyStats,
    weapon: WeaponProfile,
    config: CombatConfig,
) -> float:
    dexterity_bonus = config.dexterity_crit_scale * (
        max(0.0, player.dexterity) ** config.dexterity_crit_exponent
    )
    evasion_penalty = config.enemy_evasion_crit_scale * (max(0.0, enemy.evasion) ** 0.5)
    raw = config.base_crit_chance + dexterity_bonus - evasion_penalty + weapon.crit_modifier
    return clamp(raw, 0.0, config.max_crit_chance)


def player_damage_quality(
    player: StatLine,
    enemy: EnemyStats,
    config: CombatConfig,
) -> float:
    """How strongly DEX biases successful hits toward high damage rolls."""

    dexterity_bonus = config.dexterity_damage_quality_scale * (
        max(0.0, player.dexterity) ** config.dexterity_damage_quality_exponent
    )
    evasion_penalty = config.enemy_evasion_damage_quality_scale * (
        max(0.0, enemy.evasion) ** config.enemy_evasion_damage_quality_exponent
    )
    return clamp(dexterity_bonus - evasion_penalty, 0.0, config.max_damage_quality)


def damage_quality_multiplier(
    player: StatLine,
    enemy: EnemyStats,
    config: CombatConfig,
) -> float:
    return 1.0 + config.damage_variance * player_damage_quality(player, enemy, config)


def expected_player_damage_per_turn(
    player: StatLine,
    enemy: EnemyStats,
    weapon: WeaponProfile,
    config: CombatConfig,
) -> float:
    damage = player_base_damage(player, weapon, config)
    hit = player_hit_chance(player, enemy, weapon, config)
    crit = player_crit_chance(player, enemy, weapon, config)
    crit_multiplier = max(1.0, config.crit_multiplier + weapon.crit_multiplier_modifier)
    quality_multiplier = damage_quality_multiplier(player, enemy, config)
    return hit * damage * quality_multiplier * (1.0 + crit * (crit_multiplier - 1.0))


def expected_enemy_damage_per_turn(
    player: StatLine,
    enemy: EnemyStats,
    config: CombatConfig,
) -> float:
    return enemy.damage


def project_combat(
    player: StatLine,
    enemy: EnemyStats,
    weapon: WeaponProfile,
    config: CombatConfig,
) -> CombatProjection:
    player_dpt = expected_player_damage_per_turn(player, enemy, weapon, config)
    enemy_dpt = expected_enemy_damage_per_turn(player, enemy, config)
    expected_rounds = enemy.max_hp / max(player_dpt, EPSILON)

    # Player acts first, so on average the enemy gets roughly half a round less
    # than the continuous kill-time estimate.
    enemy_attack_rounds = max(0.0, expected_rounds - 0.5)
    expected_damage_taken = enemy_dpt * enemy_attack_rounds
    survival_margin = player.max_hp / max(expected_damage_taken, EPSILON)

    return CombatProjection(
        player_dpt=player_dpt,
        enemy_dpt=enemy_dpt,
        player_hit_chance=player_hit_chance(player, enemy, weapon, config),
        player_crit_chance=player_crit_chance(player, enemy, weapon, config),
        player_damage_quality=player_damage_quality(player, enemy, config),
        expected_rounds_to_kill=expected_rounds,
        expected_damage_taken=expected_damage_taken,
        survival_margin=survival_margin,
    )


def stat_balance_factor(weights: StatWeights) -> float:
    """Returns 0..1, where 1 means evenly split and lower means more extreme.

    This is diagnostic only. Combat does not secretly reward balanced builds;
    the simulator should make neglected stats hurt naturally.
    """

    normalized = weights.normalized()
    shares = [normalized.hp, normalized.strength, normalized.dexterity]
    geometric_mean = prod(max(EPSILON, share) for share in shares) ** (1 / 3)
    arithmetic_mean = sum(shares) / 3
    return clamp(geometric_mean / max(EPSILON, arithmetic_mean), 0.0, 1.0)
