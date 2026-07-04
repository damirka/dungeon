from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum
from statistics import mean

from .archetypes import DEFAULT_BUILDS
from .config import BalanceConfig, TacticalConfig
from .enemies import EnemyCurve, boss_archetype_key, build_default_dungeon, make_enemy
from .formulas import (
    clamp,
    player_base_damage,
    player_crit_chance,
    player_damage_quality,
    player_hit_chance,
)
from .loot import (
    LootConfig,
    apply_loot_choice,
    choose_item_by_policy,
    generate_loot_draft,
    make_level_luck_pool,
    starting_loadout,
)
from .models import (
    ClassAbility,
    CombatResult,
    DungeonRunResult,
    Encounter,
    EnemyStats,
    PlayerBuild,
    PlayerLoadout,
    StatLine,
    WeaponProfile,
)
from .simulator import _apply_training_gain, _varied_damage


class PlayerAction(str, Enum):
    ATTACK = "attack"
    HEAVY = "heavy"
    QUICK = "quick"
    SWEEP = "sweep"
    GUARD = "guard"
    ABILITY = "ability"


class EnemyIntent(str, Enum):
    STRIKE = "strike"
    HEAVY = "heavy"
    GUARD = "guard"
    AIM = "aim"
    PIERCE = "pierce"
    HEAL = "heal"
    SHIELD = "shield"
    INVISIBILITY = "invisibility"


@dataclass(frozen=True)
class TacticalEnemy:
    enemy: EnemyStats
    hp: float
    intent: EnemyIntent
    aimed: bool = False
    interrupted: bool = False
    sunder: int = 0
    shield: float = 0.0
    shield_turns: int = 0
    invisible: bool = False
    invisible_turns: int = 0

    @property
    def alive(self) -> bool:
        return self.hp > 0


@dataclass(frozen=True)
class EnemyGroup:
    level: int
    enemies: tuple[EnemyStats, ...]
    is_boss: bool = False

    @property
    def enemy(self) -> EnemyStats:
        return self.enemies[0]


@dataclass(frozen=True)
class EncounterPowerBand:
    power_level: int
    enemy_count: int
    lead_hp_factor: float
    lead_damage_factor: float
    support_hp_factor: float
    support_damage_factor: float
    mage_chance: float
    mixed_support_chance: float
    lead_tags: tuple[str, ...] = ()


POWER_BANDS: dict[int, EncounterPowerBand] = {
    1: EncounterPowerBand(
        power_level=1,
        enemy_count=1,
        lead_hp_factor=1.00,
        lead_damage_factor=1.00,
        support_hp_factor=0.0,
        support_damage_factor=0.0,
        mage_chance=0.0,
        mixed_support_chance=0.0,
        lead_tags=("opener",),
    ),
    2: EncounterPowerBand(
        power_level=2,
        enemy_count=2,
        lead_hp_factor=0.66,
        lead_damage_factor=0.38,
        support_hp_factor=0.46,
        support_damage_factor=0.27,
        mage_chance=0.0,
        mixed_support_chance=0.20,
        lead_tags=(),
    ),
    3: EncounterPowerBand(
        power_level=3,
        enemy_count=2,
        lead_hp_factor=0.74,
        lead_damage_factor=0.44,
        support_hp_factor=0.52,
        support_damage_factor=0.31,
        mage_chance=0.16,
        mixed_support_chance=0.34,
        lead_tags=(),
    ),
    4: EncounterPowerBand(
        power_level=4,
        enemy_count=2,
        lead_hp_factor=0.76,
        lead_damage_factor=0.44,
        support_hp_factor=0.52,
        support_damage_factor=0.30,
        mage_chance=0.22,
        mixed_support_chance=0.50,
        lead_tags=(),
    ),
    5: EncounterPowerBand(
        power_level=5,
        enemy_count=3,
        lead_hp_factor=0.68,
        lead_damage_factor=0.39,
        support_hp_factor=0.34,
        support_damage_factor=0.20,
        mage_chance=0.24,
        mixed_support_chance=0.58,
        lead_tags=("elite",),
    ),
}


@dataclass(frozen=True)
class TacticalRound:
    round_number: int
    action: PlayerAction
    target_index: int | None
    intents_before: tuple[EnemyIntent, ...]
    damage_dealt: float
    damage_taken: float
    defeated: tuple[str, ...]
    interrupted: tuple[str, ...]


@dataclass(frozen=True)
class TacticalCombatResult:
    won: bool
    rounds: int
    player_hp_before: float
    player_hp_after: float
    enemies_remaining: tuple[tuple[str, float], ...]
    player_hits: int
    player_misses: int
    player_crits: int
    enemy_hits: int
    enemy_misses: int
    total_damage_dealt: float
    total_damage_taken: float
    log: tuple[TacticalRound, ...] = ()

    def as_combat_result(self) -> CombatResult:
        enemy_hp_after = sum(hp for _, hp in self.enemies_remaining)
        return CombatResult(
            won=self.won,
            rounds=self.rounds,
            player_hp_before=self.player_hp_before,
            player_hp_after=self.player_hp_after,
            enemy_hp_after=enemy_hp_after,
            player_hits=self.player_hits,
            player_misses=self.player_misses,
            player_crits=self.player_crits,
            enemy_hits=self.enemy_hits,
            enemy_misses=self.enemy_misses,
            total_damage_dealt=self.total_damage_dealt,
            total_damage_taken=self.total_damage_taken,
        )


def _scaled_enemy(
    enemy: EnemyStats,
    *,
    name_suffix: str,
    hp_factor: float,
    damage_factor: float,
    accuracy_delta: float = 0.0,
    evasion_factor: float = 1.0,
    tags: tuple[str, ...] = (),
) -> EnemyStats:
    return EnemyStats(
        name=f"{enemy.name} {name_suffix}",
        level=enemy.level,
        max_hp=round(enemy.max_hp * hp_factor, 2),
        damage=round(enemy.damage * damage_factor, 2),
        accuracy=clamp(enemy.accuracy + accuracy_delta, 0.35, 0.92),
        evasion=round(enemy.evasion * evasion_factor, 2),
        tags=enemy.tags + tags,
    )


def _tagged_enemy(enemy: EnemyStats, tags: tuple[str, ...]) -> EnemyStats:
    return EnemyStats(
        name=enemy.name,
        level=enemy.level,
        max_hp=enemy.max_hp,
        damage=enemy.damage,
        accuracy=enemy.accuracy,
        evasion=enemy.evasion,
        tags=enemy.tags + tags,
    )


def _weighted_archetype(
    weights_by_key: dict[str, float],
    rng: random.Random,
) -> str:
    keys = tuple(weights_by_key)
    weights = tuple(weights_by_key[key] for key in keys)
    return rng.choices(keys, weights=weights, k=1)[0]


def _power_profile_weights(power_level: int, level: int) -> dict[str, float]:
    late_bias = max(0, level - 1) * 0.06
    if power_level <= 1:
        return {
            "raider": 1.25,
            "duelist": 0.85,
            "brute": 0.12,
            "stalker": 0.12,
        }
    if power_level == 2:
        return {
            "raider": 0.95,
            "duelist": 0.95,
            "brute": 0.72 + late_bias,
            "stalker": 0.58 + late_bias,
        }
    if power_level == 3:
        return {
            "raider": 0.42,
            "duelist": 0.95,
            "brute": 0.95 + late_bias,
            "stalker": 0.88 + late_bias,
        }
    if power_level == 4:
        return {
            "raider": 0.18,
            "duelist": 0.85,
            "brute": 1.12 + late_bias,
            "stalker": 1.05 + late_bias,
        }
    return {
        "raider": 0.08,
        "duelist": 0.64,
        "brute": 1.25 + late_bias,
        "stalker": 1.20 + late_bias,
    }


