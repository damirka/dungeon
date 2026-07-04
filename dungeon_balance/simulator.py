from __future__ import annotations

import random
from statistics import mean

from .config import BalanceConfig, CombatConfig
from .enemies import build_default_dungeon
from .formulas import (
    player_damage_quality,
    player_base_damage,
    player_crit_chance,
    player_hit_chance,
)
from .models import (
    CombatResult,
    DungeonRunResult,
    Encounter,
    EnemyStats,
    PlayerBuild,
    PlayerLoadout,
    StatLine,
    WeaponProfile,
)
from .loot import (
    LootConfig,
    apply_loot_choice,
    choose_item_by_policy,
    generate_loot_draft,
    make_level_luck_pool,
    starting_loadout,
)


def _budget_gain_after_encounter(encounter: Encounter, config: BalanceConfig) -> float:
    if encounter.is_boss:
        if encounter.level >= config.dungeon.levels:
            return 0.0
        base_gain = config.dungeon.stat_budget_gain_per_level
    else:
        base_gain = config.dungeon.stat_budget_gain_per_encounter

    return base_gain * (config.dungeon.stat_budget_gain_growth ** (encounter.level - 1))


def _apply_training_gain(
    loadout: PlayerLoadout,
    current_hp: float,
    budget: float,
    build: PlayerBuild,
    encounter: Encounter,
    config: BalanceConfig,
    loot_config: LootConfig,
) -> tuple[PlayerLoadout, float, float]:
    budget_gain = _budget_gain_after_encounter(encounter, config) * loot_config.training_gain_multiplier
    if budget_gain <= 0.0:
        return loadout, current_hp, budget

    old_max_hp = loadout.stats().max_hp
    budget += budget_gain
    loadout = loadout.with_base_stats(config.stats.from_budget(build.weights, budget))
    upgraded = loadout.stats()
    hp_growth = max(0.0, upgraded.max_hp - old_max_hp)
    hp_growth *= config.dungeon.current_hp_from_max_hp_gain_fraction
    return loadout, min(upgraded.max_hp, current_hp + hp_growth), budget


def _varied_damage(
    base_damage: float,
    variance: float,
    rng: random.Random,
    quality: float = 0.0,
) -> float:
    if variance <= 0:
        return base_damage
    low = 1.0 - variance
    high = 1.0 + variance
    roll = rng.uniform(low, high)
    quality = max(0.0, min(1.0, quality))
    return base_damage * (roll + (high - roll) * quality)


def simulate_combat(
    player: StatLine,
    current_hp: float,
    enemy: EnemyStats,
    weapon: WeaponProfile,
    config: CombatConfig,
    rng: random.Random,
) -> CombatResult:
    player_hp_before = current_hp
    enemy_hp = enemy.max_hp

    player_hits = 0
    player_misses = 0
    player_crits = 0
    enemy_hits = 0
    enemy_misses = 0
    total_damage_dealt = 0.0
    total_damage_taken = 0.0

    hit_chance = player_hit_chance(player, enemy, weapon, config)
    crit_chance = player_crit_chance(player, enemy, weapon, config)
    base_damage = player_base_damage(player, weapon, config)
    damage_quality = player_damage_quality(player, enemy, config)
    crit_multiplier = max(1.0, config.crit_multiplier + weapon.crit_multiplier_modifier)

    for round_number in range(1, config.max_combat_rounds + 1):
        if rng.random() <= hit_chance:
            player_hits += 1
            damage = _varied_damage(base_damage, config.damage_variance, rng, damage_quality)
            if rng.random() <= crit_chance:
                player_crits += 1
                damage *= crit_multiplier
            enemy_hp -= damage
            total_damage_dealt += damage
        else:
            player_misses += 1

        if enemy_hp <= 0:
            return CombatResult(
                won=True,
                rounds=round_number,
                player_hp_before=player_hp_before,
                player_hp_after=max(0.0, current_hp),
                enemy_hp_after=0.0,
                player_hits=player_hits,
                player_misses=player_misses,
                player_crits=player_crits,
                enemy_hits=enemy_hits,
                enemy_misses=enemy_misses,
                total_damage_dealt=total_damage_dealt,
                total_damage_taken=total_damage_taken,
            )

        enemy_hits += 1
        damage_taken = _varied_damage(enemy.damage, config.damage_variance, rng)
        current_hp -= damage_taken
        total_damage_taken += damage_taken

        if current_hp <= 0:
            return CombatResult(
                won=False,
                rounds=round_number,
                player_hp_before=player_hp_before,
                player_hp_after=0.0,
                enemy_hp_after=max(0.0, enemy_hp),
                player_hits=player_hits,
                player_misses=player_misses,
                player_crits=player_crits,
                enemy_hits=enemy_hits,
                enemy_misses=enemy_misses,
                total_damage_dealt=total_damage_dealt,
                total_damage_taken=total_damage_taken,
            )

    return CombatResult(
        won=False,
        rounds=config.max_combat_rounds,
        player_hp_before=player_hp_before,
        player_hp_after=max(0.0, current_hp),
        enemy_hp_after=max(0.0, enemy_hp),
        player_hits=player_hits,
        player_misses=player_misses,
        player_crits=player_crits,
        enemy_hits=enemy_hits,
        enemy_misses=enemy_misses,
        total_damage_dealt=total_damage_dealt,
        total_damage_taken=total_damage_taken,
    )


