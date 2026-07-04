"""Core balance formulas and simulation helpers for a dungeon crawler."""

from .archetypes import DEFAULT_BUILDS, build_by_name
from .characters import CHARACTER_ROSTER, DEFAULT_CHARACTER, CharacterSpec, character_by_id
from .config import BalanceConfig, CombatConfig, DungeonConfig, TacticalConfig
from .enemies import EnemyCurve, build_default_dungeon, build_randomized_dungeon
from .formulas import (
    expected_enemy_damage_per_turn,
    expected_player_damage_per_turn,
    project_combat,
    stat_balance_factor,
)
from .loot import LootConfig, apply_loot_choice, generate_loot_draft, item_restore_hp, make_level_luck_pool
from .models import (
    EnemyStats,
    Encounter,
    ItemProperty,
    ItemRarity,
    ItemSlot,
    ItemSpec,
    PlayerBuild,
    PlayerLoadout,
    StatLine,
    StatWeights,
    WeaponProfile,
)
from .simulator import (
    estimate_loot_win_rate,
    estimate_win_rate,
    simulate_combat,
    simulate_dungeon,
    simulate_dungeon_with_loot,
)
from .tactical import (
    EnemyGroup,
    EnemyIntent,
    PlayerAction,
    TacticalCombatResult,
    build_randomized_tactical_dungeon,
    build_tactical_dungeon,
    estimate_tactical_loot_win_rate,
    simulate_tactical_combat,
    simulate_tactical_dungeon_with_loot,
)

__all__ = [
    "BalanceConfig",
    "CHARACTER_ROSTER",
    "CombatConfig",
    "CharacterSpec",
    "DEFAULT_CHARACTER",
    "DEFAULT_BUILDS",
    "DungeonConfig",
    "EnemyCurve",
    "EnemyGroup",
    "EnemyIntent",
    "EnemyStats",
    "Encounter",
    "ItemProperty",
    "ItemRarity",
    "ItemSlot",
    "ItemSpec",
    "LootConfig",
    "PlayerBuild",
    "PlayerAction",
    "PlayerLoadout",
    "StatLine",
    "StatWeights",
    "TacticalCombatResult",
    "TacticalConfig",
    "WeaponProfile",
    "apply_loot_choice",
    "build_by_name",
    "character_by_id",
    "build_default_dungeon",
    "build_randomized_dungeon",
    "build_randomized_tactical_dungeon",
    "build_tactical_dungeon",
    "estimate_loot_win_rate",
    "estimate_tactical_loot_win_rate",
    "estimate_win_rate",
    "expected_enemy_damage_per_turn",
    "expected_player_damage_per_turn",
    "generate_loot_draft",
    "item_restore_hp",
    "make_level_luck_pool",
    "project_combat",
    "simulate_combat",
    "simulate_dungeon",
    "simulate_dungeon_with_loot",
    "simulate_tactical_combat",
    "simulate_tactical_dungeon_with_loot",
    "stat_balance_factor",
]