def _encounter_power_level(
    level: int,
    slot: int,
    config: BalanceConfig,
    rng: random.Random,
) -> int:
    if level == 1 and slot == 0:
        return 1

    slot_count = max(1, config.dungeon.encounters_per_level - 1)
    base = 1 + int((slot / slot_count) * 3.0) + max(0, level - 2) // 2
    if rng.random() < 0.24:
        base += rng.choice((-1, 1))

    level_cap = min(5, level + 2)
    return int(clamp(base, 1, level_cap))


def _support_archetype_key(
    lead_key: str,
    band: EncounterPowerBand,
    rng: random.Random,
) -> str:
    if rng.random() >= band.mixed_support_chance:
        return lead_key

    weights = _power_profile_weights(band.power_level, 1)
    weights[lead_key] = 0.0
    return _weighted_archetype(weights, rng)


def _randomized_power_group(
    *,
    level: int,
    slot: int,
    config: BalanceConfig,
    curve: EnemyCurve,
    rng: random.Random,
) -> EnemyGroup:
    power_level = _encounter_power_level(level, slot, config, rng)
    band = POWER_BANDS[power_level]
    lead_key = _weighted_archetype(_power_profile_weights(power_level, level), rng)
    power_tags = (f"power-{power_level}",)

    if band.enemy_count == 1:
        enemy = _tagged_enemy(
            make_enemy(level, lead_key, curve),
            band.lead_tags + power_tags,
        )
        return EnemyGroup(level=level, enemies=(enemy,), is_boss=False)

    lead = _scaled_enemy(
        make_enemy(level, lead_key, curve),
        name_suffix="Lead",
        hp_factor=band.lead_hp_factor,
        damage_factor=band.lead_damage_factor,
        tags=("group-primary",) + band.lead_tags + power_tags,
    )
    enemies = [lead]

    for support_index in range(1, band.enemy_count):
        support_key = _support_archetype_key(lead_key, band, rng)
        use_mage = level >= 2 and rng.random() < band.mage_chance
        support = make_enemy(level, support_key, curve)
        if use_mage:
            enemies.append(
                _scaled_enemy(
                    support,
                    name_suffix="Mage",
                    hp_factor=config.tactical.mage_support_hp_factor,
                    damage_factor=config.tactical.mage_support_damage_factor,
                    accuracy_delta=config.tactical.mage_support_accuracy_delta,
                    evasion_factor=config.tactical.mage_support_evasion_factor,
                    tags=("group-support", "mage-support") + power_tags,
                )
            )
            continue

        size_factor = 0.88 if support_index > 1 else 1.0
        enemies.append(
            _scaled_enemy(
                support,
                name_suffix="Support",
                hp_factor=band.support_hp_factor * size_factor,
                damage_factor=band.support_damage_factor * size_factor,
                accuracy_delta=0.03,
                evasion_factor=1.08,
                tags=("group-support",) + power_tags,
            )
        )

    return EnemyGroup(level=level, enemies=tuple(enemies), is_boss=False)


def encounter_to_group(
    encounter: Encounter,
    tactical: TacticalConfig,
    *,
    room_index: int,
    rng: random.Random | None = None,
) -> EnemyGroup:
    if encounter.is_boss:
        return EnemyGroup(level=encounter.level, enemies=(encounter.enemy,), is_boss=True)

    if room_index == 1:
        return EnemyGroup(level=encounter.level, enemies=(encounter.enemy,), is_boss=False)

    primary = _scaled_enemy(
        encounter.enemy,
        name_suffix="Lead",
        hp_factor=tactical.group_primary_hp_factor,
        damage_factor=tactical.group_primary_damage_factor,
        tags=("group-primary",),
    )
    support = _scaled_enemy(
        encounter.enemy,
        name_suffix="Support",
        hp_factor=tactical.group_support_hp_factor,
        damage_factor=tactical.group_support_damage_factor,
        accuracy_delta=0.03,
        evasion_factor=1.08,
        tags=("group-support",),
    )
    use_mage_support = (
        encounter.level >= 2
        and (
            room_index % 3 == 0
            if rng is None
            else rng.random() < min(0.34, 0.18 + 0.04 * (encounter.level - 2))
        )
    )
    if use_mage_support:
        support = _scaled_enemy(
            encounter.enemy,
            name_suffix="Mage",
            hp_factor=tactical.mage_support_hp_factor,
            damage_factor=tactical.mage_support_damage_factor,
            accuracy_delta=tactical.mage_support_accuracy_delta,
            evasion_factor=tactical.mage_support_evasion_factor,
            tags=("group-support", "mage-support"),
        )
    return EnemyGroup(level=encounter.level, enemies=(primary, support), is_boss=False)


def build_tactical_dungeon(
    config: BalanceConfig | None = None,
    dungeon: tuple[Encounter, ...] | None = None,
) -> tuple[EnemyGroup, ...]:
    config = config or BalanceConfig()
    dungeon = dungeon or build_default_dungeon(config.dungeon)
    return tuple(
        encounter_to_group(encounter, config.tactical, room_index=index)
        for index, encounter in enumerate(dungeon, start=1)
    )


def build_randomized_tactical_dungeon(
    config: BalanceConfig | None = None,
    rng: random.Random | None = None,
    dungeon: tuple[Encounter, ...] | None = None,
) -> tuple[EnemyGroup, ...]:
    config = config or BalanceConfig()
    rng = rng or random.Random()
    if dungeon is not None:
        return tuple(
            encounter_to_group(encounter, config.tactical, room_index=index, rng=rng)
            for index, encounter in enumerate(dungeon, start=1)
        )

    curve = EnemyCurve()
    groups: list[EnemyGroup] = []
    for level in range(1, config.dungeon.levels + 1):
        for slot in range(config.dungeon.encounters_per_level):
            groups.append(
                _randomized_power_group(
                    level=level,
                    slot=slot,
                    config=config,
                    curve=curve,
                    rng=rng,
                )
            )

        boss_key = boss_archetype_key(level, curve)
        groups.append(
            EnemyGroup(
                level=level,
                enemies=(make_enemy(level, boss_key, curve, is_boss=True),),
                is_boss=True,
            )
        )
    return tuple(groups)


def _choose_intent(
    enemy: EnemyStats,
    round_number: int,
    rng: random.Random,
    allies: tuple[TacticalEnemy, ...] | list[TacticalEnemy] | None = None,
    tactical: TacticalConfig | None = None,
    caster_index: int | None = None,
) -> EnemyIntent:
    tags = set(enemy.tags)
    if "boss" in tags:
        cycle = (
            EnemyIntent.HEAVY,
            EnemyIntent.STRIKE,
            EnemyIntent.PIERCE,
            EnemyIntent.AIM,
            EnemyIntent.HEAVY,
            EnemyIntent.STRIKE,
        )
        return cycle[(round_number - 1) % len(cycle)]
    if "mage-support" in tags:
        candidates: list[tuple[EnemyIntent, float]] = [
            (EnemyIntent.SHIELD, 0.30),
            (EnemyIntent.INVISIBILITY, 0.20),
            (EnemyIntent.STRIKE, 0.22),
            (EnemyIntent.AIM, 0.10),
        ]
        if allies is not None and tactical is not None and caster_index is not None:
            if _support_heal_target(list(allies), caster_index, tactical) is not None:
                candidates.insert(0, (EnemyIntent.HEAL, 0.34))
            if _support_shield_target(list(allies), caster_index, tactical) is None:
                candidates = [item for item in candidates if item[0] != EnemyIntent.SHIELD]
            if _support_invisibility_target(list(allies), caster_index) is None:
                candidates = [item for item in candidates if item[0] != EnemyIntent.INVISIBILITY]
        return rng.choices(
            tuple(intent for intent, _ in candidates),
            weights=tuple(weight for _, weight in candidates),
        )[0]
    if "hp-check" in tags:
        return rng.choices(
            (EnemyIntent.HEAVY, EnemyIntent.STRIKE, EnemyIntent.GUARD),
            weights=(0.42, 0.38, 0.20),
        )[0]
    if "dex-check" in tags:
        return rng.choices(
            (EnemyIntent.PIERCE, EnemyIntent.STRIKE, EnemyIntent.AIM, EnemyIntent.GUARD),
            weights=(0.34, 0.34, 0.22, 0.10),
        )[0]
    if "burst-check" in tags:
        return rng.choices(
            (EnemyIntent.STRIKE, EnemyIntent.PIERCE, EnemyIntent.HEAVY, EnemyIntent.AIM),
            weights=(0.38, 0.28, 0.22, 0.12),
        )[0]
    return rng.choices(
        (EnemyIntent.STRIKE, EnemyIntent.HEAVY, EnemyIntent.GUARD, EnemyIntent.AIM),
        weights=(0.50, 0.22, 0.16, 0.12),
    )[0]


