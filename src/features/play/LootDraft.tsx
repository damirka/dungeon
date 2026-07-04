import { useCallback, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { activeItemForSlot, humanGain, recommendedLootIndex, slotForItem, type GameState, type Item, type ItemRarity } from "../playtest/engine";
import { ItemSprite } from "./ItemSprite";
import type { LootIconKind } from "./icons";
import { useGamepad } from "./useGamepad";

const RARITY_VAR: Record<ItemRarity, string> = {
  common: "var(--rar-common)",
  uncommon: "var(--rar-uncommon)",
  rare: "var(--rar-rare)",
  "very rare": "var(--rar-very-rare)",
  epic: "var(--rar-epic)",
  legendary: "var(--rar-legendary)",
  unique: "var(--rar-unique)",
};

function iconFor(item: Item): LootIconKind {
  if (item.kind === "consumable") return "potion";
  if (item.kind === "weapon") return (item.style as LootIconKind) || "sword";
  if (item.kind === "focus") return "block";
  return (item.stat as LootIconKind) || "hp";
}

function slotTag(item: Item): string {
  if (item.kind === "consumable") return "Drink now";
  if (item.kind === "weapon") return "Equip weapon";
  if (item.kind === "focus") return "Focus slot · passive";
  if (item.stat === "hp") return "Amulet slot";
  if (item.stat === "strength") return "Charm slot";
  if (item.stat === "block") return "Shield slot";
  return "Relic slot";
}

// one-line summary of an item's core numbers, for the "vs equipped" row
function coreValue(item: Item): string {
  if (item.kind === "weapon" && item.weapon) return `${item.weapon.damage} dmg`;
  if (item.kind === "stat" && item.value != null) return `${humanGain(item.value)} ${item.stat === "block" ? "BLK" : item.stat?.slice(0, 3).toUpperCase()}`;
  if (item.kind === "focus") return item.effects?.length ? `${item.effects.length} effect${item.effects.length > 1 ? "s" : ""}` : "—";
  return "";
}

// numeric delta vs the equipped item in the same slot (weapons: damage; stat items: value)
function compareDelta(item: Item, current: Item): number | null {
  if (item.kind === "weapon" && item.weapon && current.weapon) return item.weapon.damage - current.weapon.damage;
  if (item.kind === "stat" && item.value != null && current.value != null && item.stat === current.stat) return item.value - current.value;
  return null;
}

function deltaTone(delta: number | null): string {
  if (delta == null) return "info";
  return delta > 0 ? "up" : delta < 0 ? "down" : "even";
}

/**
 * The item this card would replace, shown as a mini card under the offer so
 * the trade reads side-by-side: sprite, name, core numbers, and the delta.
 */
function EquippedCompare({ state, item }: { state: GameState; item: Item }): JSX.Element | null {
  if (item.kind === "consumable") return null;
  const current = activeItemForSlot(state.player, slotForItem(item));

  if (!current) {
    // the weapon slot is never truly empty — compare against the active weapon
    if (item.kind === "weapon" && item.weapon) {
      const weapon = state.player.weapon;
      const delta = item.weapon.damage - weapon.damage;
      const kind: LootIconKind = /axe/i.test(weapon.name) ? "axe" : /rapier|needle|staff|wand|bow/i.test(weapon.name) ? "rapier" : "sword";
      return (
        <div className="hd-loot-current" title={`Equipped: ${weapon.name}`}>
          <span className="hd-loot-current-tag">NOW</span>
          <ItemSprite kind={kind} size={26} />
          <span className="hd-loot-current-body">
            <span className="hd-loot-current-name">{weapon.name}</span>
            <span className="hd-loot-current-val">{weapon.damage} dmg</span>
          </span>
          <b className="hd-loot-current-delta" data-tone={deltaTone(delta)}>{delta === 0 ? "even" : humanGain(delta)}</b>
        </div>
      );
    }
    return (
      <div className="hd-loot-current" data-empty="true">
        <span className="hd-loot-current-tag">NOW</span>
        <span className="hd-loot-current-body">
          <span className="hd-loot-current-name">Empty slot</span>
          <span className="hd-loot-current-val">pure upgrade</span>
        </span>
        <b className="hd-loot-current-delta" data-tone="up">new</b>
      </div>
    );
  }

  const delta = compareDelta(item, current);
  return (
    <div
      className="hd-loot-current"
      style={{ "--rarity": RARITY_VAR[current.rarity] } as CSSProperties}
      title={`Equipped: ${current.name} — ${current.desc}`}
    >
      <span className="hd-loot-current-tag">NOW</span>
      <ItemSprite kind={iconFor(current)} size={26} tier={current.tier} coord={current.sprite} />
      <span className="hd-loot-current-body">
        <span className="hd-loot-current-name">{current.name}</span>
        <span className="hd-loot-current-val">{coreValue(current) || current.rarity}</span>
      </span>
      <b className="hd-loot-current-delta" data-tone={deltaTone(delta)}>
        {delta == null ? "≠" : delta === 0 ? "even" : humanGain(delta)}
      </b>
    </div>
  );
}

export function LootDraft({ state, onPick }: { state: GameState; onPick: (choice: number | "skip") => void }): JSX.Element {
  const room = state.dungeon[state.roomIndex - 1];
  const reco = recommendedLootIndex(state);
  const count = state.draft.length;

  // controller: d-pad/stick moves the cursor, A takes the card, B skips
  const [cursor, setCursor] = useState(() => (typeof reco === "number" && reco >= 0 ? reco : 0));
  const padConnected = useGamepad(
    useCallback(
      (event) => {
        if (!count) return;
        if (event.kind === "move") {
          if (event.dx) setCursor((c) => (c + event.dx + count) % count);
          return;
        }
        if (event.button === "a") onPick(Math.min(cursor, count - 1));
        else if (event.button === "b" || event.button === "start") onPick("skip");
      },
      [count, cursor, onPick],
    ),
  );

  return (
    <div className="hd-overlay">
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="hd-overlay-title">{room?.isBoss ? "BOSS SPOILS" : "CHOOSE YOUR SPOILS"}</div>
        <div className="hd-overlay-sub">Take one — or keep your edge and move on.</div>
      </div>

      <div className="hd-loot-row">
        {state.draft.map((item, i) => (
          <div
            key={i}
            className="hd-loot-card"
            style={
              {
                "--rarity": RARITY_VAR[item.rarity],
                animationDelay: `${0.12 + i * 0.14}s`,
                ...(padConnected && cursor === i ? { outline: "2px solid var(--gold)", outlineOffset: 3 } : {}),
              } as CSSProperties
            }
            onClick={() => onPick(i)}
            role="button"
            aria-label={`Take ${item.name}`}
          >
            {reco === i && <div className="hd-loot-badge">BEST</div>}
            <div className="hd-loot-rarity">{item.rarity}</div>
            <div className="hd-loot-icon">
              <ItemSprite kind={iconFor(item)} size={76} tier={item.tier} coord={item.sprite} />
            </div>
            <div className="hd-loot-name">{item.name}</div>
            <div className="hd-loot-desc">{item.desc}</div>
            <EquippedCompare state={state} item={item} />
            <div className="hd-loot-tag">{slotTag(item)}</div>
          </div>
        ))}
      </div>

      <button type="button" className="hd-btn hd-btn--ghost" onClick={() => onPick("skip")} title="Pass on the loot and grow HP/STR/DEX instead">
        Skip — train instead (+HP/STR/DEX) →
      </button>
    </div>
  );
}
