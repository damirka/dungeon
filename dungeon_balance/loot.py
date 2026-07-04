from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from typing import Any

from .models import (
    Encounter,
    ItemProperty,
    ItemRarity,
    ItemSlot,
    ItemSpec,
    PlayerLoadout,
    StatLine,
    StatModifier,
    StatWeights,
    WeaponProfile,
)


CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "oryx_item_catalog.json"

WEAPON_FAMILY_STYLE = {
    "axe": "axe",
    "hammer": "axe",
    "mace": "axe",
    "stick": "axe",
    "cane": "axe",
    "sword": "sword",
    "saber": "sword",
    "dagger": "rapier",
    "spear": "rapier",
    "bow": "rapier",
    "crossbow": "rapier",
    "staff": "rapier",
    "wand": "rapier",
    "rod": "rapier",
}

SUPPORTED_MAPPED_WEAPON_EFFECTS = {
    "weapon_damage",
    "strength",
    "dexterity",
    "hit_chance",
    "crit_chance",
    "crit_damage",
    "damage_roll_quality",
    "double_strike",
    "stagger",
    "on_hit_burn",
    "on_hit_poison",
    "on_hit_freeze",
    "on_hit_shock",
    "boss_damage",
    "execute_damage",
    "first_strike",
    "max_hp",
}


@dataclass(frozen=True)
class MappedWeaponTemplate:
    asset_id: str
    name: str
    family: str
    style: str
    tags: tuple[str, ...]
    effects: tuple[tuple[str, float], ...]


@dataclass(frozen=True)
class LootConfig:
    """Luck-pool driven loot generation.

    Each dungeon level receives a luck pool. Every cleared encounter spends part
    of the current level pool to draft item choices. Higher floors have larger
    pools, so high-tier items become more likely later without guaranteeing a
    smooth build path.
    """

    draft_size: int = 3
    base_luck_pool: float = 9.20
    luck_pool_growth: float = 1.50
    normal_luck_share: float = 0.10
    boss_luck_share: float = 0.21
    luck_variance: float = 0.22

    common_cost: float = 1.0
    uncommon_cost: float = 1.20
    rare_cost: float = 3.00
    very_rare_cost: float = 5.20
    epic_cost: float = 7.50
    legendary_cost: float = 10.25

    lucky_option_chance: float = 0.11
    lucky_power_multiplier: float = 1.45
    jackpot_option_chance: float = 0.025
    jackpot_power_multiplier: float = 2.35
    unique_option_chance: float = 0.004
    unique_power_multiplier: float = 3.20

    focus_draft_chance: float = 0.30
    early_focus_draft_bonus: float = 0.18
    focused_stat_choice_chance: float = 0.76
    minimum_upgrade_score: float = 0.05
    training_gain_multiplier: float = 0.25

    stat_item_weight: float = 0.62
    weapon_item_weight: float = 0.38
    consumable_item_weight: float = 0.10
    potion_hp_per_power: float = 1.00
    wearable_slot_limit: int = 4
    stash_slot_limit: int = 4

    weapon_effect_uncommon_chance: float = 0.28
    weapon_effect_rare_chance: float = 0.50
    weapon_effect_epic_chance: float = 0.75
    axe_crush_effect_cost: float = 1.15
    axe_stun_effect_cost: float = 1.45

    hp_bias: float = 1.0
    strength_bias: float = 1.0
    dexterity_bias: float = 1.0


@dataclass
class LevelLuckPool:
    level: int
    remaining: float


def starting_loadout(
    base_stats: StatLine | None = None,
    weapon: WeaponProfile | None = None,
    modifiers: tuple[StatModifier, ...] = (),
) -> PlayerLoadout:
    return PlayerLoadout(
        base_stats=base_stats or StatLine(max_hp=10.0, strength=5.0, dexterity=5.0),
        weapon=weapon or WeaponProfile(),
        modifiers=modifiers,
    )


def make_level_luck_pool(level: int, config: LootConfig) -> LevelLuckPool:
    luck = config.base_luck_pool * (config.luck_pool_growth ** (level - 1))
    return LevelLuckPool(level=level, remaining=luck)