def _intent_damage(enemy: TacticalEnemy, tactical: TacticalConfig) -> float:
    if not enemy.alive:
        return 0.0
    multiplier = {
        EnemyIntent.STRIKE: tactical.strike_damage_multiplier,
        EnemyIntent.HEAVY: tactical.heavy_intent_damage_multiplier,
        EnemyIntent.PIERCE: tactical.pierce_damage_multiplier,
        EnemyIntent.AIM: 0.0,
        EnemyIntent.GUARD: 0.0,
        EnemyIntent.HEAL: 0.0,
        EnemyIntent.SHIELD: 0.0,
        EnemyIntent.INVISIBILITY: 0.0,
    }[enemy.intent]
    if enemy.aimed and multiplier > 0:
        multiplier += tactical.aim_damage_bonus
    return enemy.enemy.damage * multiplier


def _replace_enemy(enemy: TacticalEnemy, **changes) -> TacticalEnemy:
    values = {
        "enemy": enemy.enemy,
        "hp": enemy.hp,
        "intent": enemy.intent,
        "aimed": enemy.aimed,
        "interrupted": enemy.interrupted,
        "sunder": enemy.sunder,
        "shield": enemy.shield,
        "shield_turns": enemy.shield_turns,
        "invisible": enemy.invisible,
        "invisible_turns": enemy.invisible_turns,
    }
    values.update(changes)
    return TacticalEnemy(**values)


def _apply_damage_to_enemy(enemy: TacticalEnemy, damage: float) -> TacticalEnemy:
    blocked = min(enemy.shield, max(0.0, damage))
    remaining_damage = max(0.0, damage - blocked)
    return _replace_enemy(
        enemy,
        shield=round(max(0.0, enemy.shield - blocked), 4),
        hp=max(0.0, enemy.hp - remaining_damage),
    )


def _support_heal_target(enemies: list[TacticalEnemy], caster_index: int, tactical: TacticalConfig) -> int | None:
    candidates = [
        (index, enemy)
        for index, enemy in enumerate(enemies)
        if index != caster_index and enemy.alive and enemy.hp < enemy.enemy.max_hp * tactical.support_heal_threshold
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[1].enemy.max_hp - item[1].hp)[0]


def _support_shield_target(enemies: list[TacticalEnemy], caster_index: int, tactical: TacticalConfig) -> int | None:
    candidates = [
        (index, enemy)
        for index, enemy in enumerate(enemies)
        if enemy.alive and enemy.shield < enemy.enemy.max_hp * tactical.support_shield_max_hp_fraction
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: (
            index_priority(item[0], caster_index),
            item[1].enemy.max_hp * tactical.support_shield_max_hp_fraction - item[1].shield,
        ),
    )[0]


def _support_invisibility_target(enemies: list[TacticalEnemy], caster_index: int) -> int | None:
    candidates = [
        (index, enemy)
        for index, enemy in enumerate(enemies)
        if enemy.alive and not enemy.invisible
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: (
            index_priority(item[0], caster_index),
            item[1].enemy.max_hp - item[1].hp,
        ),
    )[0]


def _support_spell_amount(enemy: TacticalEnemy, multiplier: float) -> float:
    return enemy.enemy.damage * multiplier


def _expire_player_turn_status(enemy: TacticalEnemy) -> TacticalEnemy:
    shield_turns = max(0, enemy.shield_turns - 1)
    invisible_turns = max(0, enemy.invisible_turns - 1)
    return _replace_enemy(
        enemy,
        shield=enemy.shield if shield_turns > 0 else 0.0,
        shield_turns=shield_turns,
        invisible=invisible_turns > 0,
        invisible_turns=invisible_turns,
    )


def _assign_next_intents(
    enemies: list[TacticalEnemy],
    round_number: int,
    rng: random.Random,
    tactical: TacticalConfig,
) -> list[TacticalEnemy]:
    snapshot = tuple(enemies)
    return [
        _replace_enemy(
            enemy,
            intent=_choose_intent(enemy.enemy, round_number, rng, snapshot, tactical, index),
        )
        if enemy.alive
        else enemy
        for index, enemy in enumerate(enemies)
    ]


def index_priority(index: int, caster_index: int) -> int:
    return 0 if index == caster_index else 1


def _best_target(enemies: tuple[TacticalEnemy, ...], tactical: TacticalConfig) -> int:
    alive = [(index, enemy) for index, enemy in enumerate(enemies) if enemy.alive]
    if not alive:
        return 0

    def priority(item: tuple[int, TacticalEnemy]) -> tuple[float, float]:
        _, enemy = item
        threat = _intent_damage(enemy, tactical)
        support_bonus = 3.6 if "mage-support" in enemy.enemy.tags else 0.0
        intent_bonus_value = 1.2 if enemy.intent in (
            EnemyIntent.HEAL,
            EnemyIntent.SHIELD,
            EnemyIntent.INVISIBILITY,
        ) else 0.0
        intent_bonus = 2.0 if enemy.intent == EnemyIntent.HEAVY else 1.0
        effective_hp = enemy.hp + enemy.shield
        return ((threat * intent_bonus + support_bonus + intent_bonus_value) / max(effective_hp, 0.1), -effective_hp)

    return max(alive, key=priority)[0]


def _heavy_evasion_hit_penalty(enemy: EnemyStats, tactical: TacticalConfig) -> float:
    return clamp(
        (enemy.evasion - tactical.heavy_evasion_hit_penalty_floor)
        * tactical.heavy_evasion_hit_penalty_scale,
        0.0,
        tactical.heavy_evasion_hit_penalty_max,
    )


def _sweep_damage_multiplier(player: StatLine, tactical: TacticalConfig) -> float:
    dexterity_bonus = clamp(
        (player.dexterity - 5.0) * tactical.sweep_dexterity_damage_per_point,
        0.0,
        tactical.sweep_max_dexterity_damage_bonus,
    )
    return tactical.sweep_damage_multiplier + dexterity_bonus


def _action_damage_multiplier(
    player: StatLine,
    tactical: TacticalConfig,
    weapon: WeaponProfile,
    action: PlayerAction,
) -> float:
    if action == PlayerAction.HEAVY:
        return tactical.heavy_damage_multiplier * weapon.heavy_damage_multiplier
    if action == PlayerAction.QUICK:
        return tactical.quick_damage_multiplier * weapon.quick_damage_multiplier
    if action == PlayerAction.SWEEP:
        return _sweep_damage_multiplier(player, tactical) * weapon.sweep_damage_multiplier
    return tactical.attack_damage_multiplier * weapon.attack_damage_multiplier


