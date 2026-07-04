/** Crisp inline icons for actions, enemy intents, statuses, and loot. currentColor-driven. */
import type { JSX } from "react";
import type { EnemyIntent, PlayerAction, StatusKey } from "../playtest/engine";

interface IconProps {
  size?: number;
}

function Svg({ size = 24, children }: IconProps & { children: JSX.Element | JSX.Element[] }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function ActionIcon({ action, size }: { action: PlayerAction; size?: number }): JSX.Element {
  switch (action) {
    case "attack":
      return (
        <Svg size={size}>
          <path d="M14 4 L20 4 L20 10 L9 21 L3 21 L3 15 Z" />
          <path d="M5 19 L9 15" />
        </Svg>
      );
    case "heavy":
      return (
        <Svg size={size}>
          <path d="M14 3 a4 4 0 0 1 4 7 L13 15 L9 11 L14 6 a4 4 0 0 0 0 -3 Z" />
          <path d="M11 13 L4 20 L7 21 Z" />
        </Svg>
      );
    case "bash":
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22 M5 5 L8 8 M19 5 L16 8 M5 19 L8 16 M19 19 L16 16" />
        </Svg>
      );
    case "end":
      return (
        <Svg size={size}>
          <path d="M4 12 H16 M12 6 L18 12 L12 18" />
          <path d="M20 5 V19" />
        </Svg>
      );
    case "sweep":
      return (
        <Svg size={size}>
          <path d="M3 14 a10 10 0 0 1 18 0" />
          <path d="M18 6 L21 14 L13 13" />
        </Svg>
      );
    case "guard":
      return (
        <Svg size={size}>
          <path d="M12 3 L20 6 V12 a8 9 0 0 1 -8 9 a8 9 0 0 1 -8 -9 V6 Z" />
        </Svg>
      );
    case "dodge":
      return (
        <Svg size={size}>
          <path d="M4 7 C10 7 13 11 20 11 M20 11 L16 7 M20 11 L16 15" />
          <path d="M4 17 C7 17 9 15.5 11 14" />
        </Svg>
      );
    case "ability":
      return (
        <Svg size={size}>
          <path d="M5 5 L14 14 M14 5 L5 14" />
          <path d="M18 4 l1.4 2.6 L22 8 l-2.6 1.4 L18 12 l-1.4 -2.6 L14 8 l2.6 -1.4 Z" />
        </Svg>
      );
    default:
      return <Svg size={size}><circle cx="12" cy="12" r="8" /></Svg>;
  }
}

/** Affliction icons: poison = dripping droplet, bleed = slashed drop, sunder = cracked blade. */
export function StatusIcon({ status, size = 12 }: { status: StatusKey; size?: number }): JSX.Element {
  switch (status) {
    case "poison":
      return (
        <Svg size={size}>
          <path d="M12 3 C12 3 6 10 6 15 a6 6 0 0 0 12 0 C18 10 12 3 12 3 Z" />
          <path d="M9.5 15 a2.5 2.5 0 0 0 2.5 2.5" />
        </Svg>
      );
    case "bleed":
      return (
        <Svg size={size}>
          <path d="M12 4 C12 4 7 10.5 7 15 a5 5 0 0 0 10 0 C17 10.5 12 4 12 4 Z" />
          <path d="M8 8 L16 16" />
        </Svg>
      );
    case "sunder":
      return (
        <Svg size={size}>
          <path d="M14 4 L20 4 L20 10 L13 17" />
          <path d="M9 13 L4 18 L6 20 L11 15" />
          <path d="M12 10 L10 13 L13 13 L11 16" />
        </Svg>
      );
    default:
      return <Svg size={size}><circle cx="12" cy="12" r="7" /></Svg>;
  }
}

export function IntentIcon({ intent, size = 14 }: { intent: EnemyIntent; size?: number }): JSX.Element {
  switch (intent) {
    case "strike":
      return <Svg size={size}><path d="M14 4 L20 4 L20 10 L9 21 L3 21 L3 15 Z" /></Svg>;
    case "heavy":
      return <Svg size={size}><path d="M12 3 V15 M7 11 L12 16 L17 11" /><path d="M5 20 H19" /></Svg>;
    case "pierce":
      return <Svg size={size}><path d="M4 20 L20 4 M14 4 H20 V10 M9 13 L11 15" /></Svg>;
    case "aim":
      return <Svg size={size}><circle cx="12" cy="12" r="7" /><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22" /></Svg>;
    case "guard":
      return <Svg size={size}><path d="M12 3 L20 6 V12 a8 9 0 0 1 -8 9 a8 9 0 0 1 -8 -9 V6 Z" /></Svg>;
    case "heal":
      return <Svg size={size}><path d="M12 6 V18 M6 12 H18" /></Svg>;
    case "shield":
      return <Svg size={size}><path d="M12 3 L20 6 V12 a8 9 0 0 1 -8 9 a8 9 0 0 1 -8 -9 V6 Z" /><path d="M12 9 V15 M9 12 H15" /></Svg>;
    default:
      return <Svg size={size}><circle cx="12" cy="12" r="7" /></Svg>;
  }
}

