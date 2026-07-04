# Oryx Item Sprite Mapping

Source: `/Users/damirshamanaev/Downloads/oryx_16-bit_fantasy_1.1/oryx_16bit_fantasy_items_trans.png`
Grid: `24 x 19` tiles, `16 px` each.
Detected item sprites: `308`.
Ignored non-item/footer occupied tiles: `29`.

This is a v0 semantic catalog. Detection is exact grid/alpha slicing; item names
and effects are intentionally editable design guesses.

Important HP rule: wearable HP-like sprites become `max_hp`,
`guard_first_hit`, or `armor_flat_reduction` effects. Health potions are the
exception: they are instant consumables that restore current HP and are not
stored as gear.

## Runtime Status

- `live`: 14
- `planned`: 294

## Slot Counts

- `amulet`: 7
- `body`: 50
- `boots`: 11
- `charm`: 3
- `consumable`: 23
- `currency`: 4
- `helmet`: 21
- `material`: 32
- `neutral`: 10
- `pack`: 7
- `relic`: 33
- `ring`: 9
- `rune`: 5
- `shield`: 15
- `supply`: 8
- `weapon`: 70

## Family Counts

- `amulet`: 7
- `armor`: 17
- `axe`: 10
- `belt`: 8
- `bone`: 1
- `book`: 10
- `boots`: 11
- `bow`: 5
- `candle`: 2
- `cane`: 1
- `clock`: 1
- `coin`: 4
- `component`: 4
- `cross`: 2
- `crossbow`: 3
- `crown`: 2
- `cut_gem`: 1
- `dagger`: 8
- `elixir`: 7
- `eye`: 1
- `feather`: 2
- `garment`: 3
- `gem`: 6
- `gloves`: 7
- `hammer`: 3
- `heart`: 4
- `heart_charm`: 3
- `helmet`: 14
- `herb`: 3
- `hood`: 7
- `key`: 6
- `light`: 2
- `mace`: 8
- `mushroom`: 2
- `orb`: 11
- `pack`: 7
- `ring`: 9
- `robe`: 7
- `rod`: 2
- `round_potion`: 7
- `rune`: 5
- `saber`: 2
- `scroll`: 2
- `shield`: 15
- `skull`: 3
- `spear`: 5
- `staff`: 5
- `stick`: 2
- `stone`: 7
- `supply`: 2
- `sword`: 11
- `teardrop_gem`: 5
- `torch`: 2
- `trousers`: 8
- `vial`: 7
- `volatile_orb`: 4
- `wand`: 5

## Most Used Effect Primitives

- `luck_pool_bonus`: 99
- `max_hp`: 98
- `guard_first_hit`: 98
- `hit_chance`: 93
- `crit_chance`: 90
- `dexterity`: 76
- `reroll_token`: 58
- `strength`: 55
- `armor_flat_reduction`: 51
- `initiative`: 49
- `boss_damage`: 42
- `weapon_damage`: 29
- `merchant_discount`: 27
- `execute_damage`: 26
- `first_strike`: 24
- `double_strike`: 24
- `damage_roll_quality`: 22
- `on_hit_shock`: 19
- `on_hit_burn`: 17
- `crit_damage`: 14

## Row Intent

- row `01`: vials, potions, elixirs, volatile orbs
- row `02`: rings, crystals, gems
- row `03`: books, components, runes, heart charms
- row `04`: orbs, provisions, key charms, heart charms
- row `05`: orbs, supplies, herbs, coins
- row `06`: helmets, packs, garments, coins
- row `07`: wands, staves, rods
- row `08`: staves, rods, wands
- row `09`: maces, spears, swords
- row `10`: daggers, axes, shields
- row `11`: boots, amulets, robes
- row `12`: hoods, amulets, armor
- row `13`: boots, cloaks, armor
- row `14`: boots, cloaks, armor

## Example Entries

