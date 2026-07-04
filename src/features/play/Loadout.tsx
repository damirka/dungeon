import type { CSSProperties, JSX } from "react";
import { EFFECT_LABELS, humanChance, humanGain, slotForItem, type GameState, type Item, type ItemRarity, type Weapon } from "../playtest/engine";
import { ItemSprite } from "./ItemSprite";
import type { LootIconKind } from "./icons";

const RARITY_VAR: Record<ItemRarity, string> = {
  common: "var(--line-2)",
  uncommon: "var(--rar-uncommon)",
  rare: "var(--rar-rare)",
  "very rare": "var(--rar-very-rare)",
  epic: "var(--rar-epic)",
  legendary: "var(--rar-legendary)",
  unique: "var(--rar-unique)",
};

const SLOTS: { slot: "weapon" | "amulet" | "charm" | "relic" | "shield" | "focus"; label: string }[] = [
  { slot: "weapon", label: "Weapon" },
  { slot: "amulet", label: "HP" },
  { slot: "charm", label: "STR" },
  { slot: "relic", label: "DEX" },
  { slot: "shield", label: "BLK" },
  { slot: "focus", label: "SPL" },
];

function iconFor(item: Item, weaponStyle: LootIconKind): LootIconKind {
  if (item.kind === "weapon") return (item.style as LootIconKind) || weaponStyle;
  if (item.stat === "hp") return "hp";
  if (item.stat === "strength") return "strength";
  if (item.stat === "dexterity") return "dexterity";
  if (item.stat === "block") return "block";
  return weaponStyle;
}

interface Prop {
  text: string;
  tone: "buff" | "debuff";
}

// Human-readable stat/prop lines for an equipped weapon (integer model).
function weaponProps(w: Weapon): Prop[] {
  const out: Prop[] = [];
  const flat = (label: string, v: number | undefined) => {
    if (!v) return;
    out.push({ text: `${humanGain(v)} ${label}`, tone: v >= 0 ? "buff" : "debuff" });
  };
  out.push({ text: `${w.damage} base damage`, tone: "buff" });
  flat("Attack dmg", w.strikeBonus);
  flat("Heavy dmg", w.heavyBonus);
  flat("Sweep dmg", w.sweepBonus);
  flat("Bash dmg", w.bashBonus);
  if (w.critChance) out.push({ text: `${humanChance(w.critChance)} crit`, tone: "buff" });
  if (w.critMultiplierBonus) out.push({ text: `${humanGain(w.critMultiplierBonus * 100)}% crit dmg`, tone: "buff" });
  flat("Guard block", w.blockBonus);
  if (w.staggerChance) out.push({ text: `${humanChance(w.staggerChance)} stagger (deny)`, tone: "buff" });
  flat("on-hit dmg", w.onHitBonusDamage);
  flat("vs boss", w.bossBonusDamage);
  flat("execute dmg", w.executeBonusDamage);
  flat("first-round dmg", w.firstStrikeBonusDamage);
  return out;
}

function statBonusProps(item: Item | null): Prop[] {
  if (!item?.statBonus) return [];
  const out: Prop[] = [];
  if (item.statBonus.hp) out.push({ text: `${humanGain(item.statBonus.hp)} HP`, tone: "buff" });
  if (item.statBonus.strength) out.push({ text: `${humanGain(item.statBonus.strength)} STR`, tone: "buff" });
  if (item.statBonus.dexterity) out.push({ text: `${humanGain(item.statBonus.dexterity)} DEX`, tone: "buff" });
  if (item.statBonus.block) out.push({ text: `${humanGain(item.statBonus.block)} BLK`, tone: "buff" });
  return out;
}

function statItemProps(item: Item): Prop[] {
  if (item.kind !== "stat" || item.value == null) return [];
  const unit = item.stat === "hp" ? "HP" : item.stat === "strength" ? "STR" : item.stat === "block" ? "BLK" : "DEX";
  return [{ text: `${humanGain(item.value)} ${unit}`, tone: "buff" }];
}

function effectProps(item: Item | null): Prop[] {
  if (!item?.effects?.length) return [];
  return item.effects.map((entry) => ({
    text:
      entry.key === "crit_chance"
        ? `${EFFECT_LABELS[entry.key]} ${humanChance(entry.value)}`
        : entry.key === "guard_pierce_block" || entry.key === "guard_heavy_block"
          ? EFFECT_LABELS[entry.key]
          : `${EFFECT_LABELS[entry.key]} ${humanGain(entry.value)}`,
    tone: "buff" as const,
  }));
}

function SlotTip({ title, rarity, props, empty }: { title: string; rarity?: ItemRarity; props: Prop[]; empty?: boolean }): JSX.Element {
  return (
    <span className="hd-slot-tip" role="tooltip">
      <span className="hd-slot-tip-name">{title}</span>
      {rarity && <span className="hd-slot-tip-rarity">{rarity}</span>}
      {empty ? (
        <span className="hd-slot-tip-empty">Empty slot</span>
      ) : props.length ? (
        <span className="hd-slot-tip-props">
          {props.map((p, i) => (
            <span key={i} className="hd-slot-tip-prop" data-tone={p.tone}>
              {p.text}
            </span>
          ))}
        </span>
      ) : (
        <span className="hd-slot-tip-empty">No modifiers</span>
      )}
    </span>
  );
}

export function Loadout({ state }: { state: GameState }): JSX.Element {
  const p = state.player;
  const weaponStyle: LootIconKind = /axe/i.test(p.weapon.name) ? "axe" : /rapier|needle/i.test(p.weapon.name) ? "rapier" : "sword";

  return (
    <div className="hd-loadout">
      <div className="hd-loadout-label">Loadout</div>
      <div className="hd-loadout-slots">
        {SLOTS.map(({ slot, label }) => {
          const item = slot === "weapon"
            ? p.items.find((it) => it.kind === "weapon") || null
            : p.items.find((it) => slotForItem(it) === slot) || null;
          const isWeapon = slot === "weapon";
          const rarity = item ? RARITY_VAR[item.rarity] : "var(--line)";
          const name = isWeapon ? p.weapon.name : item?.name;
          const filled = Boolean(item) || isWeapon;
          // Weapon slot always reflects the active weapon (base Iron Sword if nothing equipped).
          const props = isWeapon
            ? [...weaponProps(p.weapon), ...statBonusProps(item), ...effectProps(item)]
            : item
              ? [...statItemProps(item), ...statBonusProps(item), ...effectProps(item)]
              : [];
          return (
            <div
              key={slot}
              className="hd-slot"
              data-filled={filled}
              style={{ "--rarity": rarity } as CSSProperties}
            >
              <div className="hd-slot-icon">
                {isWeapon ? (
                  <ItemSprite kind={weaponStyle} size={28} coord={item?.sprite} />
                ) : item ? (
                  <ItemSprite kind={iconFor(item, weaponStyle)} size={28} tier={item.tier} coord={item.sprite} />
                ) : (
                  <span className="hd-slot-dot" />
                )}
              </div>
              <span className="hd-slot-tag">{label}</span>
              <SlotTip title={name || `${label} slot`} rarity={item?.rarity} props={props} empty={!filled} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
