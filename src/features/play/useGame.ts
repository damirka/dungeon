import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceRoom,
  applyAction,
  beginRun,
  biomeForLevel,
  newGame,
  resolveLoot,
  selectTarget,
  type GameState,
  type PlayerAction,
} from "../playtest/engine";
import { audio } from "../../game/audio";
import { liveDungeonPlan } from "../../game/dungeonPlan";

export interface UseGame {
  state: GameState;
  fxNonce: number;
  musicOn: boolean;
  sfxOn: boolean;
  begin: () => void;
  act: (action: PlayerAction) => void;
  select: (index: number) => void;
  pickLoot: (choice: number | "skip") => void;
  advance: () => void;
  restart: () => void;
  toggleMusic: () => void;
  toggleSfx: () => void;
}

// ---------------------------------------------------------------------------
// Run persistence: the in-progress run survives page reloads (dev HMR, code
// pushes) via localStorage. BUMP SAVE_VERSION whenever the GameState shape
// changes — a stale or unparseable save is silently discarded, never migrated.
// ---------------------------------------------------------------------------
const SAVE_KEY = "hollow-descent-run";
const SAVE_VERSION = 1;

function validSave(state: GameState | undefined | null): state is GameState {
  return Boolean(
    state &&
      typeof state.phase === "string" &&
      Array.isArray(state.dungeon) &&
      Array.isArray(state.transcript) &&
      state.player &&
      typeof state.player.stamina === "number" &&
      typeof state.player.bashCharges === "number" &&
      state.player.effects &&
      state.stats &&
      state.stats.effectTriggers &&
      state.dungeon.every((room) => Array.isArray(room.enemies) && room.enemies.every((e) => typeof e.exposed === "boolean"))
  );
}

function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: number; state?: GameState };
    if (parsed.version !== SAVE_VERSION || !validSave(parsed.state)) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    // fx is transient animation state — replaying it after a reload wedges the
    // busy flag under StrictMode (its release timer gets cleared) and would
    // re-run stale animations anyway
    parsed.state.fx = [];
    return parsed.state;
  } catch {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
    return null;
  }
}

function persistSave(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, state: { ...state, fx: [] } }));
  } catch {
    /* storage full/unavailable — playing without persistence is fine */
  }
}

export function useGame(): UseGame {
  // resume the saved run if there is a valid one; otherwise a fresh dungeon
  // picking up the freshest designer plan (or engine defaults)
  const [state, setState] = useState<GameState>(() => loadSave() ?? newGame(liveDungeonPlan()));
  const [fxNonce, setFxNonce] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const [sfxOn, setSfxOn] = useState(false);

  const begin = useCallback(() => {
    void audio.init().then(() => {
      if (!audio.musicOn) return;
      const s = stateRef.current;
      const room = s.dungeon[0];
      if (room) audio.playMusic(biomeForLevel(room.level, liveDungeonPlan()), room.isBoss);
    });
    setState((s) => beginRun(s));
    setFxNonce((n) => n + 1);
  }, []);

  const act = useCallback((action: PlayerAction) => {
    setState((s) => applyAction(s, action));
    setFxNonce((n) => n + 1);
  }, []);

  const select = useCallback((index: number) => {
    setState((s) => selectTarget(s, index));
  }, []);

  const pickLoot = useCallback((choice: number | "skip") => {
    setState((s) => resolveLoot(s, choice));
    setFxNonce((n) => n + 1);
  }, []);

  const advance = useCallback(() => {
    setState((s) => advanceRoom(s));
  }, []);

  const restart = useCallback(() => {
    setState(newGame(liveDungeonPlan()));
    setFxNonce((n) => n + 1);
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicOn((on) => {
      const next = !on;
      audio.setMusic(next);
      if (next) {
        void audio.init().then(() => {
          const s = stateRef.current;
          const room = s.dungeon[s.roomIndex];
          if (room && (s.phase === "combat" || s.phase === "loot")) audio.playMusic(biomeForLevel(room.level, liveDungeonPlan()), room.isBoss);
        });
      }
      return next;
    });
  }, []);

  const toggleSfx = useCallback(() => {
    setSfxOn((on) => {
      const next = !on;
      audio.setSfx(next);
      if (next) void audio.init();
      return next;
    });
  }, []);

  // keep a ref so async callbacks read fresh state
  const stateRef = useRef(state);
  stateRef.current = state;

  // persist every state change so reloads resume mid-run
  useEffect(() => {
    persistSave(state);
  }, [state]);

  // music + stingers follow biome / phase
  const lastTrack = useRef<string>("");
  useEffect(() => {
    if (state.phase === "combat" || state.phase === "loot") {
      const room = state.dungeon[state.roomIndex];
      if (room) {
        const key = `${biomeForLevel(room.level, liveDungeonPlan())}:${room.isBoss}`;
        if (key !== lastTrack.current) {
          lastTrack.current = key;
          audio.playMusic(biomeForLevel(room.level, liveDungeonPlan()), room.isBoss);
        }
      }
    } else if (state.phase === "won") {
      audio.stopMusic();
      audio.sfx("victory");
      lastTrack.current = "";
    } else if (state.phase === "dead") {
      audio.stopMusic();
      audio.sfx("defeat");
      lastTrack.current = "";
    }
  }, [state.phase, state.roomIndex, state.dungeon]);

  return { state, fxNonce, musicOn, sfxOn, begin, act, select, pickLoot, advance, restart, toggleMusic, toggleSfx };
}
