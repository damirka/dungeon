import unittest
from pathlib import Path

from dungeon_balance.loot import LootConfig
from dungeon_balance.config import BalanceConfig


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "public" / "legacy" / "tactical_playtest.html").read_text(encoding="utf-8")
TACTICAL_VISUALS = (ROOT / "data" / "tactical_enemy_visuals.js").read_text(encoding="utf-8")


def js_object_number(object_name: str, name: str) -> float:
    object_marker = f"const {object_name} = {{"
    object_start = HTML.find(object_marker)
    if object_start < 0:
        raise AssertionError(f"Missing JS object: {object_name}")
    object_end = HTML.find("\n    };", object_start)
    if object_end < 0:
        raise AssertionError(f"Unterminated JS object: {object_name}")
    block = HTML[object_start:object_end]

    marker = f"{name}: "
    start = block.find(marker)
    if start < 0:
        raise AssertionError(f"Missing {object_name} constant: {name}")
    start += len(marker)
    comma = block.find(",", start)
    newline = block.find("\n", start)
    end = newline if comma < 0 or (newline >= 0 and newline < comma) else comma
    if end < 0:
        end = len(block)
    if end < 0:
        raise AssertionError(f"Unterminated {object_name} constant: {name}")
    return float(block[start:end].strip())


def js_combat_number(name: str) -> float:
    return js_object_number("COMBAT", name)


def js_tactical_number(name: str) -> float:
    return js_object_number("TACTICAL", name)


def js_stats_number(name: str) -> float:
    return js_object_number("STATS", name)


def js_loot_number(name: str) -> float:
    return js_object_number("LOOT", name)


def js_dungeon_number(name: str) -> float:
    return js_object_number("DUNGEON", name)