def _sunder_damage_multiplier(
    enemy: TacticalEnemy,
    tactical: TacticalConfig,
    weapon: WeaponProfile,
    action: PlayerAction,
) -> float:
    if enemy.sunder <= 0 or action == PlayerAction.SWEEP:
        return 1.0
    effectiveness = 1.0
    if action == PlayerAction.QUICK:
        effectiveness = tactical.sunder_quick_effectiveness
    elif action == PlayerAction.HEAVY:
        effectiveness = tactical.sunder_heavy_effectiveness
    return 1.0 + enemy.sunder * (tactical.sunder_damage_bonus_per_stack + weapon.sunder_bonus_per_stack) * effectiveness


def _sunder_added_by_action(action: PlayerAction, weapon: WeaponProfile) -> int:
    if action == PlayerAction.ATTACK:
        return weapon.sunder_on_hit
    if action == PlayerAction.HEAVY:
        return weapon.sunder_on_hit + weapon.sunder_on_heavy_hit
    return 0


def _contextual_weapon_damage_multiplier(
    enemy: TacticalEnemy,
    weapon: WeaponProfile,
    *,
    round_number: int | None = None,
) -> float:
    multiplier = 1.0
    if "boss" in enemy.enemy.tags:
        multiplier *= weapon.boss_damage_multiplier
    if enemy.enemy.max_hp > 0 and enemy.hp / enemy.enemy.max_hp <= weapon.execute_hp_threshold:
        multiplier *= weapon.execute_damage_multiplier
    if round_number == 1:
        multiplier *= weapon.first_strike_damage_multiplier
    return multiplier


def _estimate_action_damage(
    player: StatLine,
    enemy: TacticalEnemy,
    weapon: WeaponProfile,
    combat_config,
    tactical: TacticalConfig,
    action: PlayerAction,
) -> float:
    if action == PlayerAction.GUARD:
        return 0.0
    multiplier = _action_damage_multiplier(player, tactical, weapon, action) * _sunder_damage_multiplier(
        enemy, tactical, weapon, action
    ) * _contextual_weapon_damage_multiplier(enemy, weapon)
    hit_mod = 0.0
    if action == PlayerAction.QUICK:
        hit_mod += tactical.quick_hit_modifier
    if action == PlayerAction.SWEEP:
        hit_mod += tactical.sweep_hit_modifier
    if action == PlayerAction.HEAVY:
        hit_mod += tactical.heavy_hit_modifier - _heavy_evasion_hit_penalty(enemy.enemy, tactical)
    crit_mod = tactical.quick_crit_modifier if action == PlayerAction.QUICK else 0.0
    quality_bonus = 0.0
    if action == PlayerAction.QUICK:
        quality_bonus += tactical.quick_quality_bonus
    if action == PlayerAction.SWEEP:
        quality_bonus += tactical.sweep_quality_bonus
    hit = clamp(
        player_hit_chance(player, enemy.enemy, weapon, combat_config)
        + hit_mod
        - (tactical.support_invisibility_hit_penalty if enemy.invisible else 0.0),
        combat_config.min_player_hit_chance,
        combat_config.max_player_hit_chance,
    )
    crit = 0.0 if action == PlayerAction.SWEEP else clamp(
        player_crit_chance(player, enemy.enemy, weapon, combat_config) + crit_mod,
        0.0,
        combat_config.max_crit_chance,
    )
    quality = clamp(
        player_damage_quality(player, enemy.enemy, combat_config)
        + quality_bonus
        + weapon.damage_quality_modifier,
        0.0,
        1.0,
    )
    damage = player_base_damage(player, weapon, combat_config) * multiplier
    if action != PlayerAction.SWEEP:
        damage *= 1.0 + weapon.on_hit_bonus_damage
    if enemy.intent == EnemyIntent.GUARD:
        guard_reduction = tactical.enemy_guard_reduction
        if action == PlayerAction.HEAVY:
            guard_reduction *= 1.0 - tactical.heavy_guard_ignore
        damage *= 1.0 - guard_reduction
    expected_normal_damage = damage * (1.0 + combat_config.damage_variance * quality)
    expected_crit_factor = 1.0 + crit * (
        max(1.0, combat_config.crit_multiplier + weapon.crit_multiplier_modifier) - 1.0
    )
    if action == PlayerAction.SWEEP:
        return expected_normal_damage * (
            hit * expected_crit_factor + (1.0 - hit) * tactical.sweep_glancing_damage_multiplier
        )
    return hit * damage * (1.0 + combat_config.damage_variance * quality) * expected_crit_factor


def _action_mana_cost(
    action: PlayerAction,
    config: BalanceConfig,
    ability: ClassAbility | None = None,
) -> int:
    if action == PlayerAction.ATTACK:
        return config.tactical.attack_mana_cost
    if action == PlayerAction.HEAVY:
        return config.tactical.heavy_mana_cost
    if action == PlayerAction.QUICK:
        return config.tactical.quick_mana_cost
    if action == PlayerAction.SWEEP:
        return config.tactical.sweep_mana_cost
    if action == PlayerAction.GUARD:
        return config.tactical.guard_mana_cost
    if action == PlayerAction.ABILITY:
        return ability.mana_cost if ability is not None else 0
    return 0


def _can_pay_mana(
    action: PlayerAction,
    current_mana: float,
    config: BalanceConfig,
    ability: ClassAbility | None = None,
) -> bool:
    return current_mana >= _action_mana_cost(action, config, ability)


