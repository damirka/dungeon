import { useCallback, useEffect, useMemo } from "react";
import type { JSX } from "react";
import { CHARACTER, DUNGEON, STATS, humanDamage, type GameState } from "../playtest/engine";
import { HERO_ID } from "../../game/spriteData";
import { SpriteActor } from "./SpriteActor";
import { useGamepad } from "./useGamepad";

function Embers({ count = 40 }: { count?: number }): JSX.Element {
  const embers = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        left: Math.random() * 100,
        delay: Math.random() * 8,
        dur: 6 + Math.random() * 8,
        drift: (Math.random() * 2 - 1) * 60,
        size: 2 + Math.random() * 3,
      })),
    [count]
  );
  return (
    <div className="hd-embers" aria-hidden="true">
      {embers.map((e, i) => (
        <span
          key={i}
          className="hd-ember"
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            animationDelay: `${e.delay}s`,
            animationDuration: `${e.dur}s`,
            ["--drift" as string]: `${e.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export function TitleScreen({
  onBegin,
  musicOn,
  sfxOn,
  onToggleMusic,
  onToggleSfx,
}: {
  onBegin: () => void;
  musicOn: boolean;
  sfxOn: boolean;
  onToggleMusic: () => void;
  onToggleSfx: () => void;
}): JSX.Element {
  // full keyboard + controller: Enter / A / Start all descend
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onBegin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBegin]);

  const padConnected = useGamepad(
    useCallback(
      (event) => {
        if (event.kind === "button" && (event.button === "a" || event.button === "start")) onBegin();
      },
      [onBegin],
    ),
  );

  return (
    <div className="hd-screen hd-crt">
      <Embers />
      <div className="hd-logo">
        HOLLOW
        <br />
        <span className="ember">DESCENT</span>
      </div>
      <div className="hd-tagline">
        Five floors. Seven foes and a warden on each. No healing you don't earn. Strike true — the Hollow waits below.
      </div>

      <div className="hd-screen-card hd-fade-in" style={{ minWidth: 320 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 72, height: 72, display: "grid", placeItems: "center" }}>
            <SpriteActor id={HERO_ID} size={64} state="idle" phase={1} flip />
          </div>
          <div style={{ textAlign: "left" }}>
            <div className="font-pixel" style={{ fontSize: 11, color: "var(--ink)" }}>{CHARACTER.name}</div>
            <div className="font-term" style={{ fontSize: 16, color: "var(--ink-dim)", maxWidth: 240, lineHeight: 1.2 }}>
              Iron Sword · even growth · <span style={{ color: "var(--accent)" }}>Riposte</span> counter stance.
            </div>
          </div>
        </div>
        <div className="hd-kv" style={{ marginTop: 6 }}>
          <span>HP</span><b>{STATS.baseHp}</b>
        </div>
        <div className="hd-kv"><span>STR / DEX</span><b>5 / 5</b></div>
        <div className="hd-kv"><span>Run length</span><b>{DUNGEON.levels} × {DUNGEON.encountersPerLevel + 1}</b></div>
      </div>

      <button type="button" className="hd-btn hd-btn--ember hd-fade-in" style={{ fontSize: 14, padding: "16px 34px" }} onClick={onBegin}>
        ▶ DESCEND
      </button>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="hd-toggle" data-on={musicOn} onClick={onToggleMusic}>
          {musicOn ? "♪ MUSIC ON" : "♪ MUSIC OFF"}
        </button>
        <button type="button" className="hd-toggle" data-on={sfxOn} onClick={onToggleSfx}>
          {sfxOn ? "♦ SFX ON" : "♦ SFX OFF"}
        </button>
      </div>
      <div className="font-term" style={{ color: "var(--ink-faint)", fontSize: 15 }}>
        Keys 1–5 + R · E ends the turn · Enter descends · mouse works everywhere
      </div>
      {padConnected && (
        <div className="font-term" style={{ color: "var(--heal)", fontSize: 14 }}>
          🎮 controller connected — A attack · X heavy · Y bash · LB sweep · B guard · RB riposte · RT end turn · stick moves
        </div>
      )}
    </div>
  );
}

/** Serialize the whole run (gear, stats, full transcript) and download it. */
export function downloadRunLog(state: GameState): void {
  const p = state.player;
  const gear = p.items.map((item) => `- ${item.name} [${item.rarity}] :: ${item.desc}`).join("\n") || "- (none)";
  const actions = Object.entries(state.stats.actions)
    .map(([action, count]) => `${action} ${count}`)
    .join(", ");
  const lines = [
    `HOLLOW DESCENT — run log (${new Date().toISOString()})`,
    `outcome: ${state.phase} · deepest floor ${state.stats.highestLevel} · encounters cleared ${state.stats.roomsCleared}`,
    `damage dealt ${Math.round(state.stats.damageDealt)} · taken ${Math.round(state.stats.damageTaken)} · potions drunk ${p.consumed}`,
    `actions: ${actions}`,
    `final stats: HP ${Math.round(p.hp)}/${Math.round(p.maxHp)} · STR ${Math.round(p.strength)} · DEX ${Math.round(p.dexterity)} · block gear +${p.blockBonus}`,
    `gear:`,
    gear,
    "",
    "=== transcript ===",
    ...state.transcript,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hollow-descent-run-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function EndScreen({ state, onRestart }: { state: GameState; onRestart: () => void }): JSX.Element {
  const win = state.phase === "won";
  const floor = state.stats.highestLevel;
  return (
    <div className="hd-screen hd-crt">
      <Embers count={win ? 60 : 24} />
      <div className="hd-banner" data-kind={win ? "win" : "dead"}>
        {win ? "THE HOLLOW IS CLEANSED" : "YOU FELL IN THE DARK"}
      </div>
      <div className="hd-tagline">
        {win
          ? "You walked out of all five floors alive. Legends will be quieter than this."
          : `The run ends on floor ${floor}. The dungeon keeps your name.`}
      </div>
      <div className="hd-screen-card hd-fade-in" style={{ minWidth: 320 }}>
        <div className="hd-kv"><span>Encounters cleared</span><b>{state.stats.roomsCleared}</b></div>
        <div className="hd-kv"><span>Deepest floor</span><b>{floor} / {state.stats.highestLevel >= 5 ? 5 : 5}</b></div>
        <div className="hd-kv"><span>Damage dealt</span><b>{humanDamage(state.stats.damageDealt)}</b></div>
        <div className="hd-kv"><span>Damage taken</span><b>{humanDamage(state.stats.damageTaken)}</b></div>
      </div>
      <button type="button" className="hd-btn hd-btn--ember" style={{ fontSize: 14, padding: "16px 34px" }} onClick={onRestart}>
        ↺ DESCEND AGAIN
      </button>
      <button type="button" className="hd-btn hd-btn--ghost" onClick={() => downloadRunLog(state)}>
        ⤓ Download run log
      </button>
    </div>
  );
}
