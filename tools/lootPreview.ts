/**
 * Loot preview — `pnpm loot:preview`. Rolls boss-tier drafts on a seeded RNG
 * and prints sample items grouped by rarity (handy for eyeballing names,
 * effects, and rarity excitement while polishing the tables in loot.ts).
 *
 * Options: LOOT_SAMPLES=400 LOOT_SEED=7 pnpm loot:preview
 */
import { it } from "vitest";
import { generateLootDraft, makeSeededRng, newGame, type Item, type ItemRarity } from "../src/features/playtest/engine";

const SAMPLES = Math.max(50, Number(process.env.LOOT_SAMPLES || 400));
const SEED = Number(process.env.LOOT_SEED || 424242);

it(`rolls ${SAMPLES} boss-tier drafts and prints samples per rarity`, () => {
  const original = Math.random;
  Math.random = makeSeededRng(SEED);
  try {
    const byRarity = new Map<ItemRarity, Item[]>();
    for (let i = 0; i < SAMPLES; i += 1) {
      const s = newGame();
      s.levelPool = { level: 5, remaining: 999 };
      const bossRoom = s.dungeon.find((room) => room.level === 5 && room.isBoss)!;
      for (const item of generateLootDraft(s, bossRoom)) {
        const list = byRarity.get(item.rarity) || [];
        list.push(item);
        byRarity.set(item.rarity, list);
      }
    }
    const order: ItemRarity[] = ["unique", "legendary", "epic", "very rare", "rare", "uncommon", "common"];
    for (const rarity of order) {
      const list = byRarity.get(rarity) || [];
      // eslint-disable-next-line no-console
      console.log(`\n=== ${rarity.toUpperCase()} (${list.length} rolled) ===`);
      for (const item of list.slice(0, 6)) {
        // eslint-disable-next-line no-console
        console.log(`  ${item.name}  —  ${item.desc}`);
      }
    }
  } finally {
    Math.random = original;
  }
});
