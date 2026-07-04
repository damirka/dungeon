from __future__ import annotations

from dataclasses import dataclass

from .archetypes import build_by_name
from .models import PlayerBuild


@dataclass(frozen=True)
class CharacterSpec:
    """Game-facing character metadata.

    The simulator still uses PlayerBuild internally, but the playable game
    should expose rescued/unlocked characters rather than abstract stat builds.
    """

    id: str
    name: str
    build_name: str
    starting_weapon: str
    base_ability_id: str
    base_ability_name: str
    unlocked: bool
    unlock_hint: str
    description: str

    def build(self) -> PlayerBuild:
        return build_by_name(self.build_name)


CHARACTER_ROSTER: tuple[CharacterSpec, ...] = (
    CharacterSpec(
        id="balanced-swordsman",
        name="Balanced Swordsman",
        build_name="balanced",
        starting_weapon="Iron Sword",
        base_ability_id="riposte",
        base_ability_name="Riposte",
        unlocked=True,
        unlock_hint="Available from the start.",
        description="The reference adventurer: even growth, Iron Sword, and a counter stance.",
    ),
    CharacterSpec(
        id="axe-bruiser",
        name="Axe Bruiser",
        build_name="strength-dominant",
        starting_weapon="Heavy Axe",
        base_ability_id="breaker-roar",
        base_ability_name="Breaker Roar",
        unlocked=False,
        unlock_hint="Rescue the forge prisoner after the level 2 boss.",
        description="Strength-leaning fighter with slower, heavier weapon identity.",
    ),
    CharacterSpec(
        id="needle-duelist",
        name="Needle Duelist",
        build_name="dex-dominant",
        starting_weapon="Needle Rapier",
        base_ability_id="quickstep",
        base_ability_name="Quickstep",
        unlocked=False,
        unlock_hint="Find the duelist in an evasive enemy biome.",
        description="Reliability and crit tempo, paid for with lower bulk.",
    ),
    CharacterSpec(
        id="warder",
        name="Warder",
        build_name="hp-dominant",
        starting_weapon="Iron Sword",
        base_ability_id="stone-vow",
        base_ability_name="Stone Vow",
        unlocked=False,
        unlock_hint="Survive a boss while critically wounded.",
        description="Defensive character for players who want a wider HP buffer.",
    ),
)


DEFAULT_CHARACTER = CHARACTER_ROSTER[0]


def character_by_id(character_id: str) -> CharacterSpec:
    for character in CHARACTER_ROSTER:
        if character.id == character_id:
            return character
    valid = ", ".join(character.id for character in CHARACTER_ROSTER)
    raise KeyError(f"Unknown character {character_id!r}. Valid characters: {valid}")