def _choose_action(
    player: StatLine,
    current_hp: float,
    enemies: tuple[TacticalEnemy, ...],
    weapon: WeaponProfile,
    build: PlayerBuild,
    config: BalanceConfig,
    ability_available: bool = False,
    current_mana: float | None = None,
) -> tuple[PlayerAction, int | None]:
    alive = tuple(enemy for enemy in enemies if enemy.alive)
    if not alive:
        return PlayerAction.ATTACK, None

    mana = config.tactical.max_mana if current_mana is None else current_mana
    ability = build.base_ability
    target_index = _best_target(enemies, config.tactical)
    target = enemies[target_index]
    expected_incoming = sum(_intent_damage(enemy, config.tactical) for enemy in alive)
    focused_actions = tuple(
        action for action in (PlayerAction.ATTACK, PlayerAction.HEAVY, PlayerAction.QUICK)
        if _can_pay_mana(action, mana, config)
    )
    action_damage = {
        action: _estimate_action_damage(
            player, target, weapon, config.combat, config.tactical, action
        )
        for action in focused_actions
    }
    best_finisher = max(focused_actions, key=lambda action: action_damage[action])
    if action_damage[best_finisher] >= (target.hp + target.shield) * 0.90:
        return best_finisher, target_index

    if (
        ability_available
        and ability is not None
        and _can_pay_mana(PlayerAction.ABILITY, mana, config, ability)
        and (
            ability.mana_cost <= 0
            or any(_is_riposte_priority_enemy(enemy) for enemy in alive)
        )
        and expected_incoming >= max(current_hp * 0.42, player.max_hp * 0.28)
    ):
        return PlayerAction.ABILITY, None

    heavy_enemies = [index for index, enemy in enumerate(enemies) if enemy.alive and enemy.intent == EnemyIntent.HEAVY]
    if _can_pay_mana(PlayerAction.QUICK, mana, config) and heavy_enemies and (
        player.dexterity >= 7.0
        or any("boss" in enemies[index].enemy.tags for index in heavy_enemies)
    ):
        return PlayerAction.QUICK, max(heavy_enemies, key=lambda index: _intent_damage(enemies[index], config.tactical))

    if expected_incoming >= max(current_hp * 0.42, player.max_hp * 0.28):
        return PlayerAction.GUARD, None

    if len(alive) > 1:
        sweep_damage = sum(
            _estimate_action_damage(player, enemy, weapon, config.combat, config.tactical, PlayerAction.SWEEP)
            for enemy in alive
        )
        single_target_damage = max(
            _estimate_action_damage(player, enemy, weapon, config.combat, config.tactical, action)
            for enemy in alive
            for action in focused_actions
        )
        if (
            _can_pay_mana(PlayerAction.SWEEP, mana, config)
            and sweep_damage >= single_target_damage * config.tactical.sweep_auto_damage_ratio
        ):
            return PlayerAction.SWEEP, None

    weights = build.weights.normalized()
    if target.intent == EnemyIntent.GUARD and _can_pay_mana(PlayerAction.HEAVY, mana, config):
        return PlayerAction.HEAVY, target_index
    if "boss" in target.enemy.tags and _can_pay_mana(PlayerAction.QUICK, mana, config):
        quick_damage = action_damage.get(PlayerAction.QUICK, 0.0)
        best_damage = max(action_damage.values())
        quick_hit = _player_hit_probability(player, target.enemy, weapon, config, PlayerAction.QUICK, invisible=target.invisible)
        heavy_hit = _player_hit_probability(player, target.enemy, weapon, config, PlayerAction.HEAVY, invisible=target.invisible)
        if (
            quick_damage >= best_damage * 0.72
            and quick_hit >= heavy_hit + 0.12
        ):
            return PlayerAction.QUICK, target_index
    attack_damage = action_damage[PlayerAction.ATTACK]
    heavy_damage = action_damage.get(PlayerAction.HEAVY, 0.0)
    quick_damage = action_damage.get(PlayerAction.QUICK, 0.0)
    attack_hit = _player_hit_probability(player, target.enemy, weapon, config, PlayerAction.ATTACK, invisible=target.invisible)
    heavy_hit = _player_hit_probability(player, target.enemy, weapon, config, PlayerAction.HEAVY, invisible=target.invisible)
    quick_hit = _player_hit_probability(player, target.enemy, weapon, config, PlayerAction.QUICK, invisible=target.invisible)
    incoming_safe = expected_incoming < max(current_hp * 0.28, player.max_hp * 0.18)
    heavy_has_weapon_payoff = (
        weapon.sunder_on_hit > 0
        or weapon.sunder_on_heavy_hit > 0
        or weapon.stun_on_heavy_hit_chance > 0.0
        or weapon.heavy_damage_multiplier >= 1.12
    )
    if (
        _can_pay_mana(PlayerAction.QUICK, mana, config)
        and weights.dexterity > weights.strength
        and player.dexterity >= 7.5
    ):
        return PlayerAction.QUICK, target_index
    if (
        _can_pay_mana(PlayerAction.HEAVY, mana, config)
        and heavy_has_weapon_payoff
        and incoming_safe
        and heavy_damage >= attack_damage * 1.20
        and heavy_hit >= attack_hit - 0.22
    ):
        return PlayerAction.HEAVY, target_index
    if (
        _can_pay_mana(PlayerAction.HEAVY, mana, config)
        and incoming_safe
        and heavy_damage >= attack_damage * 1.30
        and heavy_hit >= attack_hit - 0.20
    ):
        return PlayerAction.HEAVY, target_index
    if (
        _can_pay_mana(PlayerAction.QUICK, mana, config)
        and quick_damage >= attack_damage * 0.82
        and quick_hit >= attack_hit + 0.08
    ):
        return PlayerAction.QUICK, target_index
    return PlayerAction.ATTACK, target_index


def _choose_random_action(
    enemies: tuple[TacticalEnemy, ...],
    rng: random.Random,
    current_mana: float,
    config: BalanceConfig,
) -> tuple[PlayerAction, int | None]:
    actions = tuple(
        action for action in PlayerAction
        if action != PlayerAction.ABILITY and _can_pay_mana(action, current_mana, config)
    )
    if not actions:
        return PlayerAction.ATTACK, None
    action = rng.choice(actions)
    if action in (PlayerAction.GUARD, PlayerAction.SWEEP):
        return action, None
    alive_indices = [index for index, enemy in enumerate(enemies) if enemy.alive]
    return action, rng.choice(alive_indices) if alive_indices else None


def _ability_guard_reduction(
    ability: ClassAbility,
    enemy_intent: EnemyIntent,
    config: TacticalConfig,
) -> float:
    if enemy_intent == EnemyIntent.PIERCE:
        return ability.pierce_guard_reduction if ability.pierce_guard_reduction is not None else config.pierce_guard_reduction
    return ability.guard_reduction


def _is_riposte_priority_enemy(enemy: TacticalEnemy) -> bool:
    tags = set(enemy.enemy.tags)
    return bool(tags & {"boss", "elite", "tank", "hp-check"})


def _resolve_riposte_counter(
    enemies: list[TacticalEnemy],
    target_index: int,
    player: StatLine,
    weapon: WeaponProfile,
    ability: ClassAbility,
    config: BalanceConfig,
    rng: random.Random,
    *,
    round_number: int | None = None,
) -> tuple[float, int, int, int, tuple[str, ...]]:
    target = enemies[target_index]
    if not target.alive or ability.counter_damage_multiplier <= 0.0:
        return 0.0, 0, 0, 0, ()

    hit = _player_hit_probability(player, target.enemy, weapon, config, PlayerAction.ATTACK, invisible=target.invisible)
    if rng.random() > hit:
        return 0.0, 0, 1, 0, ()

    quality = _player_damage_quality(player, target.enemy, weapon, config, PlayerAction.ATTACK)
    context_multiplier = _contextual_weapon_damage_multiplier(
        target,
        weapon,
        round_number=round_number,
    )
    damage = _varied_damage(
        player_base_damage(player, weapon, config.combat)
        * _action_damage_multiplier(player, config.tactical, weapon, PlayerAction.ATTACK)
        * _sunder_damage_multiplier(target, config.tactical, weapon, PlayerAction.ATTACK)
        * context_multiplier
        * (1.0 + weapon.on_hit_bonus_damage)
        * ability.counter_damage_multiplier,
        config.combat.damage_variance,
        rng,
        quality,
    )
    crits = 0
    if rng.random() <= _player_crit_probability(player, target.enemy, weapon, config, PlayerAction.ATTACK):
        crits = 1
        damage *= max(1.0, config.combat.crit_multiplier + weapon.crit_multiplier_modifier)

    damaged = _apply_damage_to_enemy(target, damage)
    enemies[target_index] = _replace_enemy(
        damaged,
        sunder=min(
            config.tactical.sunder_max_stacks,
            damaged.sunder + _sunder_added_by_action(PlayerAction.ATTACK, weapon),
        ),
    )
    defeated = (damaged.enemy.name,) if not damaged.alive else ()
    return damage, 1, 0, crits, defeated


def _player_hit_probability(
    player: StatLine,
    enemy: EnemyStats,
    weapon: WeaponProfile,
    config: BalanceConfig,
    action: PlayerAction,
    *,
    invisible: bool = False,
) -> float:
    modifier = 0.0
    if action == PlayerAction.HEAVY:
        modifier += config.tactical.heavy_hit_modifier - _heavy_evasion_hit_penalty(
            enemy, config.tactical
        )
    elif action == PlayerAction.QUICK:
        modifier += config.tactical.quick_hit_modifier
    elif action == PlayerAction.SWEEP:
        modifier += config.tactical.sweep_hit_modifier
    if invisible:
        modifier -= config.tactical.support_invisibility_hit_penalty
    return clamp(
        player_hit_chance(player, enemy, weapon, config.combat) + modifier,
        config.combat.min_player_hit_chance,
        config.combat.max_player_hit_chance,
    )


def _player_crit_probability(
    player: StatLine,
    enemy: EnemyStats,
    weapon: WeaponProfile,
    config: BalanceConfig,
    action: PlayerAction,
) -> float:
    modifier = config.tactical.quick_crit_modifier if action == PlayerAction.QUICK else 0.0
    return clamp(
        player_crit_chance(player, enemy, weapon, config.combat) + modifier,
        0.0,
        config.combat.max_crit_chance,
    )