- `oryx_r01_c01` `Azure Vial` slot=`consumable` family=`vial` effects=`hit_chance:0.417, on_hit_freeze:0.417, reroll_token:0.167`
- `oryx_r01_c02` `Amethyst Vial` slot=`consumable` family=`vial` effects=`crit_damage:0.458, curse_power:0.375, reroll_token:0.167`
- `oryx_r01_c03` `Crimson Vial` slot=`consumable` family=`vial` effects=`on_hit_burn:0.333, reroll_token:0.167, strength:0.5`
- `oryx_r01_c04` `Viridian Vial` slot=`consumable` family=`vial` effects=`damage_roll_quality:0.208, dexterity:0.292, on_hit_poison:0.333, reroll_token:0.167`
- `oryx_r01_c05` `Sunlit Vial` slot=`consumable` family=`vial` effects=`luck_pool_bonus:0.417, on_hit_shock:0.417, reroll_token:0.167`
- `oryx_r01_c06` `Golden Vial` slot=`consumable` family=`vial` effects=`boss_damage:0.417, luck_pool_bonus:0.417, reroll_token:0.167`
- `oryx_r01_c07` `Azure Potion` slot=`consumable` family=`round_potion` effects=`hit_chance:0.417, on_hit_freeze:0.417, reroll_token:0.167`
- `oryx_r01_c08` `Amethyst Potion` slot=`consumable` family=`round_potion` effects=`crit_damage:0.458, curse_power:0.375, reroll_token:0.167`
- `oryx_r01_c09` `Crimson Potion` slot=`consumable` family=`round_potion` effects=`on_hit_burn:0.333, reroll_token:0.167, strength:0.5`
- `oryx_r01_c10` `Viridian Potion` slot=`consumable` family=`round_potion` effects=`damage_roll_quality:0.208, dexterity:0.292, on_hit_poison:0.333, reroll_token:0.167`
- `oryx_r01_c11` `Sunlit Potion` slot=`consumable` family=`round_potion` effects=`luck_pool_bonus:0.417, on_hit_shock:0.417, reroll_token:0.167`
- `oryx_r01_c12` `Golden Potion` slot=`consumable` family=`round_potion` effects=`boss_damage:0.417, luck_pool_bonus:0.417, reroll_token:0.167`
- `oryx_r06_c11` `Jade Pack` slot=`pack` family=`pack` effects=`dexterity:0.368, luck_pool_bonus:0.368, reroll_token:0.263`
- `oryx_r06_c12` `Jade Pack` slot=`pack` family=`pack` effects=`dexterity:0.368, luck_pool_bonus:0.368, reroll_token:0.263`
- `oryx_r06_c13` `Jade Pack` slot=`pack` family=`pack` effects=`dexterity:0.368, luck_pool_bonus:0.368, reroll_token:0.263`
- `oryx_r06_c14` `Jade Garb` slot=`body` family=`garment` effects=`crit_chance:0.136, dexterity:0.545, guard_first_hit:0.136, initiative:0.182`
- `oryx_r06_c15` `Jade Garb` slot=`body` family=`garment` effects=`crit_chance:0.136, dexterity:0.545, guard_first_hit:0.136, initiative:0.182`
- `oryx_r06_c16` `Jade Garb` slot=`body` family=`garment` effects=`crit_chance:0.136, dexterity:0.545, guard_first_hit:0.136, initiative:0.182`
- `oryx_r06_c17` `Crimson Orb` slot=`relic` family=`orb` effects=`crit_chance:0.111, dexterity:0.185, guard_first_hit:0.111, initiative:0.148, strength:0.444`
- `oryx_r06_c18` `Golden Orb` slot=`relic` family=`orb` effects=`crit_chance:0.12, dexterity:0.2, guard_first_hit:0.12, initiative:0.16, luck_pool_bonus:0.4`
- `oryx_r06_c19` `Viridian Orb` slot=`relic` family=`orb` effects=`dexterity:0.292, luck_pool_bonus:0.542, merchant_discount:0.167`
- `oryx_r06_c20` `Azure Orb` slot=`relic` family=`orb` effects=`hit_chance:0.37, luck_pool_bonus:0.481, merchant_discount:0.148`
- `oryx_r06_c21` `Sapphire Orb` slot=`relic` family=`orb` effects=`guard_first_hit:0.37, luck_pool_bonus:0.481, merchant_discount:0.148`
- `oryx_r06_c22` `Amethyst Orb` slot=`relic` family=`orb` effects=`crit_damage:0.393, luck_pool_bonus:0.464, merchant_discount:0.143`
- `oryx_r14_c11` `Silver Boots` slot=`boots` family=`boots` effects=`crit_chance:0.115, dexterity:0.192, guard_first_hit:0.115, hit_chance:0.423, initiative:0.154`
- `oryx_r14_c12` `Leather Trousers` slot=`body` family=`trousers` effects=`crit_chance:0.12, dexterity:0.2, guard_first_hit:0.12, initiative:0.16, luck_pool_bonus:0.4`
- `oryx_r14_c13` `Hunter Trousers` slot=`body` family=`trousers` effects=`crit_chance:0.136, dexterity:0.545, guard_first_hit:0.136, initiative:0.182`
- `oryx_r14_c14` `Strengthened Leather Trousers` slot=`body` family=`trousers` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
- `oryx_r14_c15` `Iron Trousers` slot=`body` family=`trousers` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
- `oryx_r14_c16` `Stell Trousers` slot=`body` family=`trousers` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
- `oryx_r14_c17` `Sunlit Trousers` slot=`body` family=`trousers` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
- `oryx_r14_c18` `Crimson Trousers` slot=`body` family=`trousers` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
- `oryx_r14_c19` `Azure Trousers` slot=`body` family=`trousers` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
- `oryx_r14_c20` `Silver Armor` slot=`body` family=`armor` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
- `oryx_r14_c21` `Viridian Armor` slot=`body` family=`armor` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
- `oryx_r14_c22` `Viridian Armor` slot=`body` family=`armor` effects=`armor_flat_reduction:0.45, guard_first_hit:0.2, max_hp:0.35`