def _weighted_choice(rng: random.Random, weighted_values: tuple[tuple[str, float], ...]) -> str:
    total = sum(max(0.0, weight) for _, weight in weighted_values)
    if total <= 0:
        raise ValueError("weighted choice needs positive weight")
    roll = rng.random() * total
    cursor = 0.0
    for value, weight in weighted_values:
        cursor += max(0.0, weight)
        if roll <= cursor:
            return value
    return weighted_values[-1][0]


def _rarity_from_power(power: float, config: LootConfig) -> ItemRarity:
    if power >= config.legendary_cost:
        return ItemRarity.LEGENDARY
    if power >= config.epic_cost:
        return ItemRarity.EPIC
    if power >= config.very_rare_cost:
        return ItemRarity.VERY_RARE
    if power >= config.rare_cost:
        return ItemRarity.RARE
    if power >= config.uncommon_cost:
        return ItemRarity.UNCOMMON
    return ItemRarity.COMMON


def _tier_from_power(power: float, config: LootConfig) -> int:
    if power >= config.legendary_cost:
        return 6
    if power >= config.epic_cost:
        return 5
    if power >= config.very_rare_cost:
        return 4
    if power >= config.rare_cost:
        return 3
    if power >= config.uncommon_cost:
        return 2
    return 1


def _health_bottle(power: float, config: LootConfig, *, unique: bool = False) -> tuple[str, int, float]:
    if unique:
        return "Crimson Elixir", 6, round(config.legendary_cost * config.potion_hp_per_power)
    if power >= config.epic_cost:
        return "Crimson Elixir", 5, round(config.epic_cost * config.potion_hp_per_power)
    if power >= config.uncommon_cost:
        return "Crimson Potion", 3, round(config.rare_cost * config.potion_hp_per_power)
    return "Crimson Vial", 1, round(config.common_cost * config.potion_hp_per_power)


def _spend_luck(pool: LevelLuckPool, encounter: Encounter, config: LootConfig, rng: random.Random) -> float:
    share = config.boss_luck_share if encounter.is_boss else config.normal_luck_share
    target = config.base_luck_pool * (config.luck_pool_growth ** (encounter.level - 1)) * share
    varied = target * rng.uniform(1.0 - config.luck_variance, 1.0 + config.luck_variance)
    spend = min(pool.remaining, max(config.common_cost, varied))
    pool.remaining = max(0.0, pool.remaining - spend)
    return spend


def _roll_option_power(spend: float, config: LootConfig, rng: random.Random) -> tuple[float, bool]:
    power = spend * rng.uniform(0.72, 1.20)
    roll = rng.random()
    if roll < config.unique_option_chance:
        power *= config.unique_power_multiplier
        return max(0.75, power), True
    if roll < config.unique_option_chance + config.jackpot_option_chance:
        power *= config.jackpot_power_multiplier
    elif roll < config.unique_option_chance + config.jackpot_option_chance + config.lucky_option_chance:
        power *= config.lucky_power_multiplier
    return max(0.75, power), False


def _draft_focus(encounter: Encounter, config: LootConfig, rng: random.Random) -> str | None:
    chance = config.focus_draft_chance
    if encounter.level <= 2:
        chance += config.early_focus_draft_bonus
    if rng.random() > chance:
        return None
    return _weighted_choice(rng, (("strength", 1.0), ("dexterity", 1.0)))


def _stat_item(
    stat: str,
    power: float,
    config: LootConfig,
    rng: random.Random,
    *,
    unique: bool = False,
) -> ItemSpec:
    tier = _tier_from_power(power, config)
    rarity = ItemRarity.UNIQUE if unique else _rarity_from_power(power, config)
    stat_names = {
        "hp": ("Vital Amulet", "add_hp", 1.18, ItemSlot.AMULET),
        "strength": ("Force Ring", "add_strength", 0.58, ItemSlot.CHARM),
        "dexterity": ("Grace Relic", "add_dexterity", 0.58, ItemSlot.RELIC),
    }
    unique_names = {
        "hp": "Heartseed Amulet",
        "strength": "Titan's Knot",
        "dexterity": "Silkstep Charm",
    }
    label, field_name, conversion, slot = stat_names[stat]
    amount = conversion * power * rng.uniform(0.86, 1.14)
    kwargs = {"name": f"{rarity.value} {label}"}
    kwargs[field_name] = round(amount, 3)
    return ItemSpec(
        name=unique_names[stat] if unique else f"{label} +{tier}",
        slot=slot,
        rarity=rarity,
        tier=tier,
        power_cost=round(power, 3),
        modifier=StatModifier(**kwargs),
        properties=(
            ItemProperty(
                property_type="stat",
                target=stat,
                power_spent=round(power, 3),
                value=round(amount, 3),
            ),
        ),
        tags=(stat,),
    )