def _player_damage_quality(
    player: StatLine,
    enemy: EnemyStats,
    weapon: WeaponProfile,
    config: BalanceConfig,
    action: PlayerAction,
) -> float:
    bonus = 0.0
    if action == PlayerAction.QUICK:
        bonus += config.tactical.quick_quality_bonus
    if action == PlayerAction.SWEEP:
        bonus += config.tactical.sweep_quality_bonus
    return clamp(player_damage_quality(player, enemy, config.combat) + bonus + weapon.damage_quality_modifier, 0.0, 1.0)


def _double_strike_chance(player: StatLine, weapon: WeaponProfile, config: TacticalConfig) -> float:
    return clamp(
        config.double_strike_base_chance
        + player.dexterity * config.double_strike_per_dexterity
        + weapon.double_strike_chance_modifier,
        0.0,
        config.max_double_strike_chance,
    )


def _interrupt_chance(player: StatLine, config: TacticalConfig) -> float:
    return clamp(
        config.quick_interrupt_base_chance + player.dexterity * config.quick_interrupt_per_dexterity,
        0.0,
        config.max_interrupt_chance,
    )


def _resolve_player_attack(
    enemies: list[TacticalEnemy],
    target_index: int,
    action: PlayerAction,
    player: StatLine,
    weapon: WeaponProfile,
    config: BalanceConfig,
    rng: random.Random,
    *,
    round_number: int | None = None,
) -> tuple[float, int, int, int, tuple[str, ...], tuple[str, ...]]:
    target = enemies[target_index]
    if not target.alive:
        return 0.0, 0, 0, 0, (), ()

    hits = 0
    misses = 0
    crits = 0
    defeated: list[str] = []
    interrupted: list[str] = []
    total_damage = 0.0
    hit = _player_hit_probability(player, target.enemy, weapon, config, action, invisible=target.invisible)
    crit = _player_crit_probability(player, target.enemy, weapon, config, action)
    quality = _player_damage_quality(player, target.enemy, weapon, config, action)
    base_damage = player_base_damage(player, weapon, config.combat) * _action_damage_multiplier(
        player, config.tactical, weapon, action
    )

    def strike(strike_multiplier: float = 1.0, can_crit: bool = True) -> None:
        nonlocal target, hits, misses, crits, total_damage, interrupted
        if rng.random() > hit:
            misses += 1
            return
        hits += 1
        sunder_bonus = _sunder_damage_multiplier(target, config.tactical, weapon, action)
        context_multiplier = _contextual_weapon_damage_multiplier(
            target,
            weapon,
            round_number=round_number,
        )
        effect_multiplier = 1.0 + weapon.on_hit_bonus_damage
        damage = _varied_damage(
            base_damage * sunder_bonus * context_multiplier * effect_multiplier * strike_multiplier,
            config.combat.damage_variance,
            rng,
            quality,
        )
        if target.intent == EnemyIntent.GUARD:
            guard_reduction = config.tactical.enemy_guard_reduction
            if action == PlayerAction.HEAVY:
                guard_reduction *= 1.0 - config.tactical.heavy_guard_ignore
            damage *= 1.0 - guard_reduction
        if can_crit and rng.random() <= crit:
            crits += 1
            damage *= max(1.0, config.combat.crit_multiplier + weapon.crit_multiplier_modifier)
        damaged = _apply_damage_to_enemy(target, damage)
        stunned = (
            damaged.hp > 0.0
            and action == PlayerAction.HEAVY
            and weapon.stun_on_heavy_hit_chance > 0.0
            and rng.random() <= weapon.stun_on_heavy_hit_chance
        )
        staggered = (
            damaged.hp > 0.0
            and weapon.stagger_on_hit_chance > 0.0
            and rng.random() <= weapon.stagger_on_hit_chance
        )
        frozen = (
            damaged.hp > 0.0
            and weapon.freeze_on_hit_chance > 0.0
            and rng.random() <= weapon.freeze_on_hit_chance
        )
        target = _replace_enemy(
            damaged,
            interrupted=damaged.interrupted or stunned or staggered or frozen,
            sunder=min(
                config.tactical.sunder_max_stacks,
                damaged.sunder + _sunder_added_by_action(action, weapon),
            ),
        )
        enemies[target_index] = target
        total_damage += damage
        if stunned or staggered or frozen:
            interrupted.append(target.enemy.name)

    strike()
    if target.alive and action == PlayerAction.QUICK and rng.random() <= _double_strike_chance(player, weapon, config.tactical):
        strike(config.tactical.double_strike_damage_multiplier, can_crit=False)

    if not target.alive:
        defeated.append(target.enemy.name)
    elif action == PlayerAction.QUICK and target.intent == EnemyIntent.HEAVY:
        if rng.random() <= _interrupt_chance(player, config.tactical):
            target = _replace_enemy(
                target,
                interrupted=True,
            )
            enemies[target_index] = target
            interrupted.append(target.enemy.name)

    return total_damage, hits, misses, crits, tuple(defeated), tuple(interrupted)


def _resolve_player_sweep(
    enemies: list[TacticalEnemy],
    player: StatLine,
    weapon: WeaponProfile,
    config: BalanceConfig,
    rng: random.Random,
) -> tuple[float, int, int, int, tuple[str, ...], tuple[str, ...]]:
    hits = 0
    misses = 0
    crits = 0
    defeated: list[str] = []
    total_damage = 0.0
    base_damage = player_base_damage(player, weapon, config.combat) * _action_damage_multiplier(
        player, config.tactical, weapon, PlayerAction.SWEEP
    )

    for index, target in enumerate(tuple(enemies)):
        if not target.alive:
            continue

        hit = _player_hit_probability(
            player,
            target.enemy,
            weapon,
            config,
            PlayerAction.SWEEP,
            invisible=target.invisible,
        )
        crit = 0.0
        quality = _player_damage_quality(player, target.enemy, weapon, config, PlayerAction.SWEEP)
        landed = rng.random() <= hit
        if not landed:
            misses += 1
        else:
            hits += 1

        damage_multiplier = 1.0 if landed else config.tactical.sweep_glancing_damage_multiplier
        damage = _varied_damage(base_damage * damage_multiplier, config.combat.damage_variance, rng, quality)
        if target.intent == EnemyIntent.GUARD:
            damage *= 1.0 - config.tactical.enemy_guard_reduction
        updated = _apply_damage_to_enemy(target, damage)
        enemies[index] = updated
        total_damage += damage
        if not updated.alive:
            defeated.append(updated.enemy.name)

    return total_damage, hits, misses, crits, tuple(defeated), ()


