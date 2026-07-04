from __future__ import annotations

import argparse
import colorsys
import json
import struct
import zlib
from collections import Counter
from pathlib import Path
from typing import Any


TILE_SIZE = 16
ITEM_ROWS = range(1, 15)
ITEM_COLS = range(1, 23)


EFFECT_PRIMITIVES: dict[str, dict[str, str]] = {
    "max_hp": {
        "status": "live",
        "meaning": "Raises maximum HP. This is not direct healing.",
        "scaling": "roughly +1.18 max HP per power",
    },
    "strength": {
        "status": "live",
        "meaning": "Raises base damage.",
        "scaling": "roughly +0.58 STR per power",
    },
    "dexterity": {
        "status": "live",
        "meaning": "Raises hit reliability, crit odds, enemy dodge pressure, and damage-roll quality.",
        "scaling": "roughly +0.58 DEX per power",
    },
    "damage_roll_quality": {
        "status": "live",
        "meaning": "Biases successful hits toward the high end of the damage variance range.",
        "scaling": "small roll-quality increase per power",
    },
    "weapon_damage": {
        "status": "live",
        "meaning": "Multiplies weapon damage.",
        "scaling": "small multiplier per power",
    },
    "hit_chance": {
        "status": "live",
        "meaning": "Adds accuracy without changing STR.",
        "scaling": "small additive hit chance per power",
    },
    "crit_chance": {
        "status": "live",
        "meaning": "Adds crit chance.",
        "scaling": "small additive crit chance per power",
    },
    "crit_damage": {
        "status": "live",
        "meaning": "Raises crit multiplier.",
        "scaling": "small multiplier bonus per power",
    },
    "guard_first_hit": {
        "status": "planned",
        "meaning": "Reduces the first incoming hit in each combat.",
        "scaling": "flat reduction or percent reduction per power",
    },
    "armor_flat_reduction": {
        "status": "planned",
        "meaning": "Reduces every incoming hit by a small flat amount.",
        "scaling": "flat reduction per power",
    },
    "first_strike": {
        "status": "planned",
        "meaning": "Front-loads damage in round one.",
        "scaling": "bonus opening damage per power",
    },
    "initiative": {
        "status": "planned",
        "meaning": "Chance to act before the normal player turn timing or deny an enemy opener.",
        "scaling": "initiative chance per power",
    },
    "double_strike": {
        "status": "planned",
        "meaning": "Chance for a second player strike in the same round.",
        "scaling": "extra-strike chance per power",
    },
    "execute_damage": {
        "status": "planned",
        "meaning": "Adds damage against low-HP enemies.",
        "scaling": "bonus damage threshold or multiplier per power",
    },
    "boss_damage": {
        "status": "planned",
        "meaning": "Adds damage against bosses.",
        "scaling": "boss-only multiplier per power",
    },
    "stagger": {
        "status": "planned",
        "meaning": "Small chance to delay or weaken the enemy's next hit.",
        "scaling": "chance or magnitude per power",
    },
    "on_hit_burn": {
        "status": "planned",
        "meaning": "Damage-over-time fire package.",
        "scaling": "DOT damage per power",
    },
    "on_hit_poison": {
        "status": "planned",
        "meaning": "Stacking poison package.",
        "scaling": "stack damage per power",
    },
    "on_hit_freeze": {
        "status": "planned",
        "meaning": "Slows or reduces enemy accuracy.",
        "scaling": "chance or debuff amount per power",
    },
    "on_hit_shock": {
        "status": "planned",
        "meaning": "Swingy burst package.",
        "scaling": "burst chance or burst damage per power",
    },
    "curse_power": {
        "status": "planned",
        "meaning": "Extra item power bought with a downside.",
        "scaling": "bonus budget plus explicit tradeoff",
    },
    "luck_pool_bonus": {
        "status": "planned",
        "meaning": "Adds or preserves luck pool for later drops.",
        "scaling": "luck points per power",
    },
    "reroll_token": {
        "status": "planned",
        "meaning": "Adds a future loot reroll resource.",
        "scaling": "reroll chance or fractional reroll per power",
    },
    "merchant_discount": {
        "status": "planned",
        "meaning": "Improves future merchant prices.",
        "scaling": "discount percent per power",
    },
}