def _effect_weight(entry: dict[str, Any]) -> tuple[str, float] | None:
    effect = str(entry.get("effect", ""))
    if effect not in SUPPORTED_MAPPED_WEAPON_EFFECTS:
        return None
    try:
        weight = float(entry.get("weight", 0.0))
    except (TypeError, ValueError):
        return None
    if weight <= 0.0:
        return None
    return effect, weight


@cache
def _mapped_weapon_templates() -> tuple[MappedWeaponTemplate, ...]:
    if not CATALOG_PATH.exists():
        return ()
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    templates: list[MappedWeaponTemplate] = []
    for item in catalog.get("items", ()):
        if item.get("slot") != "weapon" or not item.get("sprite"):
            continue
        family = str(item.get("visual", {}).get("family", "weapon"))
        style = WEAPON_FAMILY_STYLE.get(family)
        if style is None:
            continue
        effects = tuple(
            effect
            for effect in (
                _effect_weight(entry) for entry in item.get("power_recipe", ())
            )
            if effect is not None
        )
        if not effects:
            continue
        templates.append(
            MappedWeaponTemplate(
                asset_id=str(item["id"]),
                name=str(item.get("name") or family.title()),
                family=family,
                style=style,
                tags=tuple(str(tag) for tag in item.get("tags", ())),
                effects=effects,
            )
        )
    return tuple(templates)


def _weapon_templates_for_style(style: str) -> tuple[MappedWeaponTemplate, ...]:
    return tuple(template for template in _mapped_weapon_templates() if template.style == style)


def _weapon_style_weights(focus: str | None) -> tuple[tuple[str, float], ...]:
    return {
        "strength": (("sword", 0.32), ("axe", 0.56), ("rapier", 0.12)),
        "dexterity": (("sword", 0.18), ("axe", 0.10), ("rapier", 0.72)),
    }.get(
        focus,
        (
            ("sword", 0.45),
            ("axe", 0.25),
            ("rapier", 0.30),
        ),
    )


def _available_weapon_styles(used_choice_keys: set[tuple[str, str]]) -> set[str]:
    used_styles = {target for kind, target in used_choice_keys if kind == "weapon"}
    mapped_styles = {template.style for template in _mapped_weapon_templates()}
    return mapped_styles - used_styles


def _available_stat_targets(used_choice_keys: set[tuple[str, str]]) -> set[str]:
    used_stats = {target for kind, target in used_choice_keys if kind == "stat"}
    return {"hp", "strength", "dexterity"} - used_stats


def _choice_identity(item: ItemSpec) -> tuple[str, str]:
    for prop in item.properties:
        if prop.property_type == "stat":
            return ("stat", prop.target)
        if prop.property_type == "restore_hp":
            return ("instant", "restore_hp")
        if prop.property_type == "weapon":
            return ("weapon", prop.target)
    if item.slot == ItemSlot.WEAPON and item.weapon:
        return ("weapon", item.weapon.name)
    return (item.slot.value, item.name)


def _choose_stat_target(
    focus: str | None,
    config: LootConfig,
    rng: random.Random,
    used_choice_keys: set[tuple[str, str]],
) -> str | None:
    available = _available_stat_targets(used_choice_keys)
    if not available:
        return None
    if focus in available and rng.random() <= config.focused_stat_choice_chance:
        return focus
    weighted = tuple(
        (stat, weight)
        for stat, weight in (
            ("hp", config.hp_bias),
            ("strength", config.strength_bias),
            ("dexterity", config.dexterity_bias),
        )
        if stat in available
    )
    return _weighted_choice(rng, weighted)