def simulate_dungeon(
    build: PlayerBuild,
    config: BalanceConfig | None = None,
    dungeon: tuple[Encounter, ...] | None = None,
    *,
    seed: int = 0,
) -> DungeonRunResult:
    config = config or BalanceConfig()
    dungeon = dungeon or build_default_dungeon(config.dungeon)
    rng = random.Random(seed)

    budget = config.dungeon.initial_stat_budget
    player = build.stats_at_budget(budget, config.stats)
    current_hp = player.max_hp
    combats: list[CombatResult] = []

    for encounter in dungeon:
        player = build.stats_at_budget(budget, config.stats)
        current_hp = min(current_hp, player.max_hp)

        combat = simulate_combat(
            player=player,
            current_hp=current_hp,
            enemy=encounter.enemy,
            weapon=build.weapon,
            config=config.combat,
            rng=rng,
        )
        combats.append(combat)
        current_hp = combat.player_hp_after

        if not combat.won:
            return DungeonRunResult(
                won=False,
                build_name=build.name,
                final_hp=0.0,
                rooms_cleared=len(combats) - 1,
                total_rooms=len(dungeon),
                combats=tuple(combats),
                death_room=encounter,
            )

        budget_gain = _budget_gain_after_encounter(encounter, config)
        if budget_gain > 0:
            old_max_hp = player.max_hp
            budget += budget_gain
            upgraded = build.stats_at_budget(budget, config.stats)
            hp_growth = max(0.0, upgraded.max_hp - old_max_hp)
            hp_growth *= config.dungeon.current_hp_from_max_hp_gain_fraction
            current_hp = min(upgraded.max_hp, current_hp + hp_growth)
            player = upgraded

        if config.dungeon.post_encounter_heal_fraction > 0:
            current_hp = min(
                player.max_hp,
                current_hp + player.max_hp * config.dungeon.post_encounter_heal_fraction,
            )

        if encounter.is_boss and encounter.level < config.dungeon.levels:
            current_hp = min(
                player.max_hp,
                current_hp + player.max_hp * config.dungeon.post_level_heal_fraction,
            )

    return DungeonRunResult(
        won=True,
        build_name=build.name,
        final_hp=current_hp,
        rooms_cleared=len(dungeon),
        total_rooms=len(dungeon),
        combats=tuple(combats),
        death_room=None,
    )


