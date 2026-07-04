#!/usr/bin/env python3
"""Generate src/features/playtest/engine/itemTemplates.ts from the Oryx item
catalog (data/oryx_item_catalog.json).

Assets guide item identity: names and sprites come straight from the catalog,
and each family entry keeps its catalog order as a quality ladder (e.g. Wooden
Shield -> Iron Shield -> ... -> Tower Shield), which the loot factory maps to
rarity. Rerun after editing the catalog:

    python3 tools/build_item_templates.py
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "oryx_item_catalog.json"
OUT = ROOT / "src" / "features" / "playtest" / "engine" / "itemTemplates.ts"

# Families used by the trinket/spell loot factories. Order within a family is
# the catalog order = quality ladder.
TRINKET_FAMILIES = {
    "amulet": "amulet",          # HP slot
    "heart_charm": "amulet",     # HP slot uniques
    "ring": "charm",             # STR slot
    "teardrop_gem": "relic",     # DEX slot
    "gem": "relic",              # DEX slot high tiers
    "shield": "shield",          # BLOCK slot
    "orb": "focus",              # spell trinkets
    "book": "focus",
    "rune": "focus",
    "scroll": "focus",
    "skull": "focus",
    "crown": "focus",
}


# Catalog entries whose sprite does not match their labelled family (e.g.
# oryx_r10_c18 "Crimson Shield" is visually a red sword in the weapons row).
MISLABELED_IDS = {
    "oryx_r10_c18",
}


def main() -> None:
    catalog = json.loads(CATALOG.read_text())
    rows = []
    seen_names = set()
    for item in catalog["items"]:
        if item["id"] in MISLABELED_IDS:
            continue
        family = item.get("visual", {}).get("family", "")
        if family not in TRINKET_FAMILIES:
            continue
        name = item["name"]
        if name in seen_names:  # catalog repeats a few names across sheets
            continue
        seen_names.add(name)
        sprite = item["sprite"]
        rows.append(
            {
                "id": item["id"],
                "name": name,
                "family": family,
                "slot": TRINKET_FAMILIES[family],
                "col": sprite["tile_col"],
                "row": sprite["tile_row"],
            }
        )

    lines = [
        "/**",
        " * GENERATED FILE - do not edit by hand.",
        " * Source: data/oryx_item_catalog.json via tools/build_item_templates.py.",
        " * Names + sprites come straight from the Oryx catalog; a family's entry",
        " * order is its quality ladder (used to map rarity to a concrete asset).",
        " */",
        "",
        'export type TrinketSlotKind = "amulet" | "charm" | "relic" | "shield" | "focus";',
        "",
        "export interface ItemTemplate {",
        "  id: string;",
        "  name: string;",
        "  family: string;",
        "  slot: TrinketSlotKind;",
        "  sprite: { col: number; row: number };",
        "}",
        "",
        "export const ITEM_TEMPLATES: ItemTemplate[] = [",
    ]
    for r in rows:
        lines.append(
            f'  {{ id: "{r["id"]}", name: "{r["name"]}", family: "{r["family"]}", '
            f'slot: "{r["slot"]}", sprite: {{ col: {r["col"]}, row: {r["row"]} }} }},'
        )
    lines.append("];")
    lines.append("")
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT} with {len(rows)} templates")


if __name__ == "__main__":
    main()
