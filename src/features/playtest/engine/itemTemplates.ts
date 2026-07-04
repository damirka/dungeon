/**
 * GENERATED FILE - do not edit by hand.
 * Source: data/oryx_item_catalog.json via tools/build_item_templates.py.
 * Names + sprites come straight from the Oryx catalog; a family's entry
 * order is its quality ladder (used to map rarity to a concrete asset).
 */

export type TrinketSlotKind = "amulet" | "charm" | "relic" | "shield" | "focus";

export interface ItemTemplate {
  id: string;
  name: string;
  family: string;
  slot: TrinketSlotKind;
  sprite: { col: number; row: number };
}

export const ITEM_TEMPLATES: ItemTemplate[] = [
  { id: "oryx_r02_c01", name: "Amber Amulet", family: "amulet", slot: "amulet", sprite: { col: 1, row: 2 } },
  { id: "oryx_r02_c02", name: "Silver Amulet", family: "amulet", slot: "amulet", sprite: { col: 2, row: 2 } },
  { id: "oryx_r02_c03", name: "Viridian Amulet", family: "amulet", slot: "amulet", sprite: { col: 3, row: 2 } },
  { id: "oryx_r02_c05", name: "Sunlit Amulet", family: "amulet", slot: "amulet", sprite: { col: 5, row: 2 } },
  { id: "oryx_r02_c06", name: "Skeleton Amulet", family: "amulet", slot: "amulet", sprite: { col: 6, row: 2 } },
  { id: "oryx_r02_c18", name: "Amethyst Tear", family: "teardrop_gem", slot: "relic", sprite: { col: 18, row: 2 } },
  { id: "oryx_r02_c19", name: "Viridian Tear", family: "teardrop_gem", slot: "relic", sprite: { col: 19, row: 2 } },
  { id: "oryx_r02_c20", name: "Sunlit Tear", family: "teardrop_gem", slot: "relic", sprite: { col: 20, row: 2 } },
  { id: "oryx_r02_c21", name: "Azure Tear", family: "teardrop_gem", slot: "relic", sprite: { col: 21, row: 2 } },
  { id: "oryx_r02_c22", name: "Ivory Tear", family: "teardrop_gem", slot: "relic", sprite: { col: 22, row: 2 } },
  { id: "oryx_r03_c01", name: "Ivory Book", family: "book", slot: "focus", sprite: { col: 1, row: 3 } },
  { id: "oryx_r03_c02", name: "Amber Book", family: "book", slot: "focus", sprite: { col: 2, row: 3 } },
  { id: "oryx_r03_c03", name: "Golden Book", family: "book", slot: "focus", sprite: { col: 3, row: 3 } },
  { id: "oryx_r03_c04", name: "Sunlit Book", family: "book", slot: "focus", sprite: { col: 4, row: 3 } },
  { id: "oryx_r03_c15", name: "Viridian Rune", family: "rune", slot: "focus", sprite: { col: 15, row: 3 } },
  { id: "oryx_r03_c17", name: "Amethyst Rune", family: "rune", slot: "focus", sprite: { col: 17, row: 3 } },
  { id: "oryx_r03_c18", name: "Rose Rune", family: "rune", slot: "focus", sprite: { col: 18, row: 3 } },
  { id: "oryx_r03_c19", name: "Crimson Rune", family: "rune", slot: "focus", sprite: { col: 19, row: 3 } },
  { id: "oryx_r03_c20", name: "Amber Heart Charm", family: "heart_charm", slot: "amulet", sprite: { col: 20, row: 3 } },
  { id: "oryx_r03_c21", name: "Azure Heart Charm", family: "heart_charm", slot: "amulet", sprite: { col: 21, row: 3 } },
  { id: "oryx_r03_c22", name: "Viridian Heart Charm", family: "heart_charm", slot: "amulet", sprite: { col: 22, row: 3 } },
  { id: "oryx_r04_c01", name: "Book #1", family: "book", slot: "focus", sprite: { col: 1, row: 4 } },
  { id: "oryx_r04_c02", name: "Book #2", family: "book", slot: "focus", sprite: { col: 2, row: 4 } },
  { id: "oryx_r04_c03", name: "Book #3", family: "book", slot: "focus", sprite: { col: 3, row: 4 } },
  { id: "oryx_r04_c04", name: "Book #4", family: "book", slot: "focus", sprite: { col: 4, row: 4 } },
  { id: "oryx_r04_c05", name: "Book #5", family: "book", slot: "focus", sprite: { col: 5, row: 4 } },
  { id: "oryx_r04_c10", name: "Silver Ring", family: "ring", slot: "charm", sprite: { col: 10, row: 4 } },
  { id: "oryx_r04_c11", name: "Sunlit Ring", family: "ring", slot: "charm", sprite: { col: 11, row: 4 } },
  { id: "oryx_r04_c12", name: "Crimson Ring", family: "ring", slot: "charm", sprite: { col: 12, row: 4 } },
  { id: "oryx_r04_c13", name: "Amber Ring", family: "ring", slot: "charm", sprite: { col: 13, row: 4 } },
  { id: "oryx_r04_c15", name: "Amethyst Ring", family: "ring", slot: "charm", sprite: { col: 15, row: 4 } },
  { id: "oryx_r04_c16", name: "Azure Ring", family: "ring", slot: "charm", sprite: { col: 16, row: 4 } },
  { id: "oryx_r04_c17", name: "Viridian Ring", family: "ring", slot: "charm", sprite: { col: 17, row: 4 } },
  { id: "oryx_r04_c18", name: "Skeleton Ring", family: "ring", slot: "charm", sprite: { col: 18, row: 4 } },
  { id: "oryx_r05_c01", name: "Azure Orb", family: "orb", slot: "focus", sprite: { col: 1, row: 5 } },
  { id: "oryx_r05_c02", name: "Viridian Orb", family: "orb", slot: "focus", sprite: { col: 2, row: 5 } },
  { id: "oryx_r05_c03", name: "Crimson Orb", family: "orb", slot: "focus", sprite: { col: 3, row: 5 } },
  { id: "oryx_r05_c04", name: "Amethyst Orb", family: "orb", slot: "focus", sprite: { col: 4, row: 5 } },
  { id: "oryx_r05_c05", name: "Sunlit Orb", family: "orb", slot: "focus", sprite: { col: 5, row: 5 } },
  { id: "oryx_r05_c17", name: "Sunlit Gem", family: "gem", slot: "relic", sprite: { col: 17, row: 5 } },
  { id: "oryx_r05_c18", name: "Large Sunlit Gem", family: "gem", slot: "relic", sprite: { col: 18, row: 5 } },
  { id: "oryx_r05_c19", name: "Double Sunlit Gem", family: "gem", slot: "relic", sprite: { col: 19, row: 5 } },
  { id: "oryx_r05_c20", name: "Silver Gem", family: "gem", slot: "relic", sprite: { col: 20, row: 5 } },
  { id: "oryx_r05_c21", name: "Large Silver Gem", family: "gem", slot: "relic", sprite: { col: 21, row: 5 } },
  { id: "oryx_r05_c22", name: "Double Silver Gem", family: "gem", slot: "relic", sprite: { col: 22, row: 5 } },
  { id: "oryx_r06_c18", name: "Golden Orb", family: "orb", slot: "focus", sprite: { col: 18, row: 6 } },
  { id: "oryx_r06_c21", name: "Sapphire Orb", family: "orb", slot: "focus", sprite: { col: 21, row: 6 } },
  { id: "oryx_r07_c01", name: "Ivory Skull", family: "skull", slot: "focus", sprite: { col: 1, row: 7 } },
  { id: "oryx_r07_c02", name: "Crimson Skull", family: "skull", slot: "focus", sprite: { col: 2, row: 7 } },
  { id: "oryx_r07_c03", name: "Sunlit Skull", family: "skull", slot: "focus", sprite: { col: 3, row: 7 } },
  { id: "oryx_r07_c04", name: "Amber Scroll", family: "scroll", slot: "focus", sprite: { col: 4, row: 7 } },
  { id: "oryx_r07_c17", name: "Royal Crown", family: "crown", slot: "focus", sprite: { col: 17, row: 7 } },
  { id: "oryx_r07_c18", name: "Simple Crown", family: "crown", slot: "focus", sprite: { col: 18, row: 7 } },
  { id: "oryx_r11_c01", name: "Wooden Shield", family: "shield", slot: "shield", sprite: { col: 1, row: 11 } },
  { id: "oryx_r11_c02", name: "Hardened Wooden Shield", family: "shield", slot: "shield", sprite: { col: 2, row: 11 } },
  { id: "oryx_r11_c03", name: "Iron Shield", family: "shield", slot: "shield", sprite: { col: 3, row: 11 } },
  { id: "oryx_r11_c04", name: "Hardened Iron Shield", family: "shield", slot: "shield", sprite: { col: 4, row: 11 } },
  { id: "oryx_r11_c05", name: "Golden Shield", family: "shield", slot: "shield", sprite: { col: 5, row: 11 } },
  { id: "oryx_r11_c06", name: "Silver Shield", family: "shield", slot: "shield", sprite: { col: 6, row: 11 } },
  { id: "oryx_r11_c07", name: "Sunlit Shield", family: "shield", slot: "shield", sprite: { col: 7, row: 11 } },
  { id: "oryx_r11_c08", name: "Knight Shield", family: "shield", slot: "shield", sprite: { col: 8, row: 11 } },
  { id: "oryx_r11_c09", name: "Azure Shield", family: "shield", slot: "shield", sprite: { col: 9, row: 11 } },
  { id: "oryx_r11_c10", name: "Crimson Shield", family: "shield", slot: "shield", sprite: { col: 10, row: 11 } },
  { id: "oryx_r11_c11", name: "Tower Shield", family: "shield", slot: "shield", sprite: { col: 11, row: 11 } },
  { id: "oryx_r11_c12", name: "Amber Shield", family: "shield", slot: "shield", sprite: { col: 12, row: 11 } },
  { id: "oryx_r11_c13", name: "Skeleton Shield", family: "shield", slot: "shield", sprite: { col: 13, row: 11 } },
  { id: "oryx_r11_c14", name: "Broken Platinum Shield", family: "shield", slot: "shield", sprite: { col: 14, row: 11 } },
  { id: "oryx_r12_c13", name: "Robe Amulet", family: "amulet", slot: "amulet", sprite: { col: 13, row: 12 } },
];
