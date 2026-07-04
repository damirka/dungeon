import unittest

from dungeon_balance.characters import CHARACTER_ROSTER, DEFAULT_CHARACTER, character_by_id


class CharacterRosterTests(unittest.TestCase):
    def test_balanced_swordsman_is_the_only_initial_character(self) -> None:
        unlocked = [character for character in CHARACTER_ROSTER if character.unlocked]

        self.assertEqual(DEFAULT_CHARACTER.id, "balanced-swordsman")
        self.assertEqual(DEFAULT_CHARACTER.name, "Balanced Swordsman")
        self.assertEqual(DEFAULT_CHARACTER.build_name, "balanced")
        self.assertEqual(DEFAULT_CHARACTER.starting_weapon, "Iron Sword")
        self.assertEqual(DEFAULT_CHARACTER.base_ability_id, "riposte")
        self.assertEqual(DEFAULT_CHARACTER.base_ability_name, "Riposte")
        self.assertEqual(unlocked, [DEFAULT_CHARACTER])

    def test_locked_characters_have_unlock_hooks(self) -> None:
        locked = [character for character in CHARACTER_ROSTER if not character.unlocked]

        self.assertGreaterEqual(len(locked), 3)
        self.assertTrue(all(character.unlock_hint for character in locked))
        self.assertTrue(all(character.base_ability_id for character in CHARACTER_ROSTER))
        self.assertEqual(character_by_id("axe-bruiser").build_name, "strength-dominant")


if __name__ == "__main__":
    unittest.main()