class TacticalPlaytestHtmlTests(unittest.TestCase):
    def test_playtest_loads_curated_creature_catalog(self) -> None:
        self.assertIn("/data/tactical_enemy_visuals.js", HTML)
        self.assertIn("/data/oryx_creature_fx_catalog_seed.js", HTML)
        self.assertIn("/data/oryx_item_catalog_seed.js", HTML)
        self.assertIn("ORYX_CREATURE_FX_SEED_CATALOG", HTML)
        self.assertIn("ORYX_SEED_CATALOG", HTML)
        self.assertIn("TACTICAL_ENEMY_VISUALS", HTML)
        self.assertIn("ENEMY_VISUAL_POOLS", HTML)
        self.assertIn("BOSS_VISUALS", HTML)

    def test_weapon_loot_uses_mapped_item_assets(self) -> None:
        self.assertIn("const MAPPED_WEAPON_TEMPLATES", HTML)
        self.assertIn("function makeMappedWeaponShell", HTML)
        self.assertIn("function applyMappedWeaponEffect", HTML)
        self.assertIn("assetId: template.assetId", HTML)
        self.assertIn("sprite: template.sprite", HTML)

    def test_playtest_prefers_dungeon_level_enemy_assignments(self) -> None:
        self.assertIn("LEVEL_ASSIGNED_ENEMIES", HTML)
        self.assertIn("normalizedDungeonLevel", HTML)
        self.assertIn("entry?.dungeon_level", HTML)
        self.assertIn("function levelVisualPool(level, key)", HTML)
        self.assertIn("function bossVisualPool(level)", HTML)
        self.assertIn("if (!assigned.length) return legacyVisualPool(key);", HTML)
        self.assertNotIn("if (isBoss) return creatureEntry(BOSS_VISUALS[level]);", HTML)

    def test_playtest_renders_creature_sprite_avatars(self) -> None:
        self.assertIn("visualFrame", HTML)
        self.assertIn("creatureSpriteStyle", HTML)
        self.assertIn("enemy-sprite", HTML)
        self.assertIn("/assets/oryx_items.png", HTML)
        self.assertIn("/assets/oryx_creatures.png", HTML)
        self.assertIn("cre_p06_c02", TACTICAL_VISUALS)
        self.assertIn("cre_p10_c04", TACTICAL_VISUALS)
        self.assertIn("cre_p08_c14", TACTICAL_VISUALS)

    def test_support_intents_use_intent_weighted_choice(self) -> None:
        self.assertIn("function weightedIntentChoice(candidates)", HTML)
        self.assertIn("return candidate.intent", HTML)
        self.assertIn("weightedIntentChoice(candidates.filter", HTML)

    def test_playtest_randomizes_dungeon_on_each_reset(self) -> None:
        self.assertIn("const POWER_BANDS = {", HTML)
        self.assertIn("const BOSS_ORDER = [", HTML)
        self.assertIn("function bossArchetypeKey(level)", HTML)
        self.assertIn("function encounterPowerLevel(level, slot)", HTML)
        self.assertIn("function powerProfileWeights(powerLevel, level)", HTML)
        self.assertIn("function supportArchetypeKey(leadKey, band, powerLevel)", HTML)
        self.assertIn("function buildPowerRoom(level, slot)", HTML)
        self.assertIn("const bossKey = bossArchetypeKey(level);", HTML)
        self.assertIn('`power-${powerLevel}`', HTML)
        self.assertIn("let dungeon = [];", HTML)
        self.assertIn("dungeon = buildDungeon();", HTML)
        self.assertNotIn("const dungeon = buildDungeon();", HTML)
        self.assertNotIn("ORDER[(level + slot - 1) % ORDER.length]", HTML)
        self.assertNotIn("const bossKey = randomChoice(ORDER);", HTML)

    def test_auto_combat_uses_heuristic_targeting(self) -> None:
        self.assertIn("function autoTargetIndex()", HTML)
        self.assertIn('enemy.tags.includes("mage-support")', HTML)
        self.assertIn("function autoCombatChoice()", HTML)
        self.assertIn("function shouldQuickBoss(target)", HTML)
        self.assertIn("function shouldQuickSingleTarget(target)", HTML)
        self.assertIn("function shouldHeavySingleTarget(target, incoming)", HTML)
        self.assertIn("function shouldHeavyDefault(target, incoming)", HTML)
        self.assertIn("function lootChoiceScore(item)", HTML)
        self.assertIn("function skipLoot()", HTML)
        self.assertIn('target.tags.includes("boss")', HTML)
        self.assertIn('if (shouldQuickBoss(target)) return { action: "quick", targetIndex };', HTML)
        self.assertIn('if (target.intent === "guard" && canAffordAction("heavy")) return { action: "heavy", targetIndex };', HTML)
        self.assertIn('slotForItem(activeItem) === slot', HTML)
        self.assertIn('data-skip-loot="true"', HTML)
        self.assertNotIn("const bestFocused = alive.flatMap", HTML)

    def test_default_playtest_loadout_matches_sim_baseline(self) -> None:
        self.assertIn('<span class="build-tag" id="buildTag">character: Balanced Swordsman</span>', HTML)
        self.assertIn('<option value="balancedSwordsman" selected>Balanced Swordsman</option>', HTML)
        self.assertIn('<option value="axeBruiser" disabled>Axe Bruiser - locked</option>', HTML)
        self.assertIn('let selectedCharacterId = "balancedSwordsman";', HTML)
        self.assertIn('$("characterSelect").value = selectedCharacterId;', HTML)
        self.assertIn('weights: { hp: 1, strength: 1, dexterity: 1 }', HTML)
        self.assertIn('id="exportBtn"', HTML)
        self.assertIn("function runExportPayload()", HTML)

    def test_playtest_has_knight_base_ability_action(self) -> None:
        self.assertIn('data-action="ability"', HTML)
        self.assertIn('id: "riposte"', HTML)
        self.assertIn('name: "Riposte"', HTML)
        self.assertIn("manaCost: 2", HTML)
        self.assertIn("counterDamageMultiplier: 0.82", HTML)
        self.assertIn("counterTriggers: 1", HTML)
        self.assertIn("function abilityComment(ability = activeAbility())", HTML)
        self.assertIn("Riposte: ${normal} less incoming", HTML)
        self.assertIn("function riposteAutoAvailable(enemies = state.enemies)", HTML)
        self.assertIn("function resolveRiposte(enemy, ability)", HTML)
        self.assertIn("riposte-ready", HTML)
        self.assertIn("abilityCharges", HTML)
        self.assertIn("function canAffordAction(action)", HTML)
        self.assertIn("function actionManaCost(action)", HTML)
        self.assertIn("function abilityAvailable()", HTML)
        self.assertIn('expectedIncomingDamage("ability")', HTML)
        self.assertIn('if (riposteAutoAvailable(alive) && incoming >=', HTML)
        self.assertIn("button.disabled = !live || !actionReady;", HTML)

    def test_playtest_labels_quick_pressure_and_fixed_health_bottles(self) -> None:
        self.assertIn("function quickPressureNote(target)", HTML)
        self.assertIn("pressure-ready", HTML)
        self.assertIn('extraClass = "pressure";', HTML)
        self.assertIn("function statLootNote(stat)", HTML)
        self.assertIn("function weaponLootNotes(item)", HTML)
        self.assertIn("function healthBottle(power, isUnique = false)", HTML)
        self.assertIn("crimsonVial: { col: 3, row: 1 }", HTML)
        self.assertIn("crimsonPotion: { col: 9, row: 1 }", HTML)
        self.assertIn("crimsonElixir: { col: 15, row: 1 }", HTML)
        self.assertIn('"Crimson Vial"', HTML)
        self.assertIn('"Crimson Potion"', HTML)
        self.assertIn('"Crimson Elixir"', HTML)
        self.assertIn("sprite: bottle.sprite", HTML)

    def test_playtest_displays_and_spends_mana(self) -> None:
        self.assertIn('id="manaValue"', HTML)
        self.assertIn('id="maxManaValue"', HTML)
        self.assertIn('id="manaBar"', HTML)
        self.assertIn("state.player.mana = Math.max(0, state.player.mana - actionManaCost(action));", HTML)
        self.assertIn("restoreMana();", HTML)
        self.assertIn("need ${manaCost} MP", HTML)
        self.assertIn("Mana: ${humanMana(payload.player.mana)} / ${humanMana(payload.player.maxMana)}", HTML)

    def test_playtest_uses_human_facing_value_formatters(self) -> None:
        self.assertIn("const HUMAN = {", HTML)
        self.assertIn("chanceStep: 0.05", HTML)
        self.assertIn('1: "Low"', HTML)
        self.assertIn('5: "Deadly"', HTML)
        self.assertIn("function humanHp(value)", HTML)
        self.assertIn("function humanDamage(value)", HTML)
        self.assertIn("function humanDamageRange(value)", HTML)
        self.assertIn("function humanStat(value)", HTML)
        self.assertIn("function humanGain(value)", HTML)
        self.assertIn("function powerBandLabel(powerLevel)", HTML)
        self.assertIn("return humanChance(value);", HTML)
        self.assertIn("${humanDamageRange(damage)} dmg", HTML)
        self.assertIn("${humanHp(enemy.hp)} / ${humanHp(enemy.maxHp)} HP", HTML)
        self.assertIn("roomKindLabel(room)", HTML)

    def test_playtest_uses_dungeon_progression_hooks(self) -> None:
        self.assertIn("DUNGEON.currentHpFromMaxHpGainFraction", HTML)
        self.assertIn("recalculatePlayerFromGear(oldMaxHp, DUNGEON.currentHpFromMaxHpGainFraction)", HTML)
        self.assertIn("function applyPassiveRoomHealing(room)", HTML)
        self.assertIn("DUNGEON.postEncounterHealFraction", HTML)
        self.assertIn("DUNGEON.postLevelHealFraction", HTML)

    def test_playtest_combat_curve_matches_python_defaults(self) -> None:
        combat = BalanceConfig().combat

        pairs = (
            ("minPlayerHitChance", combat.min_player_hit_chance),
            ("maxPlayerHitChance", combat.max_player_hit_chance),
            ("basePlayerHitChance", combat.base_player_hit_chance),
            ("dexterityHitScale", combat.dexterity_hit_scale),
            ("dexterityHitExponent", combat.dexterity_hit_exponent),
            ("enemyEvasionHitScale", combat.enemy_evasion_hit_scale),
            ("enemyEvasionExponent", combat.enemy_evasion_exponent),
            ("baseCritChance", combat.base_crit_chance),
            ("dexterityCritScale", combat.dexterity_crit_scale),
            ("dexterityCritExponent", combat.dexterity_crit_exponent),
            ("enemyEvasionCritScale", combat.enemy_evasion_crit_scale),
            ("maxCritChance", combat.max_crit_chance),
            ("critMultiplier", combat.crit_multiplier),
            ("dexterityDamageQualityScale", combat.dexterity_damage_quality_scale),
            ("dexterityDamageQualityExponent", combat.dexterity_damage_quality_exponent),
            ("enemyEvasionDamageQualityScale", combat.enemy_evasion_damage_quality_scale),
            ("enemyEvasionDamageQualityExponent", combat.enemy_evasion_damage_quality_exponent),
            ("maxDamageQuality", combat.max_damage_quality),
            ("basePlayerDamage", combat.base_player_damage),
            ("strengthDamageScale", combat.strength_damage_scale),
            ("strengthDamageExponent", combat.strength_damage_exponent),
            ("damageVariance", combat.damage_variance),
            ("maxCombatRounds", combat.max_combat_rounds),
        )
        for js_name, python_value in pairs:
            with self.subTest(js_name=js_name):
                self.assertEqual(js_combat_number(js_name), python_value)

    def test_playtest_stat_conversion_matches_python_defaults(self) -> None:
        stats = BalanceConfig().stats

        pairs = (
            ("baseHp", stats.base_hp),
            ("baseStrength", stats.base_strength),
            ("baseDexterity", stats.base_dexterity),
            ("hpPerPower", stats.hp_per_point),
            ("strengthPerPower", stats.strength_per_point),
            ("dexterityPerPower", stats.dexterity_per_point),
        )
        for js_name, python_value in pairs:
            with self.subTest(js_name=js_name):
                self.assertEqual(js_stats_number(js_name), python_value)

    def test_playtest_loot_curve_matches_python_defaults(self) -> None:
        loot = LootConfig()

        pairs = (
            ("baseLuckPool", loot.base_luck_pool),
            ("luckPoolGrowth", loot.luck_pool_growth),
            ("normalLuckShare", loot.normal_luck_share),
            ("bossLuckShare", loot.boss_luck_share),
            ("luckVariance", loot.luck_variance),
            ("commonCost", loot.common_cost),
            ("uncommonCost", loot.uncommon_cost),
            ("rareCost", loot.rare_cost),
            ("veryRareCost", loot.very_rare_cost),
            ("epicCost", loot.epic_cost),
            ("legendaryCost", loot.legendary_cost),
            ("luckyOptionChance", loot.lucky_option_chance),
            ("luckyPowerMultiplier", loot.lucky_power_multiplier),
            ("jackpotOptionChance", loot.jackpot_option_chance),
            ("jackpotPowerMultiplier", loot.jackpot_power_multiplier),
            ("uniqueOptionChance", loot.unique_option_chance),
            ("uniquePowerMultiplier", loot.unique_power_multiplier),
            ("focusDraftChance", loot.focus_draft_chance),
            ("earlyFocusDraftBonus", loot.early_focus_draft_bonus),
            ("focusedStatChoiceChance", loot.focused_stat_choice_chance),
            ("minimumUpgradeScore", loot.minimum_upgrade_score),
            ("trainingGainMultiplier", loot.training_gain_multiplier),
            ("statItemWeight", loot.stat_item_weight),
            ("weaponItemWeight", loot.weapon_item_weight),
            ("consumableItemWeight", loot.consumable_item_weight),
            ("potionHpPerPower", loot.potion_hp_per_power),
            ("wearableSlotLimit", loot.wearable_slot_limit),
            ("stashSlotLimit", loot.stash_slot_limit),
            ("weaponEffectUncommonChance", loot.weapon_effect_uncommon_chance),
            ("weaponEffectRareChance", loot.weapon_effect_rare_chance),
            ("weaponEffectEpicChance", loot.weapon_effect_epic_chance),
            ("axeCrushEffectCost", loot.axe_crush_effect_cost),
            ("axeStunEffectCost", loot.axe_stun_effect_cost),
        )
        for js_name, python_value in pairs:
            with self.subTest(js_name=js_name):
                self.assertEqual(js_loot_number(js_name), python_value)

    def test_playtest_tactical_tuning_matches_python_defaults(self) -> None:
        tactical = BalanceConfig().tactical

        pairs = (
            ("attackDamageMultiplier", tactical.attack_damage_multiplier),
            ("heavyDamageMultiplier", tactical.heavy_damage_multiplier),
            ("heavyHitModifier", tactical.heavy_hit_modifier),
            ("heavyEvasionHitPenaltyScale", tactical.heavy_evasion_hit_penalty_scale),
            ("heavyEvasionHitPenaltyFloor", tactical.heavy_evasion_hit_penalty_floor),
            ("heavyEvasionHitPenaltyMax", tactical.heavy_evasion_hit_penalty_max),
            ("heavyGuardIgnore", tactical.heavy_guard_ignore),
            ("sunderDamageBonusPerStack", tactical.sunder_damage_bonus_per_stack),
            ("sunderQuickEffectiveness", tactical.sunder_quick_effectiveness),
            ("sunderHeavyEffectiveness", tactical.sunder_heavy_effectiveness),
            ("sunderMaxStacks", tactical.sunder_max_stacks),
            ("quickDamageMultiplier", tactical.quick_damage_multiplier),
            ("quickHitModifier", tactical.quick_hit_modifier),
            ("quickCritModifier", tactical.quick_crit_modifier),
            ("quickQualityBonus", tactical.quick_quality_bonus),
            ("sweepDamageMultiplier", tactical.sweep_damage_multiplier),
            ("sweepHitModifier", tactical.sweep_hit_modifier),
            ("sweepQualityBonus", tactical.sweep_quality_bonus),
            ("sweepDexterityDamagePerPoint", tactical.sweep_dexterity_damage_per_point),
            ("sweepMaxDexterityDamageBonus", tactical.sweep_max_dexterity_damage_bonus),
            ("sweepGlancingDamageMultiplier", tactical.sweep_glancing_damage_multiplier),
            ("sweepAutoDamageRatio", tactical.sweep_auto_damage_ratio),
            ("doubleStrikeBaseChance", tactical.double_strike_base_chance),
            ("doubleStrikePerDexterity", tactical.double_strike_per_dexterity),
            ("maxDoubleStrikeChance", tactical.max_double_strike_chance),
            ("doubleStrikeDamageMultiplier", tactical.double_strike_damage_multiplier),
            ("quickInterruptBaseChance", tactical.quick_interrupt_base_chance),
            ("quickInterruptPerDexterity", tactical.quick_interrupt_per_dexterity),
            ("maxInterruptChance", tactical.max_interrupt_chance),
            ("playerGuardReduction", tactical.player_guard_reduction),
            ("pierceGuardReduction", tactical.pierce_guard_reduction),
            ("enemyGuardReduction", tactical.enemy_guard_reduction),
            ("strikeDamageMultiplier", tactical.strike_damage_multiplier),
            ("heavyIntentDamageMultiplier", tactical.heavy_intent_damage_multiplier),
            ("heavyIntentHitModifier", tactical.heavy_intent_hit_modifier),
            ("pierceDamageMultiplier", tactical.pierce_damage_multiplier),
            ("pierceHitModifier", tactical.pierce_hit_modifier),
            ("aimAccuracyBonus", tactical.aim_accuracy_bonus),
            ("aimDamageBonus", tactical.aim_damage_bonus),
            ("groupPrimaryHpFactor", tactical.group_primary_hp_factor),
            ("groupPrimaryDamageFactor", tactical.group_primary_damage_factor),
            ("groupSupportHpFactor", tactical.group_support_hp_factor),
            ("groupSupportDamageFactor", tactical.group_support_damage_factor),
            ("mageSupportHpFactor", tactical.mage_support_hp_factor),
            ("mageSupportDamageFactor", tactical.mage_support_damage_factor),
            ("mageSupportAccuracyDelta", tactical.mage_support_accuracy_delta),
            ("mageSupportEvasionFactor", tactical.mage_support_evasion_factor),
            ("supportHealDamageMultiplier", tactical.support_heal_damage_multiplier),
            ("supportShieldDamageMultiplier", tactical.support_shield_damage_multiplier),
            ("supportShieldMaxHpFraction", tactical.support_shield_max_hp_fraction),
            ("supportHealThreshold", tactical.support_heal_threshold),
            ("supportInvisibilityHitPenalty", tactical.support_invisibility_hit_penalty),
            ("maxMana", tactical.max_mana),
            ("startingMana", tactical.starting_mana),
            ("manaRegenPerRound", tactical.mana_regen_per_round),
            ("attackManaCost", tactical.attack_mana_cost),
            ("heavyManaCost", tactical.heavy_mana_cost),
            ("quickManaCost", tactical.quick_mana_cost),
            ("sweepManaCost", tactical.sweep_mana_cost),
            ("guardManaCost", tactical.guard_mana_cost),
        )
        for js_name, python_value in pairs:
            with self.subTest(js_name=js_name):
                self.assertEqual(js_tactical_number(js_name), python_value)

    def test_playtest_dungeon_progression_matches_python_defaults(self) -> None:
        dungeon = BalanceConfig().dungeon

        pairs = (
            ("levels", dungeon.levels),
            ("encountersPerLevel", dungeon.encounters_per_level),
            ("initialStatBudget", dungeon.initial_stat_budget),
            ("statBudgetGainPerEncounter", dungeon.stat_budget_gain_per_encounter),
            ("statBudgetGainPerLevel", dungeon.stat_budget_gain_per_level),
            ("statBudgetGainGrowth", dungeon.stat_budget_gain_growth),
            ("postEncounterHealFraction", dungeon.post_encounter_heal_fraction),
            ("postLevelHealFraction", dungeon.post_level_heal_fraction),
            ("currentHpFromMaxHpGainFraction", dungeon.current_hp_from_max_hp_gain_fraction),
        )
        for js_name, python_value in pairs:
            with self.subTest(js_name=js_name):
                self.assertEqual(js_dungeon_number(js_name), python_value)


if __name__ == "__main__":
    unittest.main()
