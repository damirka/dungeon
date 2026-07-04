from __future__ import annotations

import random
from dataclasses import dataclass, field

from .config import DungeonConfig
from .formulas import clamp
from .models import Encounter, EnemyStats


@dataclass(frozen=True)
class EnemyArchetype:
    name: str
    hp_factor: float = 1.0
    damage_factor: float = 1.0
    accuracy_delta: float = 0.0
    evasion_factor: float = 1.0
    tags: tuple[str, ...] = ()


def default_archetypes() -> dict[str, EnemyArchetype]:
    return {
        "raider": EnemyArchetype(
            name="Raider",
            hp_factor=1.00,
            damage_factor=1.00,
            accuracy_delta=0.00,
            evasion_factor=1.00,
            tags=("baseline",),
        ),
        "brute": EnemyArchetype(
            name="Brute",
            hp_factor=1.35,
            damage_factor=1.18,
            accuracy_delta=-0.04,
            evasion_factor=0.72,
            tags=("hp-check",),
        ),
        "duelist": EnemyArchetype(
            name="Duelist",
            hp_factor=0.86,
            damage_factor=0.96,
            accuracy_delta=0.08,
            evasion_factor=1.45,
            tags=("dex-check",),
        ),
        "stalker": EnemyArchetype(
            name="Stalker",
            hp_factor=0.92,
            damage_factor=1.28,
            accuracy_delta=0.04,
            evasion_factor=1.20,
            tags=("burst-check",),
        ),
    }


@dataclass(frozen=True)
class EnemyCurve:
    """Exponential dungeon pressure curve."""

    base_hp: float = 8.9
    hp_growth: float = 1.132

    base_damage: float = 0.58
    damage_growth: float = 1.170

    base_accuracy: float = 0.64
    accuracy_growth_per_level: float = 0.020

    base_evasion: float = 3.7
    evasion_growth: float = 1.09

    boss_hp_multiplier: float = 3.55
    boss_damage_multiplier: float = 2.35
    boss_accuracy_bonus: float = 0.07
    boss_evasion_multiplier: float = 1.11

    archetypes: dict[str, EnemyArchetype] = field(default_factory=default_archetypes)
    encounter_order: tuple[str, ...] = ("raider", "brute", "duelist", "stalker")
    boss_order: tuple[str, ...] = ("raider", "duelist", "stalker", "brute", "stalker")


def make_enemy(
    level: int,
    archetype_key: str,
    curve: EnemyCurve,
    *,
    is_boss: bool = False,
) -> EnemyStats:
    if archetype_key not in curve.archetypes:
        raise KeyError(f"Unknown enemy archetype: {archetype_key}")

    archetype = curve.archetypes[archetype_key]
    level_index = level - 1

    max_hp = curve.base_hp * (curve.hp_growth**level_index) * archetype.hp_factor
    damage = curve.base_damage * (curve.damage_growth**level_index) * archetype.damage_factor
    accuracy = (
        curve.base_accuracy
        + curve.accuracy_growth_per_level * level_index
        + archetype.accuracy_delta
    )
    evasion = curve.base_evasion * (curve.evasion_growth**level_index) * archetype.evasion_factor

    tags = archetype.tags
    name = f"L{level} {archetype.name}"

    if is_boss:
        max_hp *= curve.boss_hp_multiplier
        damage *= curve.boss_damage_multiplier
        accuracy += curve.boss_accuracy_bonus
        evasion *= curve.boss_evasion_multiplier
        tags = tags + ("boss",)
        name = f"L{level} Boss {archetype.name}"

    return EnemyStats(
        name=name,
        level=level,
        max_hp=round(max_hp, 2),
        damage=round(damage, 2),
        accuracy=clamp(accuracy, 0.35, 0.92),
        evasion=round(evasion, 2),
        tags=tags,
    )


def boss_archetype_key(level: int, curve: EnemyCurve | None = None) -> str:
    curve = curve or EnemyCurve()
    if not curve.boss_order:
        raise ValueError("EnemyCurve.boss_order must contain at least one archetype")
    return curve.boss_order[(level - 1) % len(curve.boss_order)]


def build_default_dungeon(
    config: DungeonConfig | None = None,
    curve: EnemyCurve | None = None,
) -> tuple[Encounter, ...]:
    config = config or DungeonConfig()
    curve = curve or EnemyCurve()
    encounters: list[Encounter] = []
    order = curve.encounter_order

    for level in range(1, config.levels + 1):
        for slot in range(config.encounters_per_level):
            key = order[(level + slot - 1) % len(order)]
            encounters.append(
                Encounter(level=level, enemy=make_enemy(level, key, curve), is_boss=False)
            )

        boss_key = boss_archetype_key(level, curve)
        encounters.append(
            Encounter(level=level, enemy=make_enemy(level, boss_key, curve, is_boss=True), is_boss=True)
        )

    return tuple(encounters)


def _random_encounter_keys(
    config: DungeonConfig,
    curve: EnemyCurve,
    level: int,
    rng: random.Random,
) -> list[str]:
    keys = list(curve.encounter_order)
    if not keys:
        raise ValueError("EnemyCurve.encounter_order must contain at least one archetype")

    bag = keys[:config.encounters_per_level]
    while len(bag) < config.encounters_per_level:
        bag.append(_weighted_archetype_key(keys, level, rng))

    rng.shuffle(bag)

    # Keep the very first room from becoming an immediate worst-case spike.
    if level == 1:
        gentle = [key for key in ("raider", "duelist") if key in bag]
        if gentle and bag[0] not in gentle:
            swap_index = bag.index(rng.choice(gentle))
            bag[0], bag[swap_index] = bag[swap_index], bag[0]

    return bag


def _weighted_archetype_key(
    keys: list[str] | tuple[str, ...],
    level: int,
    rng: random.Random,
    *,
    boss: bool = False,
) -> str:
    normal_weights = {
        "raider": max(0.70, 1.10 - 0.08 * (level - 1)),
        "brute": 1.05 + 0.04 * (level - 1),
        "duelist": 1.00,
        "stalker": 1.00 + 0.03 * (level - 1),
    }
    boss_weights = {
        "raider": 0.10,
        "brute": 0.34,
        "duelist": 0.22,
        "stalker": 0.34,
    }
    weights_by_key = boss_weights if boss else normal_weights
    weights = [weights_by_key.get(key, 1.0) for key in keys]
    return rng.choices(tuple(keys), weights=tuple(weights), k=1)[0]


def build_randomized_dungeon(
    config: DungeonConfig | None = None,
    curve: EnemyCurve | None = None,
    rng: random.Random | None = None,
) -> tuple[Encounter, ...]:
    """Build a fresh level-structured dungeon while preserving boss gates.

    The deterministic default dungeon is still useful for regression tests and
    curve snapshots. Playable runs should use this generator so encounter order
    is not a memorized script.
    """

    config = config or DungeonConfig()
    curve = curve or EnemyCurve()
    rng = rng or random.Random()
    encounters: list[Encounter] = []
    order = tuple(curve.encounter_order)
    if not order:
        raise ValueError("EnemyCurve.encounter_order must contain at least one archetype")

    for level in range(1, config.levels + 1):
        for key in _random_encounter_keys(config, curve, level, rng):
            encounters.append(
                Encounter(level=level, enemy=make_enemy(level, key, curve), is_boss=False)
            )

        boss_key = boss_archetype_key(level, curve)
        encounters.append(
            Encounter(level=level, enemy=make_enemy(level, boss_key, curve, is_boss=True), is_boss=True)
        )

    return tuple(encounters)