COLOR_ADJECTIVES = {
    "black": "Onyx",
    "gray": "Iron",
    "silver": "Silver",
    "white": "Ivory",
    "red": "Crimson",
    "orange": "Amber",
    "gold": "Golden",
    "yellow": "Sunlit",
    "green": "Viridian",
    "teal": "Jade",
    "cyan": "Azure",
    "blue": "Sapphire",
    "violet": "Violet",
    "purple": "Amethyst",
    "pink": "Rose",
    "brown": "Umber",
}


COLOR_EFFECTS = {
    "black": (("curse_power", 0.55), ("crit_damage", 0.45)),
    "gray": (("armor_flat_reduction", 0.6), ("hit_chance", 0.4)),
    "silver": (("hit_chance", 0.55), ("crit_chance", 0.45)),
    "white": (("guard_first_hit", 0.55), ("max_hp", 0.45)),
    "red": (("strength", 0.6), ("on_hit_burn", 0.4)),
    "orange": (("strength", 0.55), ("execute_damage", 0.45)),
    "gold": (("luck_pool_bonus", 0.5), ("boss_damage", 0.5)),
    "yellow": (("luck_pool_bonus", 0.5), ("on_hit_shock", 0.5)),
    "green": (("dexterity", 0.35), ("damage_roll_quality", 0.25), ("on_hit_poison", 0.4)),
    "teal": (("dexterity", 0.35), ("initiative", 0.25), ("guard_first_hit", 0.4)),
    "cyan": (("hit_chance", 0.5), ("on_hit_freeze", 0.5)),
    "blue": (("guard_first_hit", 0.5), ("on_hit_freeze", 0.5)),
    "violet": (("crit_chance", 0.55), ("curse_power", 0.45)),
    "purple": (("crit_damage", 0.55), ("curse_power", 0.45)),
    "pink": (("crit_chance", 0.55), ("max_hp", 0.45)),
    "brown": (("max_hp", 0.5), ("stagger", 0.5)),
}


FAMILY_NOUNS = {
    "vial": "Vial",
    "round_potion": "Potion",
    "elixir": "Elixir",
    "volatile_orb": "Volatile Orb",
    "ring": "Ring",
    "crystal": "Crystal",
    "cut_gem": "Gem",
    "teardrop_gem": "Tear",
    "book": "Book",
    "scroll": "Scroll",
    "component": "Component",
    "rune": "Rune",
    "heart_charm": "Heart Charm",
    "orb": "Orb",
    "food": "Provision",
    "key_charm": "Key Charm",
    "coin": "Coin",
    "supply": "Supply",
    "herb": "Herb",
    "helmet": "Helmet",
    "pack": "Pack",
    "garment": "Garb",
    "wand": "Wand",
    "staff": "Staff",
    "rod": "Rod",
    "mace": "Mace",
    "spear": "Spear",
    "sword": "Sword",
    "dagger": "Dagger",
    "axe": "Axe",
    "shield": "Shield",
    "boots": "Boots",
    "amulet": "Amulet",
    "robe": "Robe",
    "hood": "Hood",
    "armor": "Armor",
    "cloak": "Cloak",
}


FAMILY_SLOTS = {
    "vial": "consumable",
    "round_potion": "consumable",
    "elixir": "consumable",
    "volatile_orb": "relic",
    "ring": "ring",
    "crystal": "material",
    "cut_gem": "material",
    "teardrop_gem": "material",
    "book": "relic",
    "scroll": "scroll",
    "component": "material",
    "rune": "rune",
    "heart_charm": "charm",
    "orb": "relic",
    "food": "supply",
    "key_charm": "charm",
    "coin": "currency",
    "supply": "supply",
    "herb": "material",
    "helmet": "helmet",
    "pack": "pack",
    "garment": "body",
    "wand": "weapon",
    "staff": "weapon",
    "rod": "weapon",
    "mace": "weapon",
    "spear": "weapon",
    "sword": "weapon",
    "dagger": "weapon",
    "axe": "weapon",
    "shield": "shield",
    "boots": "boots",
    "amulet": "amulet",
    "robe": "body",
    "hood": "helmet",
    "armor": "body",
    "cloak": "cloak",
}