def _legacy_weapon_item(
    power: float,
    config: LootConfig,
    rng: random.Random,
    *,
    focus: str | None = None,
    unique: bool = False,
    used_choice_keys: set[tuple[str, str]] | None = None,
) -> ItemSpec:
    tier = _tier_from_power(power, config)
    rarity = ItemRarity.UNIQUE if unique else _rarity_from_power(power, config)
    used_choice_keys = used_choice_keys or set()
    available_styles = _available_weapon_styles(used_choice_keys)
    style_weights = tuple(
        (style, weight)
        for style, weight in _weapon_style_weights(focus)
        if style in available_styles
    )
    if not style_weights:
        style_weights = _weapon_style_weights(focus)
    style = _weighted_choice(
        rng,
        style_weights,
    )
    effect: str | None = None
    effect_cost = 0.0
    if style == "axe":
        effect_chance = 0.0
        if unique:
            effect_chance = 1.0
        elif power >= config.epic_cost:
            effect_chance = config.weapon_effect_epic_chance
        elif power >= config.rare_cost:
            effect_chance = config.weapon_effect_rare_chance
        elif power >= config.uncommon_cost:
            effect_chance = config.weapon_effect_uncommon_chance
        if rng.random() < effect_chance:
            effect = _weighted_choice(rng, (("crushing", 0.62), ("stunning", 0.38)))
            base_cost = (
                config.axe_crush_effect_cost
                if effect == "crushing"
                else config.axe_stun_effect_cost
            )
            effect_cost = min(max(0.0, power - 0.75), base_cost)
            if effect_cost <= 0.0:
                effect = None
    raw_power = max(0.75, power - effect_cost)
    damage_multiplier = 1.0
    attack_damage_multiplier = 1.0
    heavy_damage_multiplier = 1.0
    quick_damage_multiplier = 1.0
    sweep_damage_multiplier = 1.0
    hit_modifier = 0.0
    crit_modifier = 0.0
    crit_multiplier_modifier = 0.0
    dexterity_multiplier = 1.0
    sunder_on_hit = 0
    sunder_on_heavy_hit = 0
    sunder_bonus_per_stack = 0.0
    stun_on_heavy_hit_chance = 0.0

    if style == "sword":
        damage_multiplier += 0.018 * raw_power
        attack_damage_multiplier += 0.004 * raw_power
        heavy_damage_multiplier += 0.004 * raw_power
        quick_damage_multiplier += 0.003 * raw_power
        crit_modifier += 0.003 * raw_power
        tags = ("strength", "balanced")
        name = "Balanced Sword"
        unique_name = "First Oath"
    elif style == "axe":
        damage_multiplier += 0.018 * raw_power
        heavy_damage_multiplier += 0.040 * raw_power
        quick_damage_multiplier -= 0.012 * raw_power
        sweep_damage_multiplier -= 0.008 * raw_power
        hit_modifier -= 0.006 * raw_power
        dexterity_multiplier -= min(0.18, 0.012 * raw_power)
        tags = ("strength", "swingy")
        name = "Heavy Axe"
        unique_name = "Headsman's Promise"
        if effect == "crushing":
            sunder_on_hit = 1
            sunder_on_heavy_hit = 1
            sunder_bonus_per_stack += 0.004 * effect_cost
            tags = ("strength", "crushing", "sunder", "swingy")
            name = "Crushing Heavy Axe"
        elif effect == "stunning":
            stun_on_heavy_hit_chance = min(0.28, 0.10 + 0.04 * effect_cost)
            tags = ("strength", "stunning", "swingy")
            name = "Stunning Heavy Axe"
    else:
        damage_multiplier += 0.007 * raw_power
        heavy_damage_multiplier -= 0.010 * raw_power
        quick_damage_multiplier += 0.020 * raw_power
        sweep_damage_multiplier += 0.016 * raw_power
        hit_modifier += 0.004 * raw_power
        crit_modifier += 0.007 * raw_power
        crit_multiplier_modifier += 0.010 * raw_power
        dexterity_multiplier += min(0.10, 0.006 * raw_power)
        tags = ("dexterity", "crit")
        name = "Needle Rapier"
        unique_name = "Threadneedle"

    properties = [
        ItemProperty(
            property_type="weapon",
            target=style,
            power_spent=round(raw_power, 3),
            value=round(damage_multiplier, 4),
        )
    ]
    if effect:
        properties.append(
            ItemProperty(
                property_type="weapon_effect",
                target=effect,
                power_spent=round(effect_cost, 3),
                value=round(
                    stun_on_heavy_hit_chance
                    if effect == "stunning"
                    else sunder_bonus_per_stack,
                    4,
                ),
            )
        )

    return ItemSpec(
        name=unique_name if unique else f"{name} +{tier}",
        slot=ItemSlot.WEAPON,
        rarity=rarity,
        tier=tier,
        power_cost=round(power, 3),
        weapon=WeaponProfile(
            name=name.lower(),
            damage_multiplier=round(damage_multiplier, 4),
            attack_damage_multiplier=round(attack_damage_multiplier, 4),
            heavy_damage_multiplier=round(max(0.70, heavy_damage_multiplier), 4),
            quick_damage_multiplier=round(max(0.70, quick_damage_multiplier), 4),
            sweep_damage_multiplier=round(max(0.70, sweep_damage_multiplier), 4),
            hit_modifier=round(hit_modifier, 4),
            crit_modifier=round(crit_modifier, 4),
            crit_multiplier_modifier=round(crit_multiplier_modifier, 4),
            dexterity_multiplier=round(max(0.70, dexterity_multiplier), 4),
            sunder_on_hit=sunder_on_hit,
            sunder_on_heavy_hit=sunder_on_heavy_hit,
            sunder_bonus_per_stack=round(sunder_bonus_per_stack, 4),
            stun_on_heavy_hit_chance=round(stun_on_heavy_hit_chance, 4),
        ),
        properties=tuple(properties),
        tags=tags,
    )


