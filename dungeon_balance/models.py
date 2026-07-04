from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Mapping


@dataclass(frozen=True)
class StatLine:
    """Raw combat stats after build allocation, items, and skill modifiers."""

    max_hp: float
    strength: float
    dexterity: float

    def bounded(self) -> "StatLine":
        return StatLine(
            max_hp=max(1.0, self.max_hp),
            strength=max(0.0, self.strength),
            dexterity=max(0.0, self.dexterity),
        )


@dataclass(frozen=True)
class StatWeights:
    """Relative investment into the three primary stats."""

    hp: float
    strength: float
    dexterity: float

    def normalized(self) -> "StatWeights":
        total = self.hp + self.strength + self.dexterity
        if total <= 0:
            raise ValueError("Stat weights must have positive total weight.")
        return StatWeights(
            hp=self.hp / total,
            strength=self.strength / total,
            dexterity=self.dexterity / total,
        )

    def points(self, total_points: float) -> tuple[float, float, float]:
        weights = self.normalized()
        return (
            total_points * weights.hp,
            total_points * weights.strength,
            total_points * weights.dexterity,
        )

    def as_mapping(self) -> Mapping[str, float]:
        weights = self.normalized()
        return {
            "hp": weights.hp,
            "strength": weights.strength,
            "dexterity": weights.dexterity,
        }


@dataclass(frozen=True)
class StatConversion:
    """Converts abstract stat budget points into game-facing stat values."""

    base_hp: float = 10.0
    hp_per_point: float = 1.18
    base_strength: float = 5.0
    strength_per_point: float = 0.58
    base_dexterity: float = 5.0
    dexterity_per_point: float = 0.58

    def from_budget(self, weights: StatWeights, total_points: float) -> StatLine:
        hp_points, strength_points, dexterity_points = weights.points(total_points)
        return StatLine(
            max_hp=self.base_hp + hp_points * self.hp_per_point,
            strength=self.base_strength + strength_points * self.strength_per_point,
            dexterity=self.base_dexterity + dexterity_points * self.dexterity_per_point,
        ).bounded()


@dataclass(frozen=True)
class WeaponProfile:
    """Baseline weapon knobs. Items can be represented as alternate profiles."""

    name: str = "iron sword"
    flat_damage: float = 0.0
    damage_multiplier: float = 1.0
    attack_damage_multiplier: float = 1.0
    heavy_damage_multiplier: float = 1.0
    quick_damage_multiplier: float = 1.0
    sweep_damage_multiplier: float = 1.0
    hit_modifier: float = 0.0
    crit_modifier: float = 0.0
    crit_multiplier_modifier: float = 0.0
    dexterity_multiplier: float = 1.0
    sunder_on_hit: int = 0
    sunder_on_heavy_hit: int = 0
    sunder_bonus_per_stack: float = 0.0
    stun_on_heavy_hit_chance: float = 0.0
    damage_quality_modifier: float = 0.0
    double_strike_chance_modifier: float = 0.0
    stagger_on_hit_chance: float = 0.0
    freeze_on_hit_chance: float = 0.0
    on_hit_bonus_damage: float = 0.0
    boss_damage_multiplier: float = 1.0
    execute_damage_multiplier: float = 1.0
    execute_hp_threshold: float = 0.35
    first_strike_damage_multiplier: float = 1.0


class ItemSlot(str, Enum):
    WEAPON = "weapon"
    AMULET = "amulet"
    CHARM = "charm"
    RELIC = "relic"
    CONSUMABLE = "consumable"


class ItemRarity(str, Enum):
    COMMON = "common"
    UNCOMMON = "uncommon"
    RARE = "rare"
    VERY_RARE = "very rare"
    EPIC = "epic"
    LEGENDARY = "legendary"
    UNIQUE = "unique"


@dataclass(frozen=True)
class ItemProperty:
    """One way an item spends its total power budget."""

    property_type: str
    target: str
    power_spent: float
    value: float


@dataclass(frozen=True)
class ItemSpec:
    """Loot item offered after rooms.

    Items carry explicit stat and combat modifiers. They can represent swords,
    amulets, charms, relics, or future skill-like effects without pretending the
    player is directly investing into an abstract stat budget.
    """

    name: str
    slot: ItemSlot
    rarity: ItemRarity
    tier: int
    power_cost: float
    modifier: "StatModifier" = field(default_factory=lambda: StatModifier(name="none"))
    weapon: WeaponProfile | None = None
    properties: tuple[ItemProperty, ...] = ()
    tags: tuple[str, ...] = ()
    asset_id: str | None = None
    asset_family: str | None = None

    def score_for(self, weights: StatWeights) -> float:
        normalized = weights.normalized()
        hp_score = self.modifier.add_hp / 1.18
        strength_score = self.modifier.add_strength / 0.58
        dexterity_score = self.modifier.add_dexterity / 0.58
        score = (
            hp_score * normalized.hp
            + strength_score * normalized.strength
            + dexterity_score * normalized.dexterity
        )
        if self.weapon:
            score += (self.weapon.damage_multiplier - 1.0) * 12.0 * normalized.strength
            score += (self.weapon.heavy_damage_multiplier - 1.0) * 8.0 * normalized.strength
            score += (self.weapon.quick_damage_multiplier - 1.0) * 5.0 * normalized.dexterity
            score += (self.weapon.sweep_damage_multiplier - 1.0) * 5.0 * normalized.dexterity
            score += self.weapon.hit_modifier * 10.0 * normalized.dexterity
            score += self.weapon.crit_modifier * 8.0 * normalized.dexterity
            score += self.weapon.crit_multiplier_modifier * 5.0 * normalized.dexterity
            score += (self.weapon.dexterity_multiplier - 1.0) * 8.0 * normalized.dexterity
            score += self.weapon.sunder_on_hit * 0.35 * normalized.strength
            score += self.weapon.sunder_on_heavy_hit * 0.45 * normalized.strength
            score += self.weapon.sunder_bonus_per_stack * 8.0 * normalized.strength
            score += self.weapon.stun_on_heavy_hit_chance * 4.0 * normalized.strength
            score += self.weapon.damage_quality_modifier * 5.0 * normalized.dexterity
            score += self.weapon.double_strike_chance_modifier * 6.0 * normalized.dexterity
            score += self.weapon.stagger_on_hit_chance * 5.0 * normalized.strength
            score += self.weapon.freeze_on_hit_chance * 5.0 * normalized.dexterity
            score += self.weapon.on_hit_bonus_damage * 7.0
            score += (self.weapon.boss_damage_multiplier - 1.0) * 5.0
            score += (self.weapon.execute_damage_multiplier - 1.0) * 4.0
            score += (self.weapon.first_strike_damage_multiplier - 1.0) * 4.0
        return score