RARITY_BANDS = {
    "consumable": ["common", "uncommon"],
    "currency": ["common", "uncommon", "rare"],
    "material": ["common", "uncommon", "rare"],
    "supply": ["common", "uncommon"],
    "scroll": ["uncommon", "rare"],
    "rune": ["uncommon", "rare", "epic"],
    "ring": ["uncommon", "rare", "epic"],
    "amulet": ["uncommon", "rare", "epic"],
    "charm": ["uncommon", "rare"],
    "relic": ["rare", "epic"],
    "weapon": ["common", "uncommon", "rare", "epic"],
    "shield": ["common", "uncommon", "rare"],
    "body": ["common", "uncommon", "rare"],
    "helmet": ["common", "uncommon", "rare"],
    "boots": ["common", "uncommon", "rare"],
    "cloak": ["uncommon", "rare", "epic"],
    "pack": ["common", "uncommon"],
}


def read_rgba_png(path: Path) -> tuple[int, int, list[bytes]]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")

    pos = 8
    width = height = bit_depth = color_type = interlace = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        payload = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IDAT":
            idat += payload
        elif kind == b"IEND":
            break

    if (bit_depth, color_type, interlace) != (8, 6, 0):
        raise ValueError("expected a non-interlaced 8-bit RGBA PNG")

    raw = zlib.decompress(idat)
    bpp = 4
    stride = width * bpp
    rows: list[bytes] = []
    previous = bytearray(stride)
    offset = 0

    for _ in range(height):
        filter_type = raw[offset]
        offset += 1
        scan = bytearray(raw[offset : offset + stride])
        offset += stride
        reconstructed = bytearray(stride)
        for x in range(stride):
            left = reconstructed[x - bpp] if x >= bpp else 0
            up = previous[x]
            up_left = previous[x - bpp] if x >= bpp else 0
            if filter_type == 0:
                value = scan[x]
            elif filter_type == 1:
                value = (scan[x] + left) & 255
            elif filter_type == 2:
                value = (scan[x] + up) & 255
            elif filter_type == 3:
                value = (scan[x] + ((left + up) // 2)) & 255
            elif filter_type == 4:
                predictor = left + up - up_left
                pa = abs(predictor - left)
                pb = abs(predictor - up)
                pc = abs(predictor - up_left)
                prior = left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                value = (scan[x] + prior) & 255
            else:
                raise ValueError(f"unknown PNG filter {filter_type}")
            reconstructed[x] = value
        rows.append(bytes(reconstructed))
        previous = reconstructed

    return width, height, rows


def tile_pixels(rows: list[bytes], tile_col: int, tile_row: int) -> list[tuple[int, int, int, int]]:
    pixels = []
    x0 = tile_col * TILE_SIZE
    y0 = tile_row * TILE_SIZE
    for y in range(y0, y0 + TILE_SIZE):
        row = rows[y]
        for x in range(x0, x0 + TILE_SIZE):
            start = x * 4
            pixels.append(tuple(row[start : start + 4]))
    return pixels


def classify_color(pixels: list[tuple[int, int, int, int]]) -> tuple[str, str]:
    visible = [(r, g, b, a) for r, g, b, a in pixels if a > 0]
    saturated = []
    for r, g, b, _ in visible:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if v > 0.15:
            saturated.append((r, g, b, max(0.15, s) * max(0.2, v)))
    source = saturated or [(r, g, b, 1.0) for r, g, b, _ in visible]
    total = sum(weight for _, _, _, weight in source) or 1.0
    r = sum(red * weight for red, _, _, weight in source) / total
    g = sum(green * weight for _, green, _, weight in source) / total
    b = sum(blue * weight for _, _, blue, weight in source) / total
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    hue = h * 360
    hex_color = f"#{int(r):02x}{int(g):02x}{int(b):02x}"

    if v < 0.20:
        return "black", hex_color
    if s < 0.18:
        if v > 0.78:
            return "white", hex_color
        if v > 0.48:
            return "silver", hex_color
        return "gray", hex_color
    if 20 <= hue < 42:
        return "orange", hex_color
    if 42 <= hue < 56:
        return "gold", hex_color
    if 56 <= hue < 75:
        return "yellow", hex_color
    if 75 <= hue < 155:
        return "green", hex_color
    if 155 <= hue < 178:
        return "teal", hex_color
    if 178 <= hue < 205:
        return "cyan", hex_color
    if 205 <= hue < 248:
        return "blue", hex_color
    if 248 <= hue < 280:
        return "violet", hex_color
    if 280 <= hue < 328:
        return "purple", hex_color
    if 328 <= hue < 345:
        return "pink", hex_color
    if hue >= 345 or hue < 12:
        return "red", hex_color
    return "brown", hex_color


def family_for(tile_col: int, tile_row: int) -> str:
    row = tile_row
    col = tile_col
    if row == 1:
        return "vial" if col <= 6 else "round_potion" if col <= 12 else "elixir" if col <= 18 else "volatile_orb"
    if row == 2:
        return "ring" if col <= 6 else "crystal" if col <= 13 else "cut_gem" if col <= 17 else "teardrop_gem"
    if row == 3:
        return "book" if col <= 6 else "component" if col <= 12 else "rune" if col <= 19 else "heart_charm"
    if row == 4:
        return "orb" if col <= 6 else "food" if col <= 12 else "key_charm" if col <= 18 else "heart_charm"
    if row == 5:
        return "orb" if col <= 5 else "supply" if col <= 13 else "herb" if col <= 18 else "coin"
    if row == 6:
        return "helmet" if col <= 6 else "pack" if col <= 13 else "garment" if col <= 18 else "coin"
    if row == 7:
        return "wand" if col <= 8 else "staff" if col <= 14 else "rod"
    if row == 8:
        return "staff" if col <= 8 else "rod" if col <= 14 else "wand"
    if row == 9:
        return "mace" if col <= 6 else "spear" if col <= 14 else "sword"
    if row == 10:
        return "dagger" if col <= 8 else "axe" if col <= 13 else "shield"
    if row == 11:
        return "boots" if col <= 6 else "amulet" if col <= 13 else "robe"
    if row == 12:
        return "hood" if col <= 7 else "amulet" if col <= 13 else "armor"
    if row == 13:
        return "boots" if col <= 8 else "cloak" if col <= 13 else "armor"
    if row == 14:
        return "boots" if col <= 8 else "cloak" if col <= 13 else "armor"
    return "unknown"


def normalize_effects(effects: list[tuple[str, float]]) -> list[dict[str, Any]]:
    totals: Counter[str] = Counter()
    for effect, weight in effects:
        totals[effect] += weight
    total = sum(max(0.0, weight) for weight in totals.values()) or 1.0
    return [
        {"effect": effect, "weight": round(weight / total, 3)}
        for effect, weight in sorted(totals.items())
        if weight > 0
    ]


def recipe_for(family: str, color: str) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    color_recipe = list(COLOR_EFFECTS.get(color, (("strength", 1.0),)))
    tradeoffs: list[dict[str, str]] = []

    if family in {"vial", "round_potion", "elixir"}:
        effects = color_recipe + [("reroll_token", 0.2)]
    elif family in {"ring", "amulet", "heart_charm"}:
        effects = color_recipe + [("max_hp", 0.2 if family == "heart_charm" else 0.1)]
    elif family in {"crystal", "cut_gem", "teardrop_gem", "coin"}:
        effects = [("luck_pool_bonus", 0.65), ("merchant_discount", 0.2)] + color_recipe[:1]
    elif family in {"book", "scroll", "rune", "key_charm"}:
        effects = [("reroll_token", 0.35), ("boss_damage", 0.25)] + color_recipe
    elif family in {"component", "food", "supply", "herb", "pack"}:
        effects = [("luck_pool_bonus", 0.35), ("reroll_token", 0.25)] + color_recipe[:1]
    elif family in {"orb", "volatile_orb"}:
        effects = [("boss_damage", 0.3), ("execute_damage", 0.25)] + color_recipe
        if color in {"black", "violet", "purple"}:
            tradeoffs.append({"effect": "curse_power", "tradeoff": "small max_hp penalty or increased incoming damage"})
    elif family in {"wand", "staff", "rod"}:
        effects = [("hit_chance", 0.25), ("crit_chance", 0.15)] + color_recipe
    elif family == "mace":
        effects = [("weapon_damage", 0.55), ("stagger", 0.35), ("strength", 0.1)]
    elif family == "spear":
        effects = [("first_strike", 0.35), ("initiative", 0.25), ("hit_chance", 0.2), ("weapon_damage", 0.2)]
    elif family == "sword":
        effects = [("weapon_damage", 0.55), ("strength", 0.25), ("crit_chance", 0.2)]
    elif family == "dagger":
        effects = [("double_strike", 0.3), ("crit_chance", 0.25), ("hit_chance", 0.2), ("damage_roll_quality", 0.25)]
    elif family == "axe":
        effects = [("weapon_damage", 0.75), ("execute_damage", 0.25)]
        tradeoffs.append({"effect": "hit_chance", "tradeoff": "minor accuracy penalty"})
    elif family == "shield":
        effects = [("guard_first_hit", 0.55), ("armor_flat_reduction", 0.3), ("max_hp", 0.15)]
    elif family in {"helmet", "hood"}:
        effects = [("guard_first_hit", 0.35), ("max_hp", 0.25)] + color_recipe[:1]
    elif family in {"garment", "robe", "cloak"}:
        effects = [("dexterity", 0.25), ("initiative", 0.2), ("crit_chance", 0.15), ("guard_first_hit", 0.15)] + color_recipe[:1]
    elif family == "armor":
        effects = [("armor_flat_reduction", 0.45), ("max_hp", 0.35), ("guard_first_hit", 0.2)]
    elif family == "boots":
        effects = [("dexterity", 0.3), ("initiative", 0.25), ("double_strike", 0.15), ("first_strike", 0.3)]
    else:
        effects = color_recipe

    return normalize_effects(effects), tradeoffs


def drop_sources_for(slot: str, family: str) -> list[str]:
    if slot in {"currency", "material", "supply", "pack"}:
        return ["encounter", "treasury", "merchant"]
    if family in {"ring", "amulet", "rune", "orb", "volatile_orb"}:
        return ["treasury", "boss", "merchant"]
    if slot in {"weapon", "body", "shield", "helmet", "boots", "cloak"}:
        return ["encounter", "boss", "merchant"]
    return ["encounter", "treasury"]


def make_catalog(source: Path) -> dict[str, Any]:
    width, height, rows = read_rgba_png(source)
    detected: list[dict[str, Any]] = []
    ignored_footer = 0

    for tile_row in range(height // TILE_SIZE):
        for tile_col in range(width // TILE_SIZE):
            pixels = tile_pixels(rows, tile_col, tile_row)
            visible_count = sum(1 for *_, alpha in pixels if alpha > 0)
            if visible_count <= 20:
                continue
            if tile_row not in ITEM_ROWS or tile_col not in ITEM_COLS:
                ignored_footer += 1
                continue

            family = family_for(tile_col, tile_row)
            slot = FAMILY_SLOTS[family]
            color, hex_color = classify_color(pixels)
            noun = FAMILY_NOUNS[family]
            adjective = COLOR_ADJECTIVES.get(color, color.title())
            recipe, tradeoffs = recipe_for(family, color)
            statuses = {EFFECT_PRIMITIVES[entry["effect"]]["status"] for entry in recipe}
            runtime_status = "live" if statuses == {"live"} and not tradeoffs else "planned"

            detected.append(
                {
                    "id": f"oryx_r{tile_row:02d}_c{tile_col:02d}",
                    "name": f"{adjective} {noun}",
                    "sprite": {
                        "sheet": "oryx_16bit_fantasy_items_trans.png",
                        "tile_col": tile_col,
                        "tile_row": tile_row,
                        "x": tile_col * TILE_SIZE,
                        "y": tile_row * TILE_SIZE,
                        "w": TILE_SIZE,
                        "h": TILE_SIZE,
                    },
                    "visual": {
                        "family": family,
                        "dominant_color": color,
                        "approx_hex": hex_color,
                        "visible_pixels": visible_count,
                    },
                    "slot": slot,
                    "rarity_band": RARITY_BANDS[slot],
                    "drop_sources": drop_sources_for(slot, family),
                    "power_recipe": recipe,
                    "tradeoffs": tradeoffs,
                    "tags": sorted({family, slot, color} | {entry["effect"] for entry in recipe}),
                    "runtime_status": runtime_status,
                }
            )

    return {
        "version": "0.1.0",
        "source_image": str(source),
        "tile_size": TILE_SIZE,
        "grid": {"columns": width // TILE_SIZE, "rows": height // TILE_SIZE},
        "detection": {
            "detected_item_sprites": len(detected),
            "ignored_non_item_tiles": ignored_footer,
            "item_rows": [min(ITEM_ROWS), max(ITEM_ROWS)],
            "item_columns": [min(ITEM_COLS), max(ITEM_COLS)],
            "method": "16x16 grid slicing plus alpha occupancy threshold",
        },
        "design_notes": [
            "Semantic names/effects are v0 gameplay guesses and should be curated visually.",
            "No item uses direct HP restoration; HP items map to max_hp or guard effects.",
            "power_recipe weights describe how a random luck-pool power budget should be spent.",
        ],
        "effect_primitives": EFFECT_PRIMITIVES,
        "items": detected,
    }


def write_report(catalog: dict[str, Any], path: Path) -> None:
    items = catalog["items"]
    families = Counter(item["visual"]["family"] for item in items)
    slots = Counter(item["slot"] for item in items)
    statuses = Counter(item["runtime_status"] for item in items)
    effects = Counter(effect["effect"] for item in items for effect in item["power_recipe"])

    lines = [
        "# Oryx Item Sprite Mapping",
        "",
        f"Source: `{catalog['source_image']}`",
        f"Grid: `{catalog['grid']['columns']} x {catalog['grid']['rows']}` tiles, `{catalog['tile_size']} px` each.",
        f"Detected item sprites: `{catalog['detection']['detected_item_sprites']}`.",
        f"Ignored non-item/footer occupied tiles: `{catalog['detection']['ignored_non_item_tiles']}`.",
        "",
        "This is a v0 semantic catalog. Detection is exact grid/alpha slicing; item names",
        "and effects are intentionally editable design guesses.",
        "",
        "Important HP rule: wearable HP-like sprites become `max_hp`,",
        "`guard_first_hit`, or `armor_flat_reduction` effects. Health potions are the",
        "exception: they are instant consumables that restore current HP and are not",
        "stored as gear.",
        "",
        "## Runtime Status",
        "",
    ]
    lines.extend(f"- `{key}`: {value}" for key, value in sorted(statuses.items()))
    lines.extend(["", "## Slot Counts", ""])
    lines.extend(f"- `{key}`: {value}" for key, value in sorted(slots.items()))
    lines.extend(["", "## Family Counts", ""])
    lines.extend(f"- `{key}`: {value}" for key, value in sorted(families.items()))
    lines.extend(["", "## Most Used Effect Primitives", ""])
    lines.extend(f"- `{key}`: {value}" for key, value in effects.most_common(20))
    lines.extend(["", "## Row Intent", ""])
    row_intent = {
        1: "vials, potions, elixirs, volatile orbs",
        2: "rings, crystals, gems",
        3: "books, components, runes, heart charms",
        4: "orbs, provisions, key charms, heart charms",
        5: "orbs, supplies, herbs, coins",
        6: "helmets, packs, garments, coins",
        7: "wands, staves, rods",
        8: "staves, rods, wands",
        9: "maces, spears, swords",
        10: "daggers, axes, shields",
        11: "boots, amulets, robes",
        12: "hoods, amulets, armor",
        13: "boots, cloaks, armor",
        14: "boots, cloaks, armor",
    }
    lines.extend(f"- row `{row:02d}`: {text}" for row, text in row_intent.items())
    lines.extend(["", "## Example Entries", ""])
    for item in items[:12] + items[120:132] + items[-12:]:
        effects_text = ", ".join(f"{entry['effect']}:{entry['weight']}" for entry in item["power_recipe"])
        lines.append(
            f"- `{item['id']}` `{item['name']}` slot=`{item['slot']}` "
            f"family=`{item['visual']['family']}` effects=`{effects_text}`"
        )
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def css_url(path: str) -> str:
    return Path(path).resolve().as_uri()


def write_preview(catalog: dict[str, Any], path: Path) -> None:
    data = json.dumps(catalog, ensure_ascii=False)
    image_url = css_url(catalog["source_image"])
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Oryx Item Catalog Preview</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101214;
      --panel: #191d20;
      --panel2: #20252a;
      --text: #f1f4f2;
      --muted: #9ea7a1;
      --line: #30373c;
      --accent: #95d66b;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    header {{
      position: sticky;
      top: 0;
      z-index: 2;
      background: rgba(16, 18, 20, 0.94);
      border-bottom: 1px solid var(--line);
      padding: 12px 16px;
      backdrop-filter: blur(8px);
    }}
    h1 {{
      margin: 0 0 10px;
      font-size: 18px;
      letter-spacing: 0;
    }}
    .controls {{
      display: grid;
      grid-template-columns: minmax(180px, 1fr) repeat(3, minmax(130px, 190px));
      gap: 8px;
    }}
    input, select {{
      width: 100%;
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #0c0e10;
      color: var(--text);
      padding: 7px 9px;
      font: inherit;
    }}
    main {{ padding: 16px; }}
    .meta {{
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 12px;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(238px, 1fr));
      gap: 8px;
    }}
    .card {{
      display: grid;
      grid-template-columns: 56px 1fr;
      gap: 10px;
      min-height: 86px;
      padding: 9px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }}
    .sprite {{
      width: 48px;
      height: 48px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background-image: url("{image_url}");
      background-size: {catalog['grid']['columns'] * catalog['tile_size'] * 3}px {catalog['grid']['rows'] * catalog['tile_size'] * 3}px;
      image-rendering: pixelated;
      background-color: #050607;
    }}
    .name {{
      font-weight: 700;
      font-size: 14px;
      line-height: 1.25;
    }}
    .sub {{
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }}
    .effects {{
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 7px;
    }}
    .chip {{
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--panel2);
      padding: 2px 6px;
      font-size: 11px;
      color: #dce4df;
      white-space: nowrap;
    }}
    .live {{ color: var(--accent); }}
    @media (max-width: 760px) {{
      .controls {{ grid-template-columns: 1fr; }}
      main {{ padding: 10px; }}
    }}
  </style>
</head>
<body>
  <header>
    <h1>Oryx Item Catalog Preview</h1>
    <div class="controls">
      <input id="search" placeholder="Search name, effect, family, slot">
      <select id="slot"></select>
      <select id="family"></select>
      <select id="status"></select>
    </div>
  </header>
  <main>
    <div class="meta" id="meta"></div>
    <section class="grid" id="grid"></section>
  </main>
  <script>
    const catalog = {data};
    const grid = document.getElementById("grid");
    const search = document.getElementById("search");
    const slot = document.getElementById("slot");
    const family = document.getElementById("family");
    const status = document.getElementById("status");
    const meta = document.getElementById("meta");

    function fillSelect(select, label, values) {{
      select.innerHTML = `<option value="">${{label}}</option>` + values.map(v => `<option value="${{v}}">${{v}}</option>`).join("");
    }}

    fillSelect(slot, "All slots", [...new Set(catalog.items.map(i => i.slot))].sort());
    fillSelect(family, "All families", [...new Set(catalog.items.map(i => i.visual.family))].sort());
    fillSelect(status, "All statuses", [...new Set(catalog.items.map(i => i.runtime_status))].sort());

    function matches(item) {{
      const q = search.value.trim().toLowerCase();
      const haystack = [
        item.id, item.name, item.slot, item.visual.family, item.runtime_status,
        ...item.tags
      ].join(" ").toLowerCase();
      return (!q || haystack.includes(q))
        && (!slot.value || item.slot === slot.value)
        && (!family.value || item.visual.family === family.value)
        && (!status.value || item.runtime_status === status.value);
    }}

    function render() {{
      const items = catalog.items.filter(matches);
      meta.textContent = `${{items.length}} / ${{catalog.items.length}} mapped sprites. Source image is referenced from your local purchased pack path.`;
      grid.innerHTML = items.map(item => {{
        const x = item.sprite.x * 3;
        const y = item.sprite.y * 3;
        const effects = item.power_recipe.map(e => `<span class="chip">${{e.effect}} ${{Math.round(e.weight * 100)}}%</span>`).join("");
        return `<article class="card">
          <div class="sprite" style="background-position: -${{x}}px -${{y}}px"></div>
          <div>
            <div class="name">${{item.name}}</div>
            <div class="sub">${{item.id}} · ${{item.slot}} · ${{item.visual.family}} · <span class="${{item.runtime_status}}">${{item.runtime_status}}</span></div>
            <div class="effects">${{effects}}</div>
          </div>
        </article>`;
      }}).join("");
    }}

    [search, slot, family, status].forEach(el => el.addEventListener("input", render));
    render();
  </script>
</body>
</html>
"""
    path.write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a v0 item/effect catalog from the Oryx item sheet.")
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--out-json", required=True, type=Path)
    parser.add_argument("--out-report", required=True, type=Path)
    parser.add_argument("--out-preview", required=True, type=Path)
    args = parser.parse_args()

    catalog = make_catalog(args.source)
    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_report.parent.mkdir(parents=True, exist_ok=True)
    args.out_preview.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_report(catalog, args.out_report)
    write_preview(catalog, args.out_preview)
    print(f"mapped {len(catalog['items'])} item sprites")
    print(f"ignored {catalog['detection']['ignored_non_item_tiles']} non-item occupied tiles")


if __name__ == "__main__":
    main()