def _weapon_item(
    power: float,
    config: LootConfig,
    rng: random.Random,
    *,
    focus: str | None = None,
    unique: bool = False,
    used_choice_keys: set[tuple[str, str]] | None = None,
) -> ItemSpec:
    tier = _tier_from_power(power, config)
    rarity = ItemRarity.UNIQUE if unique else _rarity_from_power(power, config)
    used_choice_keys = used_choice_keys or set()
    available_styles = _available_weapon_styles(used_choice_keys)
    style_weights = tuple(
        (style, weight)
        for style, weight in _weapon_style_weights(focus)
        if style in available_styles
    )
    if not style_weights:
        style_weights = _weapon_style_weights(focus)
    style = _weighted_choice(rng, style_weights)
    templates = _weapon_templates_for_style(style) or _mapped_weapon_templates()
    if not templates:
        raise ValueError("weapon loot requires at least one mapped weapon asset")

    template_by_id = {template.asset_id: template for template in templates}
    template_id = _weighted_choice(
        rng,
        tuple(
            (
                template.asset_id,
                1.0
                + (
                    0.45
                    if focus == "strength"
                    and any(effect in {"strength", "weapon_damage", "stagger"} for effect, _ in template.effects)
                    else 0.0
                )
                + (
                    0.45
                    if focus == "dexterity"
                    and any(effect in {"dexterity", "hit_chance", "crit_chance", "double_strike"} for effect, _ in template.effects)
                    else 0.0
                ),
            )
            for template in templates
        ),
    )
    template = template_by_id[template_id]
    raw_power = max(0.75, power)

    damage_multiplier = 1.0
    attack_damage_multiplier = 1.0
    heavy_damage_multiplier = 1.0
    quick_damage_multiplier = 1.0
    sweep_damage_multiplier = 1.0
    hit_modifier = 0.0
    crit_modifier = 0.0
    crit_multiplier_modifier = 0.0
    dexterity_multiplier = 1.0
    damage_quality_modifier = 0.0
    double_strike_chance_modifier = 0.0
    stagger_on_hit_chance = 0.0
    freeze_on_hit_chance = 0.0
    on_hit_bonus_damage = 0.0
    boss_damage_multiplier = 1.0
    execute_damage_multiplier = 1.0
    first_strike_damage_multiplier = 1.0
    add_hp = 0.0
    add_strength = 0.0
    add_dexterity = 0.0

    if style == "sword":
        damage_multiplier += 0.010 * raw_power
        attack_damage_multiplier += 0.004 * raw_power
        heavy_damage_multiplier += 0.004 * raw_power
        quick_damage_multiplier += 0.003 * raw_power
        crit_modifier += 0.003 * raw_power
    elif style == "axe":
        damage_multiplier += 0.010 * raw_power
        heavy_damage_multiplier += 0.026 * raw_power
        quick_damage_multiplier -= 0.010 * raw_power
        sweep_damage_multiplier -= 0.006 * raw_power
        hit_modifier -= 0.004 * raw_power
        dexterity_multiplier -= min(0.16, 0.010 * raw_power)
    else:
        damage_multiplier += 0.006 * raw_power
        heavy_damage_multiplier -= 0.008 * raw_power
        quick_damage_multiplier += 0.016 * raw_power
        sweep_damage_multiplier += 0.012 * raw_power
        hit_modifier += 0.004 * raw_power
        crit_modifier += 0.007 * raw_power
        crit_multiplier_modifier += 0.008 * raw_power
        dexterity_multiplier += min(0.10, 0.006 * raw_power)

    effect_properties: list[ItemProperty] = []
    for effect, weight in template.effects:
        spent = raw_power * weight
        value = 0.0
        if effect == "weapon_damage":
            value = 0.020 * spent
            damage_multiplier += value
        elif effect == "strength":
            value = 0.20 * spent
            add_strength += value
            damage_multiplier += 0.006 * spent
            heavy_damage_multiplier += 0.006 * spent
        elif effect == "dexterity":
            value = 0.20 * spent
            add_dexterity += value
            hit_modifier += 0.0025 * spent
            quick_damage_multiplier += 0.006 * spent
        elif effect == "max_hp":
            value = 0.48 * spent
            add_hp += value
        elif effect == "hit_chance":
            value = 0.008 * spent
            hit_modifier += value
        elif effect == "crit_chance":
            value = 0.008 * spent
            crit_modifier += value
        elif effect == "crit_damage":
            value = 0.012 * spent
            crit_multiplier_modifier += value
        elif effect == "damage_roll_quality":
            value = 0.012 * spent
            damage_quality_modifier += value
        elif effect == "double_strike":
            value = 0.018 * spent
            double_strike_chance_modifier += value
        elif effect == "stagger":
            value = 0.018 * spent
            stagger_on_hit_chance += value
        elif effect == "on_hit_burn":
            value = 0.014 * spent
            on_hit_bonus_damage += value
        elif effect == "on_hit_poison":
            value = 0.012 * spent
            on_hit_bonus_damage += value
        elif effect == "on_hit_shock":
            value = 0.018 * spent
            on_hit_bonus_damage += value
        elif effect == "on_hit_freeze":
            value = 0.016 * spent
            freeze_on_hit_chance += value
        elif effect == "boss_damage":
            value = 0.020 * spent
            boss_damage_multiplier += value
        elif effect == "execute_damage":
            value = 0.025 * spent
            execute_damage_multiplier += value
        elif effect == "first_strike":
            value = 0.030 * spent
            first_strike_damage_multiplier += value
        if value > 0.0:
            effect_properties.append(
                ItemProperty(
                    property_type="mapped_weapon_effect",
                    target=effect,
                    power_spent=round(spent, 3),
                    value=round(value, 4),
                )
            )

    properties = [
        ItemProperty(
            property_type="weapon",
            target=style,
            power_spent=round(raw_power, 3),
            value=round(damage_multiplier, 4),
        )
    ]
    properties.extend(effect_properties)
    tags = tuple(
        sorted(
            {
                *template.tags,
                template.family,
                style,
                f"asset:{template.asset_id}",
            }
        )
    )
    modifier = StatModifier(
        name=f"{template.name} mapped stats",
        add_hp=round(add_hp, 3),
        add_strength=round(add_strength, 3),
        add_dexterity=round(add_dexterity, 3),
    )

    return ItemSpec(
        name=template.name if unique else f"{template.name} +{tier}",
        slot=ItemSlot.WEAPON,
        rarity=rarity,
        tier=tier,
        power_cost=round(power, 3),
        modifier=modifier,
        weapon=WeaponProfile(
            name=template.name.lower(),
            damage_multiplier=round(damage_multiplier, 4),
            attack_damage_multiplier=round(attack_damage_multiplier, 4),
            heavy_damage_multiplier=round(max(0.70, heavy_damage_multiplier), 4),
            quick_damage_multiplier=round(max(0.70, quick_damage_multiplier), 4),
            sweep_damage_multiplier=round(max(0.70, sweep_damage_multiplier), 4),
            hit_modifier=round(hit_modifier, 4),
            crit_modifier=round(crit_modifier, 4),
            crit_multiplier_modifier=round(crit_multiplier_modifier, 4),
            dexterity_multiplier=round(max(0.70, dexterity_multiplier), 4),
            damage_quality_modifier=round(damage_quality_modifier, 4),
            double_strike_chance_modifier=round(double_strike_chance_modifier, 4),
            stagger_on_hit_chance=round(min(0.32, stagger_on_hit_chance), 4),
            freeze_on_hit_chance=round(min(0.32, freeze_on_hit_chance), 4),
            on_hit_bonus_damage=round(on_hit_bonus_damage, 4),
            boss_damage_multiplier=round(boss_damage_multiplier, 4),
            execute_damage_multiplier=round(execute_damage_multiplier, 4),
            first_strike_damage_multiplier=round(first_strike_damage_multiplier, 4),
        ),
        properties=tuple(properties),
        tags=tags,
        asset_id=template.asset_id,
        asset_family=template.family,
    )


