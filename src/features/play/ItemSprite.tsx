import type { CSSProperties, JSX } from "react";
import type { LootIconKind } from "./icons";

const ITEM_SHEET = "/room-assets/oryx_items.png";
const T = 16;
const COLS = 24;
const ROWS = 19;

const COORDS: Record<LootIconKind, [number, number]> = {
  hp: [19, 4],
  strength: [12, 4],
  dexterity: [17, 4],
  block: [3, 11], // Iron Shield in the Oryx item sheet
  potion: [9, 1],
  sword: [22, 10],
  axe: [14, 8],
  rapier: [9, 10],
};

const POTION_BY_TIER: [number, number][] = [
  [3, 1], // vial
  [9, 1], // potion
  [15, 1], // elixir
];

export function ItemSprite({
  kind,
  size = 64,
  tier = 1,
  coord: explicit,
}: {
  kind: LootIconKind;
  size?: number;
  tier?: number;
  /** Exact Oryx sheet tile (col,row) — used when the item carries its catalog sprite. */
  coord?: { col: number; row: number };
}): JSX.Element {
  let coord: [number, number] = explicit ? [explicit.col, explicit.row] : COORDS[kind];
  if (!explicit && kind === "potion") coord = tier >= 5 ? POTION_BY_TIER[2] : tier >= 3 ? POTION_BY_TIER[1] : POTION_BY_TIER[0];
  const [c, r] = coord;
  const scale = size / T;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${ITEM_SHEET})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${COLS * size}px ${ROWS * size}px`,
    backgroundPosition: `${-c * size}px ${-r * size}px`,
    imageRendering: "pixelated",
    filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.6))",
  };
  void scale;
  return <div className="hd-itemsprite" style={style} aria-hidden="true" />;
}
