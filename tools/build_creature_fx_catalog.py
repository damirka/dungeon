from __future__ import annotations

import argparse
import json
import struct
import zlib
from collections import Counter
from pathlib import Path
from typing import Any


DEFAULT_TILE_SIZE = 16


SHEETS = {
    "fx": {
        "title": "FX",
        "source_image": "/Users/damirshamanaev/Downloads/oryx_16-bit_fantasy_1.1/TMX Source/oryx_fx.png",
        "prefix": "fx",
        "tile_size": 16,
    },
    "creatures": {
        "title": "Creatures",
        "source_image": "/Users/damirshamanaev/Downloads/oryx_16-bit_fantasy_1.1/TMX Source/oryx_creatures.png",
        "prefix": "cre",
        "tile_size": 24,
    },
}


COLOR_NAMES = (
    ("black", (18, 18, 18)),
    ("gray", (104, 104, 104)),
    ("silver", (178, 178, 178)),
    ("white", (232, 232, 232)),
    ("red", (210, 43, 43)),
    ("orange", (223, 112, 40)),
    ("gold", (205, 166, 53)),
    ("yellow", (229, 222, 59)),
    ("green", (73, 177, 69)),
    ("teal", (62, 174, 148)),
    ("cyan", (69, 194, 222)),
    ("blue", (69, 111, 214)),
    ("violet", (116, 78, 211)),
    ("purple", (165, 69, 185)),
    ("pink", (222, 101, 178)),
    ("brown", (133, 83, 43)),
)