def _potion_item(
    power: float,
    config: LootConfig,
    rng: random.Random,
    *,
    unique: bool = False,
) -> ItemSpec:
    rarity = ItemRarity.UNIQUE if unique else _rarity_from_power(power, config)
    name, tier, amount = _health_bottle(power, config, unique=unique)
    return ItemSpec(
        name=name,
        slot=ItemSlot.CONSUMABLE,
        rarity=rarity,
        tier=tier,
        power_cost=round(power, 3),
        properties=(
            ItemProperty(
                property_type="restore_hp",
                target="current_hp",
                power_spent=round(power, 3),
                value=round(amount, 3),
            ),
        ),
        tags=("heal", "consumable"),
    )


def generate_loot_draft(
    pool: LevelLuckPool,
    encounter: Encounter,
    config: LootConfig,
    rng: random.Random,
) -> tuple[ItemSpec, ...]:
    spend = _spend_luck(pool, encounter, config, rng)
    focus = _draft_focus(encounter, config, rng)
    draft: list[ItemSpec] = []
    used_choice_keys: set[tuple[str, str]] = set()
    for _ in range(config.draft_size):
        available_kinds: list[tuple[str, float]] = []
        if _available_stat_targets(used_choice_keys):
            available_kinds.append(("stat", config.stat_item_weight))
        if _available_weapon_styles(used_choice_keys):
            available_kinds.append(("weapon", config.weapon_item_weight))
        if ("instant", "restore_hp") not in used_choice_keys:
            available_kinds.append(("consumable", config.consumable_item_weight))
        available_kinds = [(kind, weight) for kind, weight in available_kinds if weight > 0]
        if not available_kinds:
            break

        option_power, is_unique = _roll_option_power(spend, config, rng)
        item_kind = _weighted_choice(rng, tuple(available_kinds))
        if item_kind == "weapon":
            item = _weapon_item(
                option_power,
                config,
                rng,
                focus=focus,
                unique=is_unique,
                used_choice_keys=used_choice_keys,
            )
            draft.append(item)
            used_choice_keys.add(_choice_identity(item))
            continue
        if item_kind == "consumable":
            item = _potion_item(option_power, config, rng, unique=is_unique)
            draft.append(item)
            used_choice_keys.add(_choice_identity(item))
            continue

        stat = _choose_stat_target(focus, config, rng, used_choice_keys)
        if stat is None:
            continue
        item = _stat_item(stat, option_power, config, rng, unique=is_unique)
        draft.append(item)
        used_choice_keys.add(_choice_identity(item))
    return tuple(draft)