@dataclass(frozen=True)
class StatModifier:
    """Simple extension point for items, passives, blessings, and curses."""

    name: str
    add_hp: float = 0.0
    add_strength: float = 0.0
    add_dexterity: float = 0.0
    multiply_hp: float = 1.0
    multiply_strength: float = 1.0
    multiply_dexterity: float = 1.0

    def apply(self, stats: StatLine) -> StatLine:
        return StatLine(
            max_hp=(stats.max_hp + self.add_hp) * self.multiply_hp,
            strength=(stats.strength + self.add_strength) * self.multiply_strength,
            dexterity=(stats.dexterity + self.add_dexterity) * self.multiply_dexterity,
        ).bounded()


@dataclass(frozen=True)
class ClassAbility:
    id: str
    name: str
    action: str
    charges_per_combat: int
    mana_cost: int = 0
    guard_reduction: float = 0.0
    pierce_guard_reduction: float | None = None
    counter_damage_multiplier: float = 0.0
    counter_triggers: int = 0
    description: str = ""


@dataclass(frozen=True)
class PlayerBuild:
    name: str
    weights: StatWeights
    weapon: WeaponProfile = field(default_factory=WeaponProfile)
    modifiers: tuple[StatModifier, ...] = ()
    base_ability: ClassAbility | None = None
    description: str = ""

    def stats_at_budget(self, total_points: float, conversion: StatConversion) -> StatLine:
        stats = conversion.from_budget(self.weights, total_points)
        for modifier in self.modifiers:
            stats = modifier.apply(stats)
        return stats.bounded()


@dataclass(frozen=True)
class PlayerLoadout:
    """Concrete player state from chosen loot."""

    base_stats: StatLine
    weapon: WeaponProfile = field(default_factory=WeaponProfile)
    modifiers: tuple[StatModifier, ...] = ()
    items: tuple[ItemSpec, ...] = ()
    stash: tuple[ItemSpec, ...] = ()

    def stats(self) -> StatLine:
        stats = self.base_stats
        for modifier in self.modifiers:
            stats = modifier.apply(stats)
        for item in self.items:
            stats = item.modifier.apply(stats)
        stats = StatLine(
            max_hp=stats.max_hp,
            strength=stats.strength,
            dexterity=stats.dexterity * self.weapon.dexterity_multiplier,
        )
        return stats.bounded()

    def with_base_stats(self, base_stats: StatLine) -> "PlayerLoadout":
        return PlayerLoadout(
            base_stats=base_stats,
            weapon=self.weapon,
            modifiers=self.modifiers,
            items=self.items,
            stash=self.stash,
        )

    def with_item(self, item: ItemSpec) -> "PlayerLoadout":
        weapon = item.weapon or self.weapon
        return PlayerLoadout(
            base_stats=self.base_stats,
            weapon=weapon,
            modifiers=self.modifiers,
            items=self.items + (item,),
            stash=self.stash,
        )


@dataclass(frozen=True)
class EnemyStats:
    name: str
    level: int
    max_hp: float
    damage: float
    accuracy: float
    evasion: float
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class Encounter:
    level: int
    enemy: EnemyStats
    is_boss: bool = False


@dataclass(frozen=True)
class CombatProjection:
    player_dpt: float
    enemy_dpt: float
    player_hit_chance: float
    player_crit_chance: float
    player_damage_quality: float
    expected_rounds_to_kill: float
    expected_damage_taken: float
    survival_margin: float


@dataclass(frozen=True)
class CombatResult:
    won: bool
    rounds: int
    player_hp_before: float
    player_hp_after: float
    enemy_hp_after: float
    player_hits: int
    player_misses: int
    player_crits: int
    enemy_hits: int
    enemy_misses: int
    total_damage_dealt: float
    total_damage_taken: float


@dataclass(frozen=True)
class DungeonRunResult:
    won: bool
    build_name: str
    final_hp: float
    rooms_cleared: int
    total_rooms: int
    combats: tuple[CombatResult, ...]
    death_room: Encounter | None = None
    items: tuple[ItemSpec, ...] = ()
