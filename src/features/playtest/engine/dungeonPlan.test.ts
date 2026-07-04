import { describe, expect, it } from "vitest";
import { buildDungeon, biomeForLevel } from "./core";
import { makeSeededRng } from "./sim";

describe("dungeon plan overrides", () => {
  it("draws floor-1 enemies and boss from the plan roster", () => {
    const plan = {
      levels: {
        "1": {
          enemies: [
            { id: "cre_p02_c00", profile: "balanced", boss: false },
            { id: "cre_p09_c12", profile: "dexterity", boss: false },
          ],
          boss: "cre_p08_c14",
          bossName: "Test Tyrant",
          biome: "volcanic",
        },
      },
    };
    const dungeon = buildDungeon(makeSeededRng(42), plan);
    const floor1 = dungeon.filter((room) => room.level === 1);
    const regulars = floor1.filter((room) => !room.isBoss).flatMap((room) => room.enemies);
    expect(regulars.length).toBeGreaterThan(0);
    for (const enemy of regulars) {
      expect(["cre_p02_c00", "cre_p09_c12"]).toContain(enemy.spriteId);
    }
    const boss = floor1.find((room) => room.isBoss)!.enemies[0];
    expect(boss.spriteId).toBe("cre_p08_c14");
    expect(boss.name).toBe("Test Tyrant");
    expect(biomeForLevel(1, plan)).toBe("volcanic");
    // floors without overrides keep defaults
    expect(biomeForLevel(2, plan)).toBe("sand");
    const floor2 = dungeon.filter((room) => room.level === 2 && room.isBoss)[0].enemies[0];
    expect(floor2.name).toBe("Dune Tyrant");
  });

  it("no plan matches the default build exactly", () => {
    const a = buildDungeon(makeSeededRng(7));
    const b = buildDungeon(makeSeededRng(7), null);
    expect(b).toEqual(a);
  });
});