def item_restore_hp(item: ItemSpec) -> float:
    return sum(prop.value for prop in item.properties if prop.property_type == "restore_hp")


def score_item_for_policy(
    item: ItemSpec,
    weights: StatWeights,
    *,
    current_hp: float | None = None,
    max_hp: float | None = None,
    loadout: PlayerLoadout | None = None,
) -> float:
    score = item.score_for(weights)
    restore_hp = item_restore_hp(item)
    if restore_hp <= 0:
        if loadout is None:
            return score
        replaced = _equipped_item_for_slot(loadout, item.slot)
        if replaced is None:
            return score
        return score - replaced.score_for(weights)

    normalized = weights.normalized()
    if current_hp is None or max_hp is None:
        effective_restore = restore_hp * 0.5
        missing_ratio = 0.5
    else:
        missing = max(0.0, max_hp - current_hp)
        effective_restore = min(missing, restore_hp)
        missing_ratio = missing / max(max_hp, 1.0)
    if effective_restore <= 0:
        return score

    urgency = 1.0 + min(1.0, missing_ratio) * 0.65
    return score + (effective_restore / 1.18) * normalized.hp * urgency


def choose_item_by_policy(
    draft: tuple[ItemSpec, ...],
    weights: StatWeights,
    *,
    current_hp: float | None = None,
    max_hp: float | None = None,
    loadout: PlayerLoadout | None = None,
    allow_skip: bool = False,
    minimum_upgrade_score: float | None = None,
) -> ItemSpec | None:
    if not draft:
        raise ValueError("cannot choose from an empty draft")
    scored = tuple(
        (
            item,
            score_item_for_policy(
                item,
                weights,
                current_hp=current_hp,
                max_hp=max_hp,
                loadout=loadout,
            ),
        )
        for item in draft
    )
    chosen, score = max(
        scored,
        key=lambda scored_item: scored_item[1],
    )
    if allow_skip:
        threshold = LootConfig().minimum_upgrade_score if minimum_upgrade_score is None else minimum_upgrade_score
        if score <= threshold:
            return None
    return chosen