COLOR_ADJECTIVES = {
    "black": "Onyx",
    "gray": "Ashen",
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


FX_ROW_FAMILIES = {
    range(0, 1): ("burst", "impact_fx", "combat_fx"),
    range(1, 2): ("slash", "attack_fx", "combat_fx"),
    range(2, 3): ("projectile", "projectile_fx", "attack_fx"),
    range(3, 4): ("beam_or_marker", "telegraph_fx", "combat_fx"),
    range(4, 5): ("splash", "status_fx", "combat_fx"),
}


CREATURE_PAIR_FAMILIES = {
    range(0, 5): ("humanoid", "enemy_candidate", "encounter_enemy"),
    range(5, 6): ("monster", "enemy_candidate", "encounter_enemy"),
    range(6, 7): ("beast", "enemy_candidate", "encounter_enemy"),
    range(7, 8): ("humanoid", "enemy_candidate", "encounter_enemy"),
    range(8, 9): ("undead", "enemy_candidate", "encounter_enemy"),
    range(9, 10): ("beast", "enemy_candidate", "encounter_enemy"),
    range(10, 11): ("monster", "enemy_candidate", "encounter_enemy"),
    range(11, 14): ("monster", "enemy_candidate", "encounter_enemy"),
    range(14, 17): ("caster_or_spirit", "enemy_candidate", "elite_enemy"),
    range(17, 19): ("large_monster", "enemy_candidate", "boss_enemy"),
    range(19, 21): ("small_creature_or_icon", "enemy_candidate", "encounter_enemy"),
}


FAMILY_NOUNS = {
    "burst": "Burst",
    "slash": "Slash",
    "projectile": "Projectile",
    "beam_or_marker": "Marker",
    "splash": "Splash",
    "humanoid": "Humanoid",
    "undead": "Undead",
    "beast": "Beast",
    "monster": "Monster",
    "caster_or_spirit": "Spirit",
    "large_monster": "Monster",
    "small_creature_or_icon": "Creature",
}


EFFECT_BY_COLOR = {
    "black": "curse",
    "gray": "armor",
    "silver": "hit_chance",
    "white": "guard",
    "red": "burn",
    "orange": "heavy_damage",
    "gold": "loot_bonus",
    "yellow": "shock",
    "green": "poison",
    "teal": "initiative",
    "cyan": "freeze",
    "blue": "pierce",
    "violet": "curse",
    "purple": "crit_damage",
    "pink": "crit_chance",
    "brown": "stagger",
}


def unit_combat_defaults(
    sheet_key: str,
    family: str,
    category: str,
    effect: str,
) -> dict[str, Any]:
    if sheet_key != "creatures":
        return {"combat_profile": "unset", "attack_types": [], "unit_props": []}

    by_family = {
        "humanoid": ("balanced", ["strike", "guard"], ["weapon_user"]),
        "undead": ("hp", ["strike", "heavy"], ["durable", "undead"]),
        "beast": ("dexterity", ["strike", "pierce"], ["fast"]),
        "monster": ("strength", ["strike", "heavy"], ["bruiser"]),
        "caster_or_spirit": ("caster", ["strike", "aim", "ranged"], ["magic"]),
        "large_monster": ("tank", ["heavy", "guard"], ["durable", "large"]),
        "small_creature_or_icon": ("dexterity", ["strike", "pierce"], ["small", "fast"]),
    }
    profile, attacks, props = by_family.get(family, ("balanced", ["strike"], []))
    if category == "boss_enemy":
        profile = "boss"
        props = [*props, "boss"]
    if effect in {"poison", "burn", "freeze", "shock", "curse", "stun", "sunder"}:
        attacks = [*attacks, effect]
        props = [*props, effect]
    return {
        "combat_profile": profile,
        "attack_types": sorted(dict.fromkeys(attacks)),
        "unit_props": sorted(dict.fromkeys(props)),
    }


def read_png(path: Path) -> tuple[int, int, list[tuple[int, int, int, int]]]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} is not a PNG")

    offset = 8
    width = height = color_type = None
    bit_depth = None
    idat = bytearray()
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(
                ">IIBBBBB", chunk_data
            )
            if bit_depth != 8 or interlace != 0:
                raise ValueError(f"Unsupported PNG format in {path}")
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    if width is None or height is None or color_type is None:
        raise ValueError(f"Missing PNG header in {path}")

    channels_by_color_type = {2: 3, 6: 4}
    if color_type not in channels_by_color_type:
        raise ValueError(f"Unsupported PNG color type {color_type} in {path}")

    channels = channels_by_color_type[color_type]
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    rows: list[bytes] = []
    cursor = 0
    previous = bytearray(stride)
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        scanline = bytearray(raw[cursor : cursor + stride])
        cursor += stride
        reconstructed = _unfilter(scanline, previous, filter_type, channels)
        rows.append(bytes(reconstructed))
        previous = reconstructed

    pixels: list[tuple[int, int, int, int]] = []
    for row in rows:
        for index in range(0, len(row), channels):
            if channels == 4:
                pixels.append((row[index], row[index + 1], row[index + 2], row[index + 3]))
            else:
                pixels.append((row[index], row[index + 1], row[index + 2], 255))
    return width, height, pixels