export type LootIconKind = "hp" | "strength" | "dexterity" | "block" | "potion" | "sword" | "axe" | "rapier";

export function LootIcon({ kind, size = 72 }: { kind: LootIconKind; size?: number }): JSX.Element {
  const common = { width: size, height: size, viewBox: "0 0 48 48", "aria-hidden": true } as const;
  switch (kind) {
    case "hp":
      return (
        <svg {...common}>
          <path d="M24 41 C8 30 6 19 12 13 c4 -4 9 -2 12 2 c3 -4 8 -6 12 -2 c6 6 4 17 -12 28 Z" fill="#ff3b46" stroke="#7a1218" strokeWidth="2" />
          <path d="M18 18 c2 -2 4 -1 6 2" stroke="#ffb0b5" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case "strength":
      return (
        <svg {...common}>
          <path d="M10 24 h6 v-6 h6 v-6 h6 v18 c0 6 -4 10 -10 10 h-2 c-6 0 -12 -4 -12 -10 v-4 h6 Z" fill="#ff8c1a" stroke="#7a3c05" strokeWidth="2" />
          <path d="M16 22 h6 M22 16 h6" stroke="#ffd9a0" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "dexterity":
      return (
        <svg {...common}>
          <path d="M36 10 C20 12 12 24 10 38 c14 -2 26 -10 28 -26 Z" fill="#2fe6d2" stroke="#0c6b62" strokeWidth="2" />
          <path d="M30 16 L16 32 M26 18 l-4 0 M30 22 l-5 0 M30 26 l-7 0" stroke="#0c6b62" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "block":
      return (
        <svg {...common}>
          <path d="M24 6 L40 12 V24 c0 10 -7 15 -16 18 c-9 -3 -16 -8 -16 -18 V12 Z" fill="#6ea8ff" stroke="#1d3a73" strokeWidth="2" />
          <path d="M24 12 V36 M14 20 H34" stroke="#1d3a73" strokeWidth="2" />
        </svg>
      );
    case "potion":
      return (
        <svg {...common}>
          <path d="M20 8 h8 v8 l6 14 c1 6 -3 10 -10 10 s-11 -4 -10 -10 l6 -14 Z" fill="#16121c" stroke="#5b5466" strokeWidth="2" />
          <path d="M19 26 h18 v8 c0 4 -4 6 -9 6 s-9 -2 -9 -6 Z" fill="#ff3b46" />
          <rect x="19" y="6" width="10" height="4" rx="1" fill="#8a8294" />
          <circle cx="24" cy="32" r="2" fill="#ffd0d4" opacity="0.8" />
        </svg>
      );
    case "sword":
      return (
        <svg {...common}>
          <path d="M30 8 L34 12 L20 26 L18 28 L16 26 L18 24 Z" fill="#dfe7ef" stroke="#7d8794" strokeWidth="2" />
          <path d="M14 28 l6 6 M11 31 h8 M13 33 v8" stroke="#ffae3d" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "axe":
      return (
        <svg {...common}>
          <path d="M30 8 c8 2 10 12 4 16 l-10 -2 c0 -6 1 -11 6 -14 Z" fill="#dfe7ef" stroke="#7d8794" strokeWidth="2" />
          <path d="M26 22 L14 40" stroke="#8a5a2a" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case "rapier":
      return (
        <svg {...common}>
          <path d="M36 8 L20 30" stroke="#dfe7ef" strokeWidth="3" strokeLinecap="round" />
          <path d="M16 30 a5 5 0 1 0 6 4" fill="none" stroke="#ffae3d" strokeWidth="2.5" />
          <path d="M14 34 l-4 6" stroke="#ffae3d" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    default:
      return <svg {...common}><circle cx="24" cy="24" r="14" fill="#888" /></svg>;
  }
}

export function RuneLogo({ size = 44 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M6 4 H26 L22 10 H10 Z" fill="#ff7a18" />
      <path d="M10 12 H22 L16 28 Z" fill="#ffae3d" />
      <path d="M16 14 L19 20 L16 24 L13 20 Z" fill="#0b090d" />
    </svg>
  );
}