def _item_storage_score(item: ItemSpec) -> float:
    rarity_bonus = {
        ItemRarity.COMMON: 0.0,
        ItemRarity.UNCOMMON: 0.10,
        ItemRarity.RARE: 0.25,
        ItemRarity.VERY_RARE: 0.40,
        ItemRarity.EPIC: 0.60,
        ItemRarity.LEGENDARY: 0.90,
        ItemRarity.UNIQUE: 1.15,
    }[item.rarity]
    return item.power_cost + rarity_bonus


def _trim_stash(items: tuple[ItemSpec, ...], limit: int) -> tuple[ItemSpec, ...]:
    if limit <= 0:
        return ()
    return tuple(sorted(items, key=_item_storage_score, reverse=True)[:limit])


def _equipped_weapon(items: tuple[ItemSpec, ...]) -> ItemSpec | None:
    return next((item for item in items if item.slot == ItemSlot.WEAPON and item.weapon), None)


def _equipped_item_for_slot(loadout: PlayerLoadout, slot: ItemSlot) -> ItemSpec | None:
    return next((item for item in loadout.items if item.slot == slot), None)


def _equip_wearable_item(loadout: PlayerLoadout, item: ItemSpec, config: LootConfig) -> PlayerLoadout:
    active = list(loadout.items)
    stash = list(loadout.stash)

    replaced_items = [active_item for active_item in active if active_item.slot == item.slot]
    active = [active_item for active_item in active if active_item.slot != item.slot]
    stash.extend(replaced_items)
    active.append(item)

    while len(active) > config.wearable_slot_limit:
        candidates = [active_item for active_item in active if active_item is not item]
        if item.slot != ItemSlot.WEAPON:
            non_weapon_candidates = [
                active_item for active_item in candidates if active_item.slot != ItemSlot.WEAPON
            ]
            if non_weapon_candidates:
                candidates = non_weapon_candidates
        if not candidates:
            candidates = active
        dropped = min(candidates, key=_item_storage_score)
        active.remove(dropped)
        stash.append(dropped)

    active_items = tuple(active)
    active_weapon = _equipped_weapon(active_items)
    return PlayerLoadout(
        base_stats=loadout.base_stats,
        weapon=active_weapon.weapon if active_weapon else loadout.weapon,
        modifiers=loadout.modifiers,
        items=active_items,
        stash=_trim_stash(tuple(stash), config.stash_slot_limit),
    )


def apply_item_with_hp_gain(
    loadout: PlayerLoadout,
    current_hp: float,
    item: ItemSpec,
    config: LootConfig | None = None,
) -> tuple[PlayerLoadout, float]:
    config = config or LootConfig()
    old_max_hp = loadout.stats().max_hp
    updated = _equip_wearable_item(loadout, item, config)
    new_max_hp = updated.stats().max_hp
    hp_gain = max(0.0, new_max_hp - old_max_hp)
    return updated, min(new_max_hp, current_hp + hp_gain)


def apply_loot_choice(
    loadout: PlayerLoadout,
    current_hp: float,
    item: ItemSpec,
    config: LootConfig | None = None,
) -> tuple[PlayerLoadout, float]:
    restore_hp = item_restore_hp(item)
    if restore_hp > 0:
        max_hp = loadout.stats().max_hp
        return loadout, min(max_hp, current_hp + restore_hp)
    return apply_item_with_hp_gain(loadout, current_hp, item, config)