def simulate_dungeon_with_loot(
    build: PlayerBuild,
    config: BalanceConfig | None = None,
    dungeon: tuple[Encounter, ...] | None = None,
    loot_config: LootConfig | None = None,
    *,
    seed: int = 0,
) -> DungeonRunResult:
    config = config or BalanceConfig()
    dungeon = dungeon or build_default_dungeon(config.dungeon)
    loot_config = loot_config or LootConfig()
    rng = random.Random(seed)

    budget = config.dungeon.initial_stat_budget
    base_stats = config.stats.from_budget(build.weights, budget)
    loadout = starting_loadout(base_stats, weapon=build.weapon, modifiers=build.modifiers)
    current_hp = loadout.stats().max_hp
    combats: list[CombatResult] = []
    chosen_items = []
    level_pool = make_level_luck_pool(dungeon[0].level, loot_config)

    for encounter in dungeon:
        if encounter.level != level_pool.level:
            level_pool = make_level_luck_pool(encounter.level, loot_config)

        player = loadout.stats()
        current_hp = min(current_hp, player.max_hp)

        combat = simulate_combat(
            player=player,
            current_hp=current_hp,
            enemy=encounter.enemy,
            weapon=loadout.weapon,
            config=config.combat,
            rng=rng,
        )
        combats.append(combat)
        current_hp = combat.player_hp_after

        if not combat.won:
            return DungeonRunResult(
                won=False,
                build_name=f"{build.name}-loot",
                final_hp=0.0,
                rooms_cleared=len(combats) - 1,
                total_rooms=len(dungeon),
                combats=tuple(combats),
                death_room=encounter,
                items=tuple(chosen_items),
            )

        if encounter.is_boss and encounter.level >= config.dungeon.levels:
            continue

        loadout, current_hp, budget = _apply_training_gain(
            loadout,
            current_hp,
            budget,
            build,
            encounter,
            config,
            loot_config,
        )

        draft = generate_loot_draft(level_pool, encounter, loot_config, rng)
        chosen = choose_item_by_policy(
            draft,
            build.weights,
            current_hp=current_hp,
            max_hp=player.max_hp,
            loadout=loadout,
            allow_skip=True,
            minimum_upgrade_score=loot_config.minimum_upgrade_score,
        )
        if chosen is not None:
            loadout, current_hp = apply_loot_choice(loadout, current_hp, chosen, loot_config)
            chosen_items.append(chosen)

    return DungeonRunResult(
        won=True,
        build_name=f"{build.name}-loot",
        final_hp=current_hp,
        rooms_cleared=len(dungeon),
        total_rooms=len(dungeon),
        combats=tuple(combats),
        death_room=None,
        items=tuple(chosen_items),
    )


def estimate_win_rate(
    build: PlayerBuild,
    config: BalanceConfig | None = None,
    dungeon: tuple[Encounter, ...] | None = None,
    *,
    runs: int = 1000,
    seed: int = 0,
) -> dict[str, float]:
    if runs <= 0:
        raise ValueError("runs must be positive")

    config = config or BalanceConfig()
    dungeon = dungeon or build_default_dungeon(config.dungeon)
    results = [
        simulate_dungeon(build, config=config, dungeon=dungeon, seed=seed + index)
        for index in range(runs)
    ]
    wins = [result for result in results if result.won]
    avg_final_hp_on_win = mean(result.final_hp for result in wins) if wins else 0.0
    return {
        "runs": float(runs),
        "win_rate": len(wins) / runs,
        "avg_rooms_cleared": mean(result.rooms_cleared for result in results),
        "avg_final_hp_on_win": avg_final_hp_on_win,
    }


def estimate_loot_win_rate(
    build: PlayerBuild,
    config: BalanceConfig | None = None,
    dungeon: tuple[Encounter, ...] | None = None,
    loot_config: LootConfig | None = None,
    *,
    runs: int = 1000,
    seed: int = 0,
) -> dict[str, float]:
    if runs <= 0:
        raise ValueError("runs must be positive")

    config = config or BalanceConfig()
    dungeon = dungeon or build_default_dungeon(config.dungeon)
    loot_config = loot_config or LootConfig()
    results = [
        simulate_dungeon_with_loot(
            build,
            config=config,
            dungeon=dungeon,
            loot_config=loot_config,
            seed=seed + index,
        )
        for index in range(runs)
    ]
    wins = [result for result in results if result.won]
    avg_final_hp_on_win = mean(result.final_hp for result in wins) if wins else 0.0
    avg_items = mean(len(result.items) for result in results)
    return {
        "runs": float(runs),
        "win_rate": len(wins) / runs,
        "avg_rooms_cleared": mean(result.rooms_cleared for result in results),
        "avg_final_hp_on_win": avg_final_hp_on_win,
        "avg_items_chosen": avg_items,
    }