def simulate_tactical_combat(
    player: StatLine,
    current_hp: float,
    group: EnemyGroup,
    weapon: WeaponProfile,
    config: BalanceConfig,
    rng: random.Random,
    build: PlayerBuild | None = None,
    action_policy: str = "skilled",
) -> TacticalCombatResult:
    player_hp_before = current_hp
    enemies = _assign_next_intents(
        [
            TacticalEnemy(enemy=enemy, hp=enemy.max_hp, intent=EnemyIntent.STRIKE)
            for enemy in group.enemies
        ],
        1,
        rng,
        config.tactical,
    )
    player_hits = 0
    player_misses = 0
    player_crits = 0
    enemy_hits = 0
    enemy_misses = 0
    total_damage_dealt = 0.0
    total_damage_taken = 0.0
    log: list[TacticalRound] = []
    policy_build = build or DEFAULT_BUILDS[0]
    base_ability = policy_build.base_ability
    ability_charges = base_ability.charges_per_combat if base_ability is not None else 0
    current_mana = min(config.tactical.max_mana, config.tactical.starting_mana)

    for round_number in range(1, config.combat.max_combat_rounds + 1):
        alive_indices = [index for index, enemy in enumerate(enemies) if enemy.alive]
        if not alive_indices:
            return TacticalCombatResult(
                won=True,
                rounds=round_number - 1,
                player_hp_before=player_hp_before,
                player_hp_after=max(0.0, current_hp),
                enemies_remaining=(),
                player_hits=player_hits,
                player_misses=player_misses,
                player_crits=player_crits,
                enemy_hits=enemy_hits,
                enemy_misses=enemy_misses,
                total_damage_dealt=total_damage_dealt,
                total_damage_taken=total_damage_taken,
                log=tuple(log),
            )

        if action_policy == "random":
            action, target_index = _choose_random_action(tuple(enemies), rng, current_mana, config)
        else:
            action, target_index = _choose_action(
                player,
                current_hp,
                tuple(enemies),
                weapon,
                policy_build,
                config,
                ability_available=ability_charges > 0,
                current_mana=current_mana,
            )
        if action == PlayerAction.ABILITY:
            if (
                base_ability is None
                or ability_charges <= 0
                or not _can_pay_mana(PlayerAction.ABILITY, current_mana, config, base_ability)
            ):
                action = PlayerAction.GUARD
            else:
                ability_charges -= 1
        if not _can_pay_mana(action, current_mana, config, base_ability if action == PlayerAction.ABILITY else None):
            action = PlayerAction.ATTACK
        current_mana = max(
            0,
            current_mana - _action_mana_cost(action, config, base_ability if action == PlayerAction.ABILITY else None),
        )
        intents_before = tuple(enemy.intent for enemy in enemies if enemy.alive)
        round_damage_dealt = 0.0
        round_damage_taken = 0.0
        defeated: tuple[str, ...] = ()
        interrupted: tuple[str, ...] = ()
        riposte_triggers_remaining = (
            base_ability.counter_triggers
            if action == PlayerAction.ABILITY and base_ability is not None
            else 0
        )

        if action == PlayerAction.SWEEP:
            (
                round_damage_dealt,
                hits,
                misses,
                crits,
                defeated,
                interrupted,
            ) = _resolve_player_sweep(enemies, player, weapon, config, rng)
            player_hits += hits
            player_misses += misses
            player_crits += crits
            total_damage_dealt += round_damage_dealt
        elif action not in (PlayerAction.GUARD, PlayerAction.ABILITY) and target_index is not None:
            (
                round_damage_dealt,
                hits,
                misses,
                crits,
                defeated,
                interrupted,
            ) = _resolve_player_attack(
                enemies,
                target_index,
                action,
                player,
                weapon,
                config,
                rng,
                round_number=round_number,
            )
            player_hits += hits
            player_misses += misses
            player_crits += crits
            total_damage_dealt += round_damage_dealt

        if all(not enemy.alive for enemy in enemies):
            log.append(
                TacticalRound(
                    round_number=round_number,
                    action=action,
                    target_index=target_index,
                    intents_before=intents_before,
                    damage_dealt=round_damage_dealt,
                    damage_taken=0.0,
                    defeated=defeated,
                    interrupted=interrupted,
                )
            )
            return TacticalCombatResult(
                won=True,
                rounds=round_number,
                player_hp_before=player_hp_before,
                player_hp_after=max(0.0, current_hp),
                enemies_remaining=(),
                player_hits=player_hits,
                player_misses=player_misses,
                player_crits=player_crits,
                enemy_hits=enemy_hits,
                enemy_misses=enemy_misses,
                total_damage_dealt=total_damage_dealt,
                total_damage_taken=total_damage_taken,
                log=tuple(log),
            )

        enemies = [_expire_player_turn_status(enemy) for enemy in enemies]
        for index, enemy in enumerate(tuple(enemies)):
            if not enemy.alive:
                continue
            if enemy.interrupted:
                enemies[index] = _replace_enemy(enemy, interrupted=False, aimed=False)
                continue
            if enemy.intent == EnemyIntent.AIM:
                enemies[index] = _replace_enemy(enemy, aimed=True)
                continue
            if enemy.intent == EnemyIntent.GUARD:
                enemies[index] = _replace_enemy(enemy, aimed=False)
                continue
            if enemy.intent == EnemyIntent.HEAL:
                target_index = _support_heal_target(enemies, index, config.tactical)
                if target_index is not None:
                    target = enemies[target_index]
                    amount = _support_spell_amount(enemy, config.tactical.support_heal_damage_multiplier)
                    enemies[target_index] = _replace_enemy(
                        target,
                        hp=min(target.enemy.max_hp, target.hp + amount),
                    )
                enemies[index] = _replace_enemy(enemies[index], aimed=False)
                continue
            if enemy.intent == EnemyIntent.SHIELD:
                target_index = _support_shield_target(enemies, index, config.tactical)
                if target_index is not None:
                    target = enemies[target_index]
                    max_shield = target.enemy.max_hp * config.tactical.support_shield_max_hp_fraction
                    amount = _support_spell_amount(enemy, config.tactical.support_shield_damage_multiplier)
                    enemies[target_index] = _replace_enemy(
                        target,
                        shield=min(max_shield, target.shield + amount),
                        shield_turns=1,
                    )
                enemies[index] = _replace_enemy(enemies[index], aimed=False)
                continue
            if enemy.intent == EnemyIntent.INVISIBILITY:
                target_index = _support_invisibility_target(enemies, index)
                if target_index is not None:
                    target = enemies[target_index]
                    enemies[target_index] = _replace_enemy(
                        target,
                        invisible=True,
                        invisible_turns=1,
                    )
                enemies[index] = _replace_enemy(enemies[index], aimed=False)
                continue

            enemy_hits += 1
            incoming = _varied_damage(_intent_damage(enemy, config.tactical), config.combat.damage_variance, rng)
            if action in (PlayerAction.GUARD, PlayerAction.ABILITY):
                reduction = (
                    _ability_guard_reduction(base_ability, enemy.intent, config.tactical)
                    if action == PlayerAction.ABILITY and base_ability is not None
                    else (
                        config.tactical.pierce_guard_reduction
                        if enemy.intent == EnemyIntent.PIERCE
                        else config.tactical.player_guard_reduction
                    )
                )
                incoming *= 1.0 - reduction
            current_hp -= incoming
            round_damage_taken += incoming
            total_damage_taken += incoming
            if (
                action == PlayerAction.ABILITY
                and base_ability is not None
                and riposte_triggers_remaining > 0
                and current_hp > 0
                and enemies[index].alive
            ):
                (
                    counter_damage,
                    counter_hits,
                    counter_misses,
                    counter_crits,
                    counter_defeated,
                ) = _resolve_riposte_counter(
                    enemies,
                    index,
                    player,
                    weapon,
                    base_ability,
                    config,
                    rng,
                    round_number=round_number,
                )
                riposte_triggers_remaining -= 1
                player_hits += counter_hits
                player_misses += counter_misses
                player_crits += counter_crits
                round_damage_dealt += counter_damage
                total_damage_dealt += counter_damage
                defeated = defeated + counter_defeated

            enemies[index] = _replace_enemy(enemies[index], aimed=False)

        next_enemies = _assign_next_intents(enemies, round_number + 1, rng, config.tactical)

        log.append(
            TacticalRound(
                round_number=round_number,
                action=action,
                target_index=target_index,
                intents_before=intents_before,
                damage_dealt=round_damage_dealt,
                damage_taken=round_damage_taken,
                defeated=defeated,
                interrupted=interrupted,
            )
        )
        if current_hp <= 0:
            remaining = tuple(
                (enemy.enemy.name, max(0.0, enemy.hp)) for enemy in next_enemies if enemy.alive
            )
            return TacticalCombatResult(
                won=False,
                rounds=round_number,
                player_hp_before=player_hp_before,
                player_hp_after=0.0,
                enemies_remaining=remaining,
                player_hits=player_hits,
                player_misses=player_misses,
                player_crits=player_crits,
                enemy_hits=enemy_hits,
                enemy_misses=enemy_misses,
                total_damage_dealt=total_damage_dealt,
                total_damage_taken=total_damage_taken,
                log=tuple(log),
            )

        current_mana = min(
            config.tactical.max_mana,
            current_mana + config.tactical.mana_regen_per_round,
        )
        enemies = next_enemies

    remaining = tuple((enemy.enemy.name, max(0.0, enemy.hp)) for enemy in enemies if enemy.alive)
    return TacticalCombatResult(
        won=False,
        rounds=config.combat.max_combat_rounds,
        player_hp_before=player_hp_before,
        player_hp_after=max(0.0, current_hp),
        enemies_remaining=remaining,
        player_hits=player_hits,
        player_misses=player_misses,
        player_crits=player_crits,
        enemy_hits=enemy_hits,
        enemy_misses=enemy_misses,
        total_damage_dealt=total_damage_dealt,
        total_damage_taken=total_damage_taken,
        log=tuple(log),
    )


