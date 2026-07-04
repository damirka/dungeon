from __future__ import annotations

from .models import ClassAbility, PlayerBuild, StatWeights, WeaponProfile


KNIGHTS_RIPOSTE = ClassAbility(
    id="riposte",
    name="Riposte",
    action="ability",
    charges_per_combat=1,
    mana_cost=2,
    guard_reduction=0.40,
    pierce_guard_reduction=0.22,
    counter_damage_multiplier=0.82,
    counter_triggers=1,
    description="Spend 2 MP to brace and counter the first enemy that hits this round.",
)


DEFAULT_BUILDS: tuple[PlayerBuild, ...] = (
    PlayerBuild(
        name="balanced",
        weights=StatWeights(hp=1.0, strength=1.0, dexterity=1.0),
        base_ability=KNIGHTS_RIPOSTE,
        description="Even investment. Most stable, least spiky.",
    ),
    PlayerBuild(
        name="survivor",
        weights=StatWeights(hp=0.45, strength=0.45, dexterity=0.10),
        description="High-skill no-heal policy: enough HP, fast kills, minimal dexterity.",
    ),
    PlayerBuild(
        name="strength-dominant",
        weights=StatWeights(hp=0.30, strength=0.45, dexterity=0.25),
        description="Balanced shell with strength as the dominant stat.",
    ),
    PlayerBuild(
        name="hp-dominant",
        weights=StatWeights(hp=0.45, strength=0.30, dexterity=0.25),
        description="Balanced shell with HP as the dominant stat.",
    ),
    PlayerBuild(
        name="dex-dominant",
        weights=StatWeights(hp=0.30, strength=0.25, dexterity=0.45),
        description="Balanced shell with dexterity as the dominant stat.",
    ),
    PlayerBuild(
        name="glass-cannon",
        weights=StatWeights(hp=0.16, strength=0.63, dexterity=0.21),
        weapon=WeaponProfile(name="heavy axe", damage_multiplier=1.08, hit_modifier=-0.04),
        description="Very high damage, thin HP, slightly unreliable weapon.",
    ),
    PlayerBuild(
        name="stonewall",
        weights=StatWeights(hp=0.65, strength=0.20, dexterity=0.15),
        description="Huge HP pool, slow kill speed, weak crit profile.",
    ),
    PlayerBuild(
        name="ace-duelist",
        weights=StatWeights(hp=0.20, strength=0.30, dexterity=0.50),
        weapon=WeaponProfile(name="rapier", damage_multiplier=0.98, hit_modifier=0.03, crit_modifier=0.05),
        description="High reliability and crits, but lower base damage and HP.",
    ),
)


def build_by_name(name: str) -> PlayerBuild:
    for build in DEFAULT_BUILDS:
        if build.name == name:
            return build
    valid = ", ".join(build.name for build in DEFAULT_BUILDS)
    raise KeyError(f"Unknown build {name!r}. Valid builds: {valid}")