def _unfilter(
    scanline: bytearray,
    previous: bytearray,
    filter_type: int,
    bytes_per_pixel: int,
) -> bytearray:
    result = bytearray(len(scanline))
    for index, value in enumerate(scanline):
        left = result[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
        up = previous[index]
        up_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
        if filter_type == 0:
            predictor = 0
        elif filter_type == 1:
            predictor = left
        elif filter_type == 2:
            predictor = up
        elif filter_type == 3:
            predictor = (left + up) // 2
        elif filter_type == 4:
            predictor = _paeth(left, up, up_left)
        else:
            raise ValueError(f"Unsupported PNG filter {filter_type}")
        result[index] = (value + predictor) & 0xFF
    return result


def _paeth(left: int, up: int, up_left: int) -> int:
    estimate = left + up - up_left
    pa = abs(estimate - left)
    pb = abs(estimate - up)
    pc = abs(estimate - up_left)
    if pa <= pb and pa <= pc:
        return left
    if pb <= pc:
        return up
    return up_left


def color_name(rgb: tuple[int, int, int]) -> str:
    return min(
        COLOR_NAMES,
        key=lambda item: sum((item[1][channel] - rgb[channel]) ** 2 for channel in range(3)),
    )[0]


def family_for(sheet: str, row_or_pair: int) -> tuple[str, str, str]:
    table = FX_ROW_FAMILIES if sheet == "fx" else CREATURE_PAIR_FAMILIES
    for row_range, values in table.items():
        if row_or_pair in row_range:
            return values
    if sheet == "fx":
        return "fx_unknown", "effect_candidate", "combat_fx"
    return "creature_unknown", "enemy_candidate", "encounter_enemy"


def occupied_pixels_for_tile(
    sheet_key: str,
    row: int,
    col: int,
    tile_size: int,
    width: int,
    pixels: list[tuple[int, int, int, int]],
) -> list[tuple[int, int, int, int]]:
    x = col * tile_size
    y = row * tile_size
    occupied = []
    for py in range(y, min(y + tile_size, len(pixels) // width)):
        for px in range(x, min(x + tile_size, width)):
            pixel = pixels[py * width + px]
            if sheet_key == "fx":
                if pixel[3] > 12:
                    occupied.append(pixel)
            elif pixel[:3] != (0, 0, 0):
                occupied.append(pixel)
    return occupied


def fx_connected_components(
    width: int,
    height: int,
    pixels: list[tuple[int, int, int, int]],
    *,
    minimum_pixels: int = 5,
) -> list[dict[str, Any]]:
    occupied = [pixel[3] > 12 for pixel in pixels]
    seen = bytearray(width * height)
    components: list[dict[str, Any]] = []

    for start, is_occupied in enumerate(occupied):
        if not is_occupied or seen[start]:
            continue

        stack = [start]
        seen[start] = 1
        xs: list[int] = []
        ys: list[int] = []
        component_pixels: list[tuple[int, int, int, int]] = []

        while stack:
            index = stack.pop()
            x = index % width
            y = index // width
            xs.append(x)
            ys.append(y)
            component_pixels.append(pixels[index])

            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                neighbor = ny * width + nx
                if occupied[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    stack.append(neighbor)

        if len(component_pixels) < minimum_pixels:
            continue

        min_x = min(xs)
        min_y = min(ys)
        max_x = max(xs)
        max_y = max(ys)
        components.append(
            {
                "x": min_x,
                "y": min_y,
                "w": max_x - min_x + 1,
                "h": max_y - min_y + 1,
                "pixels": component_pixels,
            }
        )

    return sorted(components, key=lambda component: (component["y"], component["x"]))


def base_entry(
    *,
    sheet_key: str,
    sheet: dict[str, Any],
    row: int,
    col: int,
    family_index: int,
    occupied: list[tuple[int, int, int, int]],
) -> dict[str, Any]:
    tile_size = int(sheet.get("tile_size", DEFAULT_TILE_SIZE))
    x = col * tile_size
    y = row * tile_size

    avg_rgb = tuple(
        round(sum(pixel[channel] for pixel in occupied) / len(occupied))
        for channel in range(3)
    )
    dominant = color_name(avg_rgb)
    family, category, engine_role = family_for(sheet_key, family_index)
    effect = EFFECT_BY_COLOR.get(dominant, "unset")
    adjective = COLOR_ADJECTIVES.get(dominant, dominant.title())
    noun = FAMILY_NOUNS.get(family, family.replace("_", " ").title())
    prefix = sheet["prefix"]
    is_fx = sheet_key == "fx"
    tags = sorted({sheet_key, family, category, engine_role, dominant, effect})
    combat_defaults = unit_combat_defaults(sheet_key, family, category, effect)
    return {
        "id": f"{prefix}_r{row:02d}_c{col:02d}",
        "sheet": sheet_key,
        "name": f"{adjective} {noun}",
        "sprite": {
            "sheet": Path(sheet["source_image"]).name,
            "tile_col": col,
            "tile_row": row,
            "x": x,
            "y": y,
            "w": tile_size,
            "h": tile_size,
        },
        "visual": {
            "family": family,
            "dominant_color": dominant,
            "approx_hex": f"#{avg_rgb[0]:02x}{avg_rgb[1]:02x}{avg_rgb[2]:02x}",
            "visible_pixels": len(occupied),
        },
        "category": category,
        "engine_role": engine_role,
        "runtime_status": "candidate",
        "ignored": False,
        "meaning": "",
        "rarity_band": ["common", "uncommon"] if is_fx else ["common", "uncommon", "rare"],
        "encounter_roles": [] if is_fx else [engine_role],
        "effect_recipe": [{"effect": effect, "weight": 1.0}] if effect != "unset" else [],
        **combat_defaults,
        "tags": tags,
        "notes": "Generated starter metadata; curate visually before using in runtime.",
    }


def fx_tile_entry(
    sheet_key: str,
    sheet: dict[str, Any],
    row: int,
    col: int,
    width: int,
    pixels: list[tuple[int, int, int, int]],
) -> dict[str, Any] | None:
    tile_size = int(sheet.get("tile_size", DEFAULT_TILE_SIZE))
    occupied = occupied_pixels_for_tile(sheet_key, row, col, tile_size, width, pixels)
    if len(occupied) < 5:
        return None
    entry = base_entry(
        sheet_key=sheet_key,
        sheet=sheet,
        row=row,
        col=col,
        family_index=row,
        occupied=occupied,
    )
    entry["animation"] = {
        "kind": "single",
        "frames": [entry["sprite"]],
    }
    return entry


def fx_component_entry(
    sheet_key: str,
    sheet: dict[str, Any],
    component_index: int,
    component: dict[str, Any],
) -> dict[str, Any]:
    tile_size = int(sheet.get("tile_size", DEFAULT_TILE_SIZE))
    occupied = component["pixels"]
    avg_rgb = tuple(
        round(sum(pixel[channel] for pixel in occupied) / len(occupied))
        for channel in range(3)
    )
    dominant = color_name(avg_rgb)
    family_index = int(component["y"]) // tile_size
    family, category, engine_role = family_for(sheet_key, family_index)
    effect = EFFECT_BY_COLOR.get(dominant, "unset")
    adjective = COLOR_ADJECTIVES.get(dominant, dominant.title())
    noun = FAMILY_NOUNS.get(family, family.replace("_", " ").title())
    tags = sorted({sheet_key, family, category, engine_role, dominant, effect, "component"})
    combat_defaults = unit_combat_defaults(sheet_key, family, category, effect)
    sprite = {
        "sheet": Path(sheet["source_image"]).name,
        "tile_col": int(component["x"]) // tile_size,
        "tile_row": int(component["y"]) // tile_size,
        "x": int(component["x"]),
        "y": int(component["y"]),
        "w": int(component["w"]),
        "h": int(component["h"]),
    }
    entry = {
        "id": f"{sheet['prefix']}_cmp_{component_index:03d}",
        "sheet": sheet_key,
        "name": f"{adjective} {noun}",
        "sprite": sprite,
        "visual": {
            "family": family,
            "dominant_color": dominant,
            "approx_hex": f"#{avg_rgb[0]:02x}{avg_rgb[1]:02x}{avg_rgb[2]:02x}",
            "visible_pixels": len(occupied),
        },
        "category": category,
        "engine_role": engine_role,
        "runtime_status": "candidate",
        "ignored": False,
        "meaning": "",
        "rarity_band": ["common", "uncommon"],
        "encounter_roles": [],
        "effect_recipe": [{"effect": effect, "weight": 1.0}] if effect != "unset" else [],
        **combat_defaults,
        "tags": tags,
        "notes": (
            "Generated FX component metadata; bounds follow connected opaque pixels "
            "instead of fixed tile slicing. Curate visually before runtime use."
        ),
    }
    entry["animation"] = {
        "kind": "single",
        "frames": [sprite],
    }
    return entry


def creature_pair_entry(
    sheet_key: str,
    sheet: dict[str, Any],
    base_row: int,
    col: int,
    width: int,
    rows: int,
    pixels: list[tuple[int, int, int, int]],
) -> dict[str, Any] | None:
    if base_row + 1 >= rows:
        return None
    tile_size = int(sheet.get("tile_size", DEFAULT_TILE_SIZE))
    first = occupied_pixels_for_tile(sheet_key, base_row, col, tile_size, width, pixels)
    second = occupied_pixels_for_tile(sheet_key, base_row + 1, col, tile_size, width, pixels)
    occupied = first + second
    if len(occupied) < 8:
        return None
    row_pair = base_row // 2
    entry = base_entry(
        sheet_key=sheet_key,
        sheet=sheet,
        row=base_row,
        col=col,
        family_index=row_pair,
        occupied=occupied,
    )
    entry["id"] = f"{sheet['prefix']}_p{row_pair:02d}_c{col:02d}"
    entry["row_pair"] = row_pair
    entry["animation"] = {
        "kind": "vertical_pair",
        "frame_rows": [base_row, base_row + 1],
        "frames": [
            {
                "sheet": Path(sheet["source_image"]).name,
                "tile_col": col,
                "tile_row": base_row,
                "x": col * tile_size,
                "y": base_row * tile_size,
                "w": tile_size,
                "h": tile_size,
            },
            {
                "sheet": Path(sheet["source_image"]).name,
                "tile_col": col,
                "tile_row": base_row + 1,
                "x": col * tile_size,
                "y": (base_row + 1) * tile_size,
                "w": tile_size,
                "h": tile_size,
            },
        ],
    }
    entry["notes"] = (
        "Generated two-frame creature metadata; first frame is the even sheet row, "
        "second frame is the row immediately below. Curate visually before runtime use."
    )
    return entry


def build_catalog() -> dict[str, Any]:
    sheets: dict[str, Any] = {}
    entries: list[dict[str, Any]] = []
    for sheet_key, sheet in SHEETS.items():
        path = Path(sheet["source_image"])
        width, height, pixels = read_png(path)
        tile_size = int(sheet.get("tile_size", DEFAULT_TILE_SIZE))
        columns = width // tile_size
        rows = height // tile_size
        sheets[sheet_key] = {
            "title": sheet["title"],
            "source_image": sheet["source_image"],
            "tile_size": tile_size,
            "columns": columns,
            "rows": rows,
            "width": width,
            "height": height,
        }
        if sheet_key == "creatures":
            for row in range(0, rows - 1, 2):
                for col in range(columns):
                    entry = creature_pair_entry(sheet_key, sheet, row, col, width, rows, pixels)
                    if entry:
                        entries.append(entry)
        else:
            for index, component in enumerate(fx_connected_components(width, height, pixels)):
                entries.append(fx_component_entry(sheet_key, sheet, index, component))

    counts = Counter(entry["sheet"] for entry in entries)
    return {
        "version": "0.2.0",
        "source": "oryx_16-bit_fantasy_1.1",
        "tile_sizes": {key: int(sheet["tile_size"]) for key, sheet in SHEETS.items()},
        "sheets": sheets,
        "detection": {
            "method": "per-sheet extraction; FX uses connected opaque component bounds on a 16px guide grid; creatures use 24x24 non-black RGB occupancy; creature rows are paired as frame A/frame B",
            "detected_sprites": dict(counts),
            "creature_animation": "creature row pairs 0/1, 2/3, 4/5, ... are one logical creature per column",
            "fx_extraction": "FX entries are connected alpha components with variable frame bounds; the grid is only a guide.",
        },
        "entries": entries,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("outputs/dungeon_balance_core/data"),
    )
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    catalog = build_catalog()
    json_path = args.out_dir / "oryx_creature_fx_catalog.json"
    js_path = args.out_dir / "oryx_creature_fx_catalog_seed.js"
    json_path.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    js_path.write_text(
        "window.ORYX_CREATURE_FX_SEED_CATALOG = "
        + json.dumps(catalog, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {json_path}")
    print(f"Wrote {js_path}")
    print(json.dumps(catalog["detection"], indent=2))


if __name__ == "__main__":
    main()