def simulate_tactical_dungeon_with_loot(
    build: PlayerBuild,
    config: BalanceConfig | None = None,
    groups: tuple[EnemyGroup, ...] | None = None,
    loot_config: LootConfig | None = None,
    *,
    seed: int = 0,
    action_policy: str = "skilled",
    loot_policy: str = "weighted",
) -> DungeonRunResult:
    config = config or BalanceConfig()
    loot_config = loot_config or LootConfig()
    rng = random.Random(seed)
    groups = groups or build_randomized_tactical_dungeon(config, rng=rng)

    budget = config.dungeon.initial_stat_budget
    base_stats = config.stats.from_budget(build.weights, budget)
    loadout = starting_loadout(base_stats, weapon=build.weapon, modifiers=build.modifiers)
    current_hp = loadout.stats().max_hp
    combats: list[CombatResult] = []
    chosen_items = []
    level_pool = make_level_luck_pool(groups[0].level, loot_config)

    for group in groups:
        if group.level != level_pool.level:
            level_pool = make_level_luck_pool(group.level, loot_config)

        player = loadout.stats()
        current_hp = min(current_hp, player.max_hp)
        tactical = simulate_tactical_combat(
            player=player,
            current_hp=current_hp,
            group=group,
            weapon=loadout.weapon,
            config=config,
            rng=rng,
            build=build,
            action_policy=action_policy,
        )
        combats.append(tactical.as_combat_result())
        current_hp = tactical.player_hp_after

        if not tactical.won:
            return DungeonRunResult(
                won=False,
                build_name=f"{build.name}-tactical-loot",
                final_hp=0.0,
                rooms_cleared=len(combats) - 1,
                total_rooms=len(groups),
                combats=tuple(combats),
                death_room=Encounter(level=group.level, enemy=group.enemy, is_boss=group.is_boss),
                items=tuple(chosen_items),
            )

        if group.is_boss and group.level >= config.dungeon.levels:
            continue

        encounter = Encounter(level=group.level, enemy=group.enemy, is_boss=group.is_boss)
        loadout, current_hp, budget = _apply_training_gain(
            loadout,
            current_hp,
            budget,
            build,
            encounter,
            config,
            loot_config,
        )
        if config.dungeon.post_encounter_heal_fraction > 0:
            current_hp = min(
                loadout.stats().max_hp,
                current_hp + loadout.stats().max_hp * config.dungeon.post_encounter_heal_fraction,
            )
        if group.is_boss and group.level < config.dungeon.levels and config.dungeon.post_level_heal_fraction > 0:
            current_hp = min(
                loadout.stats().max_hp,
                current_hp + loadout.stats().max_hp * config.dungeon.post_level_heal_fraction,
            )

        draft = generate_loot_draft(
            level_pool,
            encounter,
            loot_config,
            rng,
        )
        chosen = (
            rng.choice(draft)
            if loot_policy == "random"
            else choose_item_by_policy(
                draft,
                build.weights,
                current_hp=current_hp,
                max_hp=loadout.stats().max_hp,
                loadout=loadout,
                allow_skip=True,
                minimum_upgrade_score=loot_config.minimum_upgrade_score,
            )
        )
        if chosen is not None:
            loadout, current_hp = apply_loot_choice(loadout, current_hp, chosen, loot_config)
            chosen_items.append(chosen)

    return DungeonRunResult(
        won=True,
        build_name=f"{build.name}-tactical-loot",
        final_hp=current_hp,
        rooms_cleared=len(groups),
        total_rooms=len(groups),
        combats=tuple(combats),
        death_room=None,
        items=tuple(chosen_items),
    )


def estimate_tactical_loot_win_rate(
    build: PlayerBuild,
    config: BalanceConfig | None = None,
    groups: tuple[EnemyGroup, ...] | None = None,
    loot_config: LootConfig | None = None,
    *,
    runs: int = 1000,
    seed: int = 0,
    action_policy: str = "skilled",
    loot_policy: str = "weighted",
) -> dict[str, float]:
    if runs <= 0:
        raise ValueError("runs must be positive")

    config = config or BalanceConfig()
    loot_config = loot_config or LootConfig()
    results = [
        simulate_tactical_dungeon_with_loot(
            build,
            config=config,
            groups=groups,
            loot_config=loot_config,
            seed=seed + index,
            action_policy=action_policy,
            loot_policy=loot_policy,
        )
        for index in range(runs)
    ]
    wins = [result for result in results if result.won]
    rooms_per_level = config.dungeon.encounters_per_level + 1
    rooms_cleared = sorted(result.rooms_cleared for result in results)

    def rate(threshold: int) -> float:
        return sum(result.rooms_cleared >= threshold for result in results) / runs

    def conditional_rate(numerator: float, denominator: float) -> float:
        return numerator / denominator if denominator > 0.0 else 0.0

    def percentile(q: float) -> float:
        index = min(runs - 1, max(0, int(runs * q) - 1))
        return float(rooms_cleared[index])

    summary = {
        "runs": float(runs),
        "win_rate": len(wins) / runs,
        "avg_rooms_cleared": mean(result.rooms_cleared for result in results),
        "avg_final_hp_on_win": mean(result.final_hp for result in wins) if wins else 0.0,
        "avg_items_chosen": mean(len(result.items) for result in results),
        "rooms_p50": percentile(0.50),
        "rooms_p75": percentile(0.75),
        "rooms_p90": percentile(0.90),
        "rooms_p95": percentile(0.95),
        "rooms_p99": percentile(0.99),
        "reach_l1_rate": 1.0,
    }
    for level in range(2, config.dungeon.levels + 1):
        entry_threshold = (level - 1) * rooms_per_level
        summary[f"reach_l{level}_rate"] = rate(entry_threshold)
    for level in range(1, config.dungeon.levels + 1):
        entry_rate = summary[f"reach_l{level}_rate"]
        boss_threshold = (level - 1) * rooms_per_level + config.dungeon.encounters_per_level
        reach_boss_rate = rate(boss_threshold)
        clear_boss_rate = rate(boss_threshold + 1)
        summary[f"reach_l{level}_boss_rate"] = reach_boss_rate
        summary[f"clear_l{level}_boss_rate"] = clear_boss_rate
        summary[f"l{level}_normal_clear_given_reached"] = conditional_rate(
            reach_boss_rate,
            entry_rate,
        )
        summary[f"l{level}_boss_clear_given_reached"] = conditional_rate(
            clear_boss_rate,
            reach_boss_rate,
        )
    return summary
