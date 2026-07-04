/**
 * Auto-generated from data/oryx_item_catalog.json by
 * tools/build_weapon_templates.mjs. Do not edit by hand.
 *
 * Catalog-derived weapon templates for the canonical React tactical engine.
 */

export type MappedWeaponEffect =
  | "weapon_damage"
  | "strength"
  | "dexterity"
  | "hit_chance"
  | "crit_chance"
  | "crit_damage"
  | "damage_roll_quality"
  | "double_strike"
  | "stagger"
  | "on_hit_burn"
  | "on_hit_poison"
  | "on_hit_freeze"
  | "on_hit_shock"
  | "boss_damage"
  | "execute_damage"
  | "first_strike"
  | "max_hp";

export type WeaponStyle = "sword" | "axe" | "rapier";

export interface WeaponTemplate {
  assetId: string;
  name: string;
  family: string;
  style: WeaponStyle;
  tags: string[];
  effects: { effect: MappedWeaponEffect; weight: number }[];
  sprite: { col: number; row: number };
}

// The JSON payload below is consumed verbatim by tools/weaponTemplates.test.mjs.
export const WEAPON_TEMPLATES: WeaponTemplate[] = [
  {
    "assetId": "oryx_r03_c06",
    "name": "Wooden Wand",
    "family": "wand",
    "style": "rapier",
    "tags": [
      "brown",
      "crit_chance",
      "hit_chance",
      "max_hp",
      "stagger",
      "wand",
      "weapon",
      "wooden"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "max_hp",
        "weight": 0.357
      },
      {
        "effect": "stagger",
        "weight": 0.357
      }
    ],
    "sprite": {
      "col": 6,
      "row": 3
    }
  },
  {
    "assetId": "oryx_r03_c07",
    "name": "Viridian Wand",
    "family": "wand",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "damage_roll_quality",
      "dexterity",
      "green",
      "hit_chance",
      "on_hit_poison",
      "viridian",
      "wand",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.179
      },
      {
        "effect": "dexterity",
        "weight": 0.25
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "on_hit_poison",
        "weight": 0.286
      }
    ],
    "sprite": {
      "col": 7,
      "row": 3
    }
  },
  {
    "assetId": "oryx_r03_c08",
    "name": "Crimson Wand",
    "family": "wand",
    "style": "rapier",
    "tags": [
      "crimson",
      "crit_chance",
      "hit_chance",
      "on_hit_burn",
      "red",
      "strength",
      "wand",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "on_hit_burn",
        "weight": 0.286
      },
      {
        "effect": "strength",
        "weight": 0.429
      }
    ],
    "sprite": {
      "col": 8,
      "row": 3
    }
  },
  {
    "assetId": "oryx_r03_c09",
    "name": "Amber Wand",
    "family": "wand",
    "style": "rapier",
    "tags": [
      "amber",
      "crit_chance",
      "execute_damage",
      "hit_chance",
      "orange",
      "strength",
      "wand",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "execute_damage",
        "weight": 0.321
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "strength",
        "weight": 0.393
      }
    ],
    "sprite": {
      "col": 9,
      "row": 3
    }
  },
  {
    "assetId": "oryx_r03_c10",
    "name": "Azure Wand",
    "family": "wand",
    "style": "rapier",
    "tags": [
      "azure",
      "crit_chance",
      "cyan",
      "hit_chance",
      "on_hit_freeze",
      "wand",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.536
      },
      {
        "effect": "on_hit_freeze",
        "weight": 0.357
      }
    ],
    "sprite": {
      "col": 10,
      "row": 3
    }
  },
  {
    "assetId": "oryx_r07_c19",
    "name": "Sunlit Rod",
    "family": "rod",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "hit_chance",
      "luck_pool_bonus",
      "on_hit_shock",
      "rod",
      "sunlit",
      "weapon",
      "yellow"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "on_hit_shock",
        "weight": 0.357
      }
    ],
    "sprite": {
      "col": 19,
      "row": 7
    }
  },
  {
    "assetId": "oryx_r07_c20",
    "name": "Golden Rod",
    "family": "rod",
    "style": "rapier",
    "tags": [
      "boss_damage",
      "crit_chance",
      "gold",
      "golden",
      "hit_chance",
      "luck_pool_bonus",
      "rod",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 20,
      "row": 7
    }
  },
  {
    "assetId": "oryx_r08_c01",
    "name": "Golden Staff",
    "family": "staff",
    "style": "rapier",
    "tags": [
      "boss_damage",
      "crit_chance",
      "gold",
      "golden",
      "hit_chance",
      "luck_pool_bonus",
      "staff",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 1,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c02",
    "name": "Amber Staff",
    "family": "staff",
    "style": "rapier",
    "tags": [
      "amber",
      "crit_chance",
      "execute_damage",
      "hit_chance",
      "orange",
      "staff",
      "strength",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "execute_damage",
        "weight": 0.321
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "strength",
        "weight": 0.393
      }
    ],
    "sprite": {
      "col": 2,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c03",
    "name": "Sunlit Mace",
    "family": "mace",
    "style": "axe",
    "tags": [
      "mace",
      "stagger",
      "strength",
      "sunlit",
      "weapon",
      "weapon_damage",
      "yellow"
    ],
    "effects": [
      {
        "effect": "stagger",
        "weight": 0.35
      },
      {
        "effect": "strength",
        "weight": 0.1
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 3,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c04",
    "name": "Viridian Staff",
    "family": "staff",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "damage_roll_quality",
      "dexterity",
      "green",
      "hit_chance",
      "on_hit_poison",
      "staff",
      "viridian",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.179
      },
      {
        "effect": "dexterity",
        "weight": 0.25
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "on_hit_poison",
        "weight": 0.286
      }
    ],
    "sprite": {
      "col": 4,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c05",
    "name": "Golden Staff",
    "family": "staff",
    "style": "rapier",
    "tags": [
      "boss_damage",
      "crit_chance",
      "gold",
      "golden",
      "hit_chance",
      "luck_pool_bonus",
      "staff",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 5,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c06",
    "name": "Silver Staff",
    "family": "staff",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "hit_chance",
      "silver",
      "staff",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.429
      },
      {
        "effect": "hit_chance",
        "weight": 0.571
      }
    ],
    "sprite": {
      "col": 6,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c07",
    "name": "Golden Mace",
    "family": "mace",
    "style": "axe",
    "tags": [
      "boss_damage",
      "crit_chance",
      "gold",
      "golden",
      "hit_chance",
      "luck_pool_bonus",
      "mace",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 7,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c08",
    "name": "Sunlit Mace",
    "family": "mace",
    "style": "axe",
    "tags": [
      "mace",
      "stagger",
      "strength",
      "sunlit",
      "weapon",
      "weapon_damage",
      "yellow"
    ],
    "effects": [
      {
        "effect": "stagger",
        "weight": 0.35
      },
      {
        "effect": "strength",
        "weight": 0.1
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 8,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c09",
    "name": "Azure Mace",
    "family": "mace",
    "style": "axe",
    "tags": [
      "azure",
      "crit_chance",
      "cyan",
      "hit_chance",
      "mace",
      "on_hit_freeze",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.536
      },
      {
        "effect": "on_hit_freeze",
        "weight": 0.357
      }
    ],
    "sprite": {
      "col": 9,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c10",
    "name": "Simple Hammer",
    "family": "hammer",
    "style": "axe",
    "tags": [
      "boss_damage",
      "crit_chance",
      "gold",
      "hammer",
      "hit_chance",
      "luck_pool_bonus",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 10,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c11",
    "name": "Iron Hammer",
    "family": "hammer",
    "style": "axe",
    "tags": [
      "boss_damage",
      "crit_chance",
      "gold",
      "hammer",
      "hit_chance",
      "iron",
      "luck_pool_bonus",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 11,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c12",
    "name": "Sunlit Hammer",
    "family": "hammer",
    "style": "axe",
    "tags": [
      "crit_chance",
      "hammer",
      "hit_chance",
      "luck_pool_bonus",
      "on_hit_shock",
      "sunlit",
      "weapon",
      "yellow"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "on_hit_shock",
        "weight": 0.357
      }
    ],
    "sprite": {
      "col": 12,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c13",
    "name": "Simple Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "boss_damage",
      "crit_chance",
      "gold",
      "hit_chance",
      "luck_pool_bonus",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 13,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c14",
    "name": "Improved Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "boss_damage",
      "crit_chance",
      "gold",
      "hit_chance",
      "luck_pool_bonus",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 14,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c15",
    "name": "Double Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "boss_damage",
      "crit_chance",
      "gold",
      "hit_chance",
      "luck_pool_bonus",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 15,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c16",
    "name": "Crimson Double Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "crimson",
      "crit_chance",
      "hit_chance",
      "on_hit_burn",
      "red",
      "strength",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "on_hit_burn",
        "weight": 0.286
      },
      {
        "effect": "strength",
        "weight": 0.429
      }
    ],
    "sprite": {
      "col": 16,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c17",
    "name": "Sunlit Double Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "crit_chance",
      "hit_chance",
      "luck_pool_bonus",
      "on_hit_shock",
      "sunlit",
      "weapon",
      "yellow"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "on_hit_shock",
        "weight": 0.357
      }
    ],
    "sprite": {
      "col": 17,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c18",
    "name": "Azure Double Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "azure",
      "crit_chance",
      "cyan",
      "hit_chance",
      "on_hit_freeze",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.536
      },
      {
        "effect": "on_hit_freeze",
        "weight": 0.357
      }
    ],
    "sprite": {
      "col": 18,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c19",
    "name": "Crimson Double Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "crimson",
      "crit_chance",
      "hit_chance",
      "on_hit_burn",
      "red",
      "strength",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      },
      {
        "effect": "on_hit_burn",
        "weight": 0.286
      },
      {
        "effect": "strength",
        "weight": 0.429
      }
    ],
    "sprite": {
      "col": 19,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c20",
    "name": "Golden Double Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "boss_damage",
      "crit_chance",
      "gold",
      "golden",
      "hit_chance",
      "luck_pool_bonus",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 20,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c21",
    "name": "Guardian Double Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "boss_damage",
      "crit_chance",
      "gold",
      "hit_chance",
      "luck_pool_bonus",
      "weapon"
    ],
    "effects": [
      {
        "effect": "boss_damage",
        "weight": 0.357
      },
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.179
      }
    ],
    "sprite": {
      "col": 21,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r08_c22",
    "name": "Azure Double Axe",
    "family": "axe",
    "style": "axe",
    "tags": [
      "axe",
      "azure",
      "crit_chance",
      "cyan",
      "hit_chance",
      "on_hit_freeze",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.107
      },
      {
        "effect": "hit_chance",
        "weight": 0.536
      },
      {
        "effect": "on_hit_freeze",
        "weight": 0.357
      }
    ],
    "sprite": {
      "col": 22,
      "row": 8
    }
  },
  {
    "assetId": "oryx_r09_c01",
    "name": "Wooden Stick",
    "family": "stick",
    "style": "axe",
    "tags": [
      "gold",
      "stagger",
      "stick",
      "strength",
      "weapon",
      "weapon_damage",
      "wooden"
    ],
    "effects": [
      {
        "effect": "stagger",
        "weight": 0.35
      },
      {
        "effect": "strength",
        "weight": 0.1
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 1,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c02",
    "name": "Golden Cane",
    "family": "cane",
    "style": "axe",
    "tags": [
      "cane",
      "gold",
      "golden",
      "stagger",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "stagger",
        "weight": 0.35
      },
      {
        "effect": "strength",
        "weight": 0.1
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 2,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c03",
    "name": "Stick",
    "family": "stick",
    "style": "axe",
    "tags": [
      "gold",
      "stagger",
      "stick",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "stagger",
        "weight": 0.35
      },
      {
        "effect": "strength",
        "weight": 0.1
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 3,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c04",
    "name": "Golden Mace",
    "family": "mace",
    "style": "axe",
    "tags": [
      "gold",
      "golden",
      "mace",
      "stagger",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "stagger",
        "weight": 0.35
      },
      {
        "effect": "strength",
        "weight": 0.1
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 4,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c05",
    "name": "Umber Mace",
    "family": "mace",
    "style": "axe",
    "tags": [
      "brown",
      "mace",
      "stagger",
      "strength",
      "umber",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "stagger",
        "weight": 0.35
      },
      {
        "effect": "strength",
        "weight": 0.1
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 5,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c06",
    "name": "Golden Mace",
    "family": "mace",
    "style": "axe",
    "tags": [
      "gold",
      "golden",
      "mace",
      "stagger",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "stagger",
        "weight": 0.35
      },
      {
        "effect": "strength",
        "weight": 0.1
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 6,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c09",
    "name": "Crimson Spear",
    "family": "spear",
    "style": "rapier",
    "tags": [
      "crimson",
      "first_strike",
      "hit_chance",
      "initiative",
      "red",
      "spear",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "first_strike",
        "weight": 0.35
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      },
      {
        "effect": "weapon_damage",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 9,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c10",
    "name": "Umber Spear",
    "family": "spear",
    "style": "rapier",
    "tags": [
      "brown",
      "first_strike",
      "hit_chance",
      "initiative",
      "spear",
      "umber",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "first_strike",
        "weight": 0.35
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      },
      {
        "effect": "weapon_damage",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 10,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c11",
    "name": "Viridian Spear",
    "family": "spear",
    "style": "rapier",
    "tags": [
      "first_strike",
      "green",
      "hit_chance",
      "initiative",
      "spear",
      "viridian",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "first_strike",
        "weight": 0.35
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      },
      {
        "effect": "weapon_damage",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 11,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c12",
    "name": "Azure Spear",
    "family": "spear",
    "style": "rapier",
    "tags": [
      "azure",
      "cyan",
      "first_strike",
      "hit_chance",
      "initiative",
      "spear",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "first_strike",
        "weight": 0.35
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      },
      {
        "effect": "weapon_damage",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 12,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c13",
    "name": "Viridian Spear",
    "family": "spear",
    "style": "rapier",
    "tags": [
      "first_strike",
      "green",
      "hit_chance",
      "initiative",
      "spear",
      "viridian",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "first_strike",
        "weight": 0.35
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      },
      {
        "effect": "weapon_damage",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 13,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c14",
    "name": "Ivory Mace",
    "family": "mace",
    "style": "axe",
    "tags": [
      "first_strike",
      "hit_chance",
      "initiative",
      "ivory",
      "mace",
      "weapon",
      "weapon_damage",
      "white"
    ],
    "effects": [
      {
        "effect": "first_strike",
        "weight": 0.35
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      },
      {
        "effect": "weapon_damage",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 14,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c15",
    "name": "Simple Bow",
    "family": "bow",
    "style": "rapier",
    "tags": [
      "bow",
      "crit_chance",
      "gold",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.2
      },
      {
        "effect": "strength",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 15,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c16",
    "name": "Golden Bow",
    "family": "bow",
    "style": "rapier",
    "tags": [
      "bow",
      "crit_chance",
      "gold",
      "golden",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.2
      },
      {
        "effect": "strength",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 16,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c17",
    "name": "Silver Bow",
    "family": "bow",
    "style": "rapier",
    "tags": [
      "bow",
      "crit_chance",
      "silver",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.2
      },
      {
        "effect": "strength",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 17,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c18",
    "name": "Azure Bow",
    "family": "bow",
    "style": "rapier",
    "tags": [
      "azure",
      "bow",
      "crit_chance",
      "cyan",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.2
      },
      {
        "effect": "strength",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 18,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c19",
    "name": "Sunlit Bow",
    "family": "bow",
    "style": "rapier",
    "tags": [
      "bow",
      "crit_chance",
      "strength",
      "sunlit",
      "weapon",
      "weapon_damage",
      "yellow"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.2
      },
      {
        "effect": "strength",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 19,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c20",
    "name": "Golden Crossbow",
    "family": "crossbow",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "crossbow",
      "gold",
      "golden",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.2
      },
      {
        "effect": "strength",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 20,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c21",
    "name": "Silver Crossbow",
    "family": "crossbow",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "crossbow",
      "silver",
      "strength",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.2
      },
      {
        "effect": "strength",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 21,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r09_c22",
    "name": "Sunlit Crossbow",
    "family": "crossbow",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "crossbow",
      "strength",
      "sunlit",
      "weapon",
      "weapon_damage",
      "yellow"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.2
      },
      {
        "effect": "strength",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.55
      }
    ],
    "sprite": {
      "col": 22,
      "row": 9
    }
  },
  {
    "assetId": "oryx_r10_c01",
    "name": "Simple Dagger",
    "family": "dagger",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "dagger",
      "damage_roll_quality",
      "double_strike",
      "gold",
      "hit_chance",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.25
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.25
      },
      {
        "effect": "double_strike",
        "weight": 0.3
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 1,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c02",
    "name": "Sharpened Dagger",
    "family": "dagger",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "dagger",
      "damage_roll_quality",
      "double_strike",
      "gold",
      "hit_chance",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.25
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.25
      },
      {
        "effect": "double_strike",
        "weight": 0.3
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 2,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c03",
    "name": "Sunlit Dagger",
    "family": "dagger",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "dagger",
      "damage_roll_quality",
      "double_strike",
      "hit_chance",
      "sunlit",
      "weapon",
      "yellow"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.25
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.25
      },
      {
        "effect": "double_strike",
        "weight": 0.3
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 3,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c04",
    "name": "Golden Dagger",
    "family": "dagger",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "dagger",
      "damage_roll_quality",
      "double_strike",
      "gold",
      "golden",
      "hit_chance",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.25
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.25
      },
      {
        "effect": "double_strike",
        "weight": 0.3
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 4,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c05",
    "name": "Ivory Dagger",
    "family": "dagger",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "dagger",
      "damage_roll_quality",
      "double_strike",
      "hit_chance",
      "ivory",
      "weapon",
      "white"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.25
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.25
      },
      {
        "effect": "double_strike",
        "weight": 0.3
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 5,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c06",
    "name": "Azure Dagger",
    "family": "dagger",
    "style": "rapier",
    "tags": [
      "azure",
      "crit_chance",
      "cyan",
      "dagger",
      "damage_roll_quality",
      "double_strike",
      "hit_chance",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.25
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.25
      },
      {
        "effect": "double_strike",
        "weight": 0.3
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 6,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c07",
    "name": "Umber Dagger",
    "family": "dagger",
    "style": "rapier",
    "tags": [
      "brown",
      "crit_chance",
      "dagger",
      "damage_roll_quality",
      "double_strike",
      "hit_chance",
      "umber",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.25
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.25
      },
      {
        "effect": "double_strike",
        "weight": 0.3
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 7,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c08",
    "name": "Iron Dagger",
    "family": "dagger",
    "style": "rapier",
    "tags": [
      "crit_chance",
      "dagger",
      "damage_roll_quality",
      "double_strike",
      "hit_chance",
      "iron",
      "orange",
      "weapon"
    ],
    "effects": [
      {
        "effect": "crit_chance",
        "weight": 0.25
      },
      {
        "effect": "damage_roll_quality",
        "weight": 0.25
      },
      {
        "effect": "double_strike",
        "weight": 0.3
      },
      {
        "effect": "hit_chance",
        "weight": 0.2
      }
    ],
    "sprite": {
      "col": 8,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c09",
    "name": "Silver Saber",
    "family": "saber",
    "style": "sword",
    "tags": [
      "execute_damage",
      "saber",
      "silver",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "execute_damage",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.75
      }
    ],
    "sprite": {
      "col": 9,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c10",
    "name": "Viridian Saber",
    "family": "saber",
    "style": "sword",
    "tags": [
      "execute_damage",
      "green",
      "saber",
      "viridian",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "execute_damage",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.75
      }
    ],
    "sprite": {
      "col": 10,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c11",
    "name": "Silver Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "execute_damage",
      "silver",
      "sword",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "execute_damage",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.75
      }
    ],
    "sprite": {
      "col": 11,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c12",
    "name": "Silver Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "execute_damage",
      "silver",
      "sword",
      "weapon",
      "weapon_damage"
    ],
    "effects": [
      {
        "effect": "execute_damage",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.75
      }
    ],
    "sprite": {
      "col": 12,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c13",
    "name": "Sunlit Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "execute_damage",
      "sunlit",
      "sword",
      "weapon",
      "weapon_damage",
      "yellow"
    ],
    "effects": [
      {
        "effect": "execute_damage",
        "weight": 0.25
      },
      {
        "effect": "weapon_damage",
        "weight": 0.75
      }
    ],
    "sprite": {
      "col": 13,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c14",
    "name": "Sunlit Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "armor_flat_reduction",
      "guard_first_hit",
      "max_hp",
      "sunlit",
      "sword",
      "weapon",
      "yellow"
    ],
    "effects": [
      {
        "effect": "max_hp",
        "weight": 0.15
      }
    ],
    "sprite": {
      "col": 14,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c15",
    "name": "Azure Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "armor_flat_reduction",
      "azure",
      "cyan",
      "guard_first_hit",
      "max_hp",
      "sword",
      "weapon"
    ],
    "effects": [
      {
        "effect": "max_hp",
        "weight": 0.15
      }
    ],
    "sprite": {
      "col": 15,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c16",
    "name": "Umber Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "armor_flat_reduction",
      "brown",
      "guard_first_hit",
      "max_hp",
      "sword",
      "umber",
      "weapon"
    ],
    "effects": [
      {
        "effect": "max_hp",
        "weight": 0.15
      }
    ],
    "sprite": {
      "col": 16,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c17",
    "name": "Silver Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "armor_flat_reduction",
      "guard_first_hit",
      "max_hp",
      "silver",
      "sword",
      "weapon"
    ],
    "effects": [
      {
        "effect": "max_hp",
        "weight": 0.15
      }
    ],
    "sprite": {
      "col": 17,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c19",
    "name": "Crimson Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "armor_flat_reduction",
      "crimson",
      "guard_first_hit",
      "max_hp",
      "red",
      "sword",
      "weapon"
    ],
    "effects": [
      {
        "effect": "max_hp",
        "weight": 0.15
      }
    ],
    "sprite": {
      "col": 19,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c20",
    "name": "Ivory Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "armor_flat_reduction",
      "guard_first_hit",
      "ivory",
      "max_hp",
      "sword",
      "weapon",
      "white"
    ],
    "effects": [
      {
        "effect": "max_hp",
        "weight": 0.15
      }
    ],
    "sprite": {
      "col": 20,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c21",
    "name": "Silver Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "armor_flat_reduction",
      "guard_first_hit",
      "max_hp",
      "silver",
      "sword",
      "weapon"
    ],
    "effects": [
      {
        "effect": "max_hp",
        "weight": 0.15
      }
    ],
    "sprite": {
      "col": 21,
      "row": 10
    }
  },
  {
    "assetId": "oryx_r10_c22",
    "name": "Iron Sword",
    "family": "sword",
    "style": "sword",
    "tags": [
      "armor_flat_reduction",
      "gray",
      "guard_first_hit",
      "iron",
      "max_hp",
      "sword",
      "weapon"
    ],
    "effects": [
      {
        "effect": "max_hp",
        "weight": 0.15
      }
    ],
    "sprite": {
      "col": 22,
      "row": 10
    }
  }
];
