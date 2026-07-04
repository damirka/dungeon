import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import {
  DUNGEON,
  actionDamage,
  biomeForLevel,
  humanDamage,
  type BiomeId,
  type Enemy,
  type FxEvent,
  type PlayerAction,
} from "../playtest/engine";
import { HERO_ID } from "../../game/spriteData";
import { audio, type Sfx } from "../../game/audio";
import { liveDungeonPlan } from "../../game/dungeonPlan";
import type { FxKey } from "../../game/fxData";
import { ActionBar } from "./ActionBar";
import { ExploreView } from "./ExploreView";
import { RoomBackdrop, computeBattleStage, pickRoom } from "./roomRender";
import type { RoomDef } from "../../game/roomData";
import { EnemyUnit } from "./EnemyUnit";
import { FXBurst } from "./FXBurst";
import { Loadout } from "./Loadout";
import { LootDraft } from "./LootDraft";
import { EndScreen, downloadRunLog } from "./Screens";
import { SpriteActor, type ActorState } from "./SpriteActor";
import { Vitals } from "./Vitals";
import type { UseGame } from "./useGame";
import { useGamepad, type PadButton, type PadEvent } from "./useGamepad";

const BIOME_NAME: Record<BiomeId, string> = {
  forest: "Green Forest",
  sand: "Desert Sands",
  volcanic: "Volcanic Depths",
  castle: "Castle Halls",
  dungeon: "The Dungeon",
};

const BIOME_GLOW: Record<BiomeId, string> = {
  forest: "#1f5a2a",
  sand: "#6a4f22",
  volcanic: "#7a1d0c",
  castle: "#2c3068",
  dungeon: "#3a1545",
};

interface Floaty {
  id: number;
  x: number;
  y: number;
  kind: "dmg" | "crit" | "incoming" | "heal" | "miss" | "block";
  text: string;
}
interface FxItem {
  id: number;
  x: number;
  y: number;
  fxKey: FxKey;
  size: number;
}

const ACTION_SFX: Record<PlayerAction, Sfx> = {
  attack: "attack",
  heavy: "heavy",
  bash: "quick",
  sweep: "sweep",
  guard: "guard",
  ability: "ability",
  end: "uiClick",
};

export function GameStage(game: UseGame): JSX.Element {
  const { state, fxNonce, act, select, pickLoot, advance, restart, musicOn, sfxOn, toggleMusic, toggleSfx } = game;

  const arenaRef = useRef<HTMLDivElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const enemyEls = useRef(new Map<number, HTMLDivElement | null>());
  const idRef = useRef(1);
  const handled = useRef(-1);
  const fxTimers = useRef<number[]>([]);

  const [floats, setFloats] = useState<Floaty[]>([]);
  const [fxList, setFxList] = useState<FxItem[]>([]);
  const [reactions, setReactions] = useState<Record<number, ActorState>>({});
  const [heroState, setHeroState] = useState<ActorState>("idle");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState<"" | "s" | "l">("");
  const [flashId, setFlashId] = useState(0);
  const [arenaW, setArenaW] = useState(900);
  const [arenaH, setArenaH] = useState(520);
  const [intro, setIntro] = useState<{ key: number; title: string; sub: string } | null>(null);
  // hovered action card -> projected damage overlays on the target(s)
  const [previewAction, setPreviewAction] = useState<PlayerAction | null>(null);
  const [approaching, setApproaching] = useState(() => state.phase === "combat");
  // post-encounter walk: after a fight resolves we resume exploring the SAME room
  // from the player battle spot, captured here before the engine advances the room.
  const [leaving, setLeaving] = useState(false);
  const [leaveRoom, setLeaveRoom] = useState<RoomDef | null>(null);
  const [leaveStart, setLeaveStart] = useState<{ x: number; y: number } | null>(null);
  const pendingLeave = useRef<{ room: RoomDef; start: { x: number; y: number } } | null>(null);
  const exploring = approaching || leaving;

  const room = state.dungeon[Math.min(state.roomIndex, state.dungeon.length - 1)];
  const level = room?.level ?? 1;
  const biome = biomeForLevel(level, liveDungeonPlan());
  const roomKind: "entrance" | "encounter" | "boss" = room?.kind ?? "encounter";
  // The authored tile-map for this step — explored first, then fought in. Picked
  // once here so the explore walk and the battle floor are the same room.
  const stageRoom = useMemo(
    () => pickRoom(biome, level, roomKind, room?.slot ?? state.roomIndex),
    [biome, level, roomKind, room?.slot, state.roomIndex],
  );

  const registerEl = useCallback((index: number, el: HTMLDivElement | null) => {
    enemyEls.current.set(index, el);
  }, []);

  useEffect(() => {
    const node = arenaRef.current;
    if (!node) return;
    const measure = () => {
      setArenaW(node.clientWidth);
      setArenaH(node.clientHeight);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    measure();
    return () => ro.disconnect();
  }, []);

  // explore the location before each encounter — set before paint so the combat
  // stage never flashes between rooms (or right after Descend). Also reset
  // transient actor reactions so a previous room's "dead" fade never carries
  // onto the new room's enemy at the same index.
  useLayoutEffect(() => {
    const pending = pendingLeave.current;
    if (pending) {
      // a fight just ended (loot resolved → engine advanced): resume exploring the
      // room we just cleared, starting from the player battle spot.
      pendingLeave.current = null;
      setLeaving(true);
      setLeaveRoom(pending.room);
      setLeaveStart(pending.start);
      setApproaching(false);
    } else {
      setApproaching(state.phase === "combat");
      setLeaving(false);
      setLeaveRoom(null);
    }
    setIntro(null);
    setReactions({});
    setHeroState("idle");
    fxTimers.current.forEach((t) => clearTimeout(t));
    fxTimers.current = [];
  }, [state.roomIndex, state.phase]);

  // Loot pick advances the engine to the next room; capture the room we just
  // cleared first so we can walk out of it (resume from the player battle spot).
  const handlePickLoot = (choice: number | "skip") => {
    const finalBoss = Boolean(room?.isBoss && level >= DUNGEON.levels);
    if (room && room.kind !== "entrance" && !finalBoss) {
      pendingLeave.current = { room: stageRoom, start: stage.heroCell };
    }
    pickLoot(choice);
  };

  // Door reached during the post-encounter walk → reveal the next room's approach.
  const finishLeave = () => {
    setLeaving(false);
    setLeaveRoom(null);
    setLeaveStart(null);
    setApproaching(true);
  };

  const enterEncounter = () => {
    // the entrance is explore-only: stepping through its door advances straight
    // to the next room's exploration (no combat stage flash, no intro).
    if (room?.kind === "entrance") {
      advance();
      return;
    }
    setApproaching(false);
    audio.sfx("descend");
    setIntro({
      key: state.roomIndex,
      title: room?.isBoss ? (room.enemies[0]?.name ?? "Floor Warden") : room?.elite ? (room.enemies[0]?.name ?? "Elite Foe") : BIOME_NAME[biome],
      sub: room?.isBoss
        ? `Floor ${level} · The Warden Awaits`
        : room?.elite
          ? `Floor ${level} · An Elite Blocks the Path`
          : `Floor ${level} · Encounter ${room?.slot ?? 1} of ${DUNGEON.encountersPerLevel + 1}`,
    });
    window.setTimeout(() => setIntro((cur) => (cur && cur.key === state.roomIndex ? null : cur)), 1600);
  };

  const measureEnemy = useCallback((i: number): { x: number; y: number } | null => {
    const el = enemyEls.current.get(i);
    const arena = arenaRef.current;
    if (!el || !arena) return null;
    const r = el.getBoundingClientRect();
    const a = arena.getBoundingClientRect();
    return { x: r.left + r.width / 2 - a.left, y: r.top + r.height * 0.4 - a.top };
  }, []);

  const measurePlayer = useCallback((): { x: number; y: number } => {
    const a = arenaRef.current?.getBoundingClientRect();
    const h = heroRef.current?.getBoundingClientRect();
    if (a && h) return { x: h.left + h.width / 2 - a.left, y: h.top + h.height * 0.35 - a.top };
    return { x: (a?.width ?? arenaW) * 0.2, y: (a?.height ?? 400) - 90 };
  }, [arenaW]);

  const sfx = useCallback((name: Sfx) => void audio.sfx(name), []);

  const spawnFloat = useCallback((x: number, y: number, kind: Floaty["kind"], text: string) => {
    const id = idRef.current++;
    setFloats((f) => [...f, { id, x, y, kind, text }]);
    window.setTimeout(() => setFloats((f) => f.filter((it) => it.id !== id)), 1750);
  }, []);

  const spawnFX = useCallback((x: number, y: number, fxKey: FxKey, size = 78) => {
    const id = idRef.current++;
    setFxList((s) => [...s, { id, x, y, fxKey, size }]);
    window.setTimeout(() => setFxList((s) => s.filter((it) => it.id !== id)), 560);
  }, []);

  const setReaction = useCallback((i: number, st: ActorState, dur = 460) => {
    setReactions((r) => ({ ...r, [i]: st }));
    const t = window.setTimeout(() => {
      setReactions((r) => {
        const next = { ...r };
        if (next[i] === st) delete next[i];
        return next;
      });
    }, dur);
    fxTimers.current.push(t);
  }, []);

  const setHero = useCallback((st: ActorState, dur = 420) => {
    setHeroState(st);
    const t = window.setTimeout(() => setHeroState((cur) => (cur === st ? "idle" : cur)), dur);
    fxTimers.current.push(t);
  }, []);

  const schedule = useCallback((delay: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      try {
        fn();
      } catch {
        /* keep the run alive even if a visual step fails */
      }
    }, delay);
    fxTimers.current.push(t);
  }, []);

  // process the latest fx batch into animations + sound
  useEffect(() => {
    if (handled.current === fxNonce) return;
    handled.current = fxNonce;
    const fx: FxEvent[] = state.fx || [];
    fxTimers.current.forEach((t) => clearTimeout(t));
    fxTimers.current = [];
    if (!fx.length) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const ENEMY_START = 380;
    let playerDelay = 0;
    let enemyClock = 0;
    let enemyStarted = false;
    let lastDelay = 0;
    let curAction: PlayerAction = "attack";

    for (const ev of fx) {
      if (ev.type === "playerAct") {
        curAction = ev.action;
        sfx(ACTION_SFX[ev.action]);
        setHero(ev.action === "guard" || ev.action === "ability" ? "guard" : "attack", 460);
        playerDelay = 150;
      } else if (ev.type === "strike" && ev.from === "player") {
        const targetIdx = ev.target as number;
        const d = playerDelay;
        const action = curAction;
        lastDelay = Math.max(lastDelay, d);
        schedule(d, () => {
          const pos = measureEnemy(targetIdx);
          if (!pos) return;
          if (ev.hit) {
            const key: FxKey = ev.crit ? "crit" : action === "bash" ? "quick" : "hit";
            spawnFX(pos.x, pos.y, key, ev.crit ? 118 : action === "heavy" ? 102 : 84);
            setReaction(targetIdx, "hurt");
            if (ev.crit) {
              sfx("crit");
              spawnFloat(pos.x, pos.y, "crit", `${humanDamage(ev.damage)}!`);
            } else {
              spawnFloat(pos.x, pos.y, "dmg", humanDamage(ev.damage));
            }
          } else {
            sfx("miss");
            spawnFX(pos.x, pos.y, "quick", 50);
            spawnFloat(pos.x, pos.y, "miss", "MISS");
          }
        });
      } else if (ev.type === "strike") {
        if (!enemyStarted) {
          enemyClock = ENEMY_START;
          enemyStarted = true;
        }
        const ei = ev.from as number;
        const d = enemyClock;
        enemyClock += 300;
        lastDelay = Math.max(lastDelay, d + 150);
        schedule(d, () => setReaction(ei, "attack", 360));
        schedule(d + 150, () => {
          const pos = measurePlayer();
          if (ev.hit) {
            sfx("hurt");
            setHero("hurt", 380);
            setFlashId((n) => n + 1);
            setShake(ev.damage > state.player.maxHp * 0.16 ? "l" : "s");
            spawnFX(pos.x, pos.y, "hurt", 98);
            spawnFloat(pos.x, pos.y, "incoming", `-${humanDamage(ev.damage)}`);
          } else {
            spawnFloat(pos.x, pos.y, "miss", "MISS");
          }
        });
      } else if (ev.type === "support") {
        if (!enemyStarted) {
          enemyClock = ENEMY_START;
          enemyStarted = true;
        }
        const d = enemyClock;
        enemyClock += 280;
        lastDelay = Math.max(lastDelay, d);
        schedule(d, () => {
          setReaction(ev.from, "cast", 460);
          sfx("ability");
          const cpos = measureEnemy(ev.from);
          if (cpos) spawnFX(cpos.x, cpos.y, "magic", 74);
          const pos = measureEnemy(ev.target);
          if (pos && ev.kind === "heal") {
            spawnFX(pos.x, pos.y, "heal", 66);
            spawnFloat(pos.x, pos.y, "heal", "+HEAL");
          }
          if (pos && ev.kind === "shield") {
            spawnFX(pos.x, pos.y, "guard", 66);
            spawnFloat(pos.x, pos.y, "block", "SHIELD");
          }
        });
      } else if (ev.type === "enemyDown") {
        schedule(playerDelay + 220, () => {
          setReaction(ev.index, "dead", 6000);
          sfx("enemyDown");
        });
      } else if (ev.type === "interrupt") {
        schedule(playerDelay + 180, () => {
          const pos = measureEnemy(ev.index);
          if (pos) spawnFloat(pos.x, pos.y, "block", "INTERRUPT");
        });
      } else if (ev.type === "roomClear") {
        schedule(lastDelay + 160, () => sfx("roomClear"));
      } else if (ev.type === "playerDown") {
        schedule(lastDelay + 160, () => {
          setShake("l");
          setHero("dead", 8000);
        });
      } else if (ev.type === "buff") {
        // gear effect fired — float it over the hero so passives are never silent
        const d = playerDelay + 140;
        lastDelay = Math.max(lastDelay, d);
        schedule(d, () => {
          const pos = measurePlayer();
          spawnFloat(pos.x, pos.y - 26, ev.text.includes("HP") ? "heal" : "block", ev.text);
        });
      }
    }

    const total = Math.max(360, lastDelay + 520);
    const endT = window.setTimeout(() => setBusy(false), total);
    fxTimers.current.push(endT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxNonce]);

  useEffect(() => () => fxTimers.current.forEach((t) => clearTimeout(t)), []);

  const cycleTarget = useCallback(
    (dir: 1 | -1) => {
      const alive = state.enemies.map((en, i) => ({ en, i })).filter((x) => x.en.hp > 0);
      if (alive.length < 2) return;
      const order = alive.map((x) => x.i);
      const cur = order.indexOf(state.selected);
      const next = order[(cur + dir + order.length) % order.length];
      select(next);
      sfx("target");
    },
    [state.enemies, state.selected, select, sfx],
  );

  // keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state.phase === "loot") {
        if (e.key === "1" || e.key === "2" || e.key === "3") {
          const i = Number(e.key) - 1;
          if (state.draft[i]) pickLoot(i);
        } else if (e.key.toLowerCase() === "s" || e.key === "Escape") pickLoot("skip");
        return;
      }
      if (state.phase === "dead" || state.phase === "won") {
        if (e.key === "Enter") restart();
        return;
      }
      if (state.phase !== "combat" || busy || exploring || state.player.hp <= 0) return;
      const map: Record<string, PlayerAction> = { "1": "attack", "2": "heavy", "3": "bash", "4": "sweep", "5": "guard", r: "ability", R: "ability", e: "end", E: "end", " ": "attack" };
      const action = map[e.key];
      if (action) {
        e.preventDefault();
        act(action);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Tab") {
        e.preventDefault();
        cycleTarget(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, busy, exploring, act, pickLoot, restart, cycleTarget]);

  // controller: A attack · X heavy · Y bash · LB sweep · B guard · RB ability ·
  // RT/Start end turn · d-pad/stick cycles target. Loot has its own handler in
  // LootDraft; explore movement lives in ExploreView.
  useGamepad(
    useCallback(
      (event: PadEvent) => {
        if (state.phase === "dead" || state.phase === "won") {
          if (event.kind === "button" && (event.button === "a" || event.button === "start")) restart();
          return;
        }
        if (state.phase !== "combat" || busy || exploring || state.player.hp <= 0) return;
        if (event.kind === "move") {
          if (event.dx) cycleTarget(event.dx);
          return;
        }
        const map: Partial<Record<PadButton, PlayerAction>> = {
          a: "attack",
          x: "heavy",
          y: "bash",
          lb: "sweep",
          b: "guard",
          rb: "ability",
          rt: "end",
          start: "end",
        };
        const action = map[event.button];
        if (action) act(action);
      },
      [state.phase, state.player.hp, busy, exploring, act, restart, cycleTarget],
    ),
  );

  const recommended = recommendedAction();
  const floorRooms = state.dungeon.filter((r) => r.level === level);
  const currentSlot = room?.slot ?? 0;
  const enemyCount = state.enemies.length;
  // camera + grid placement: map is drawn bigger than the arena and units sit on
  // real grid cells, so the floor grid and the actors share one coordinate space.
  const stage = useMemo(() => computeBattleStage(stageRoom, arenaW, arenaH, enemyCount), [stageRoom, arenaW, arenaH, enemyCount]);
  const heroPos = stage.cellToScreen(stage.heroCell.x, stage.heroCell.y);
  // units are sized to roughly fill one grid cell (boss spills a little for menace)
  const bossSize = Math.round(stage.tile * 1.6);
  const normalSize = Math.round(stage.tile * 1.05);
  const heroSize = Math.round(stage.tile * 1.12);

  function recommendedAction(): PlayerAction | null {
    if (state.phase !== "combat") return null;
    const aliveCount = state.enemies.filter((e) => e.hp > 0).length;
    if (aliveCount >= 3 && state.player.stamina >= 2) return "sweep";
    return null;
  }

  return (
    <div className="hd-game hd-crt">
      {/* top bar */}
      <div className="hd-topbar">
        <div className="hd-topbar-biome">
          {BIOME_NAME[biome]}
          <small>FLOOR {level} / 5</small>
        </div>
        <div className="hd-rooms">
          {floorRooms.map((r, i) => {
            const st = r.slot < currentSlot ? "done" : r.slot === currentSlot ? "current" : "todo";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 && <span className="hd-node-link" data-done={r.slot <= currentSlot} />}
                <span
                  className="hd-node"
                  data-state={st}
                  data-boss={r.isBoss || r.elite}
                  title={r.kind === "entrance" ? "Entrance" : r.isBoss ? "Floor Warden" : r.elite ? "Elite" : `Encounter ${r.slot}`}
                >
                  {r.kind === "entrance" ? "⌂" : r.isBoss ? "☠" : r.elite ? "◆" : r.slot}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="hd-toggle" data-on={musicOn} onClick={toggleMusic} title="Toggle music">♪</button>
          <button type="button" className="hd-toggle" data-on={sfxOn} onClick={toggleSfx} title="Toggle sound">♦</button>
          <button type="button" className="hd-toggle" onClick={() => downloadRunLog(state)} title="Download run log">⤓</button>
          <button type="button" className="hd-toggle" onClick={restart} title="Abandon run">⟲</button>
        </div>
      </div>

      {/* arena */}
      <div ref={arenaRef} className={`hd-arena ${shake ? "hd-shake-" + shake : ""}`} onAnimationEnd={() => setShake("")}>
        {!exploring && (
          <>
        <RoomBackdrop room={stageRoom} layout={{ tile: stage.tile, offX: stage.offX, offY: stage.offY }} vignette={0.5} />
        <div className="hd-stage-bg hd-stage-bg-over" style={{ ["--glow" as string]: BIOME_GLOW[biome] } as CSSProperties} />
        {/* whisper-faint tactical grid so the battlefield reads as cells */}
        <div
          className="hd-battle-grid"
          aria-hidden="true"
          style={{
            backgroundSize: `${stage.tile}px ${stage.tile}px`,
            backgroundPosition: `${stage.offX}px ${stage.offY}px`,
          }}
        />

        <div className="hd-actors-grid" key={`grid-${state.roomIndex}`}>
          <div className="hd-unit hd-unit-hero" ref={heroRef} style={{ left: heroPos.x, top: heroPos.y, zIndex: 10 + Math.round(heroPos.y) }}>
            <SpriteActor id={HERO_ID} size={heroSize} state={heroState} phase={3} flip />
            <div className="hd-hero-base" />
          </div>
          {state.enemies.map((enemy: Enemy, i: number) => {
            const cell = stage.enemyCells[i] ?? stage.enemyCells[stage.enemyCells.length - 1] ?? stage.heroCell;
            const p = stage.cellToScreen(cell.x, cell.y);
            const previewable = previewAction === "sweep" || (previewAction != null && i === state.selected);
            const previewDamage =
              state.phase === "combat" && enemy.hp > 0 && previewable && previewAction !== "guard" && previewAction !== "end"
                ? Math.max(0, actionDamage(state, enemy, previewAction!) - (enemy.block || 0))
                : null;
            return (
              // depth-sort: units lower on screen paint on top, so an intent
              // chip poking above a head is never hidden behind the unit above
              <div className="hd-unit" key={i} style={{ left: p.x, top: p.y, zIndex: 10 + Math.round(p.y) }}>
                <EnemyUnit
                  enemy={enemy}
                  index={i}
                  selected={state.selected === i}
                  vfx={baseVfx(enemy, reactions[i])}
                  size={enemy.tags.includes("boss") ? bossSize : normalSize}
                  previewDamage={previewDamage}
                  onSelect={(idx) => {
                    if (state.phase === "combat") {
                      select(idx);
                      sfx("target");
                    }
                  }}
                  registerEl={registerEl}
                />
              </div>
            );
          })}
        </div>
          </>
        )}

        <div className="hd-float-layer">
          {fxList.map((f) => (
            <FXBurst key={f.id} fxKey={f.fxKey} x={f.x} y={f.y} size={f.size} />
          ))}
          {floats.map((f) => (
            <span key={f.id} className="hd-float" data-kind={f.kind} style={{ left: f.x, top: f.y }}>
              {f.text}
            </span>
          ))}
        </div>

        <span key={`flash-${flashId}`} className={flashId ? "hd-hitflash" : ""} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />

        {approaching && state.phase === "combat" && (
          <ExploreView
            key={`explore-${state.roomIndex}`}
            biome={biome}
            level={level}
            kind={roomKind}
            room={stageRoom}
            locationName={BIOME_NAME[biome]}
            triggerRow={roomKind === "entrance" ? null : stage.heroCell.y}
            hint={roomKind === "entrance" ? undefined : "Move with WASD / arrows — approach to engage"}
            onEnter={enterEncounter}
          />
        )}

        {leaving && leaveRoom && (
          <ExploreView
            key={`leave-${state.roomIndex}`}
            biome={biome}
            level={level}
            kind={roomKind}
            room={leaveRoom}
            locationName={BIOME_NAME[biome]}
            startCell={leaveStart}
            hint="Encounter cleared — move to the doorway to continue"
            onEnter={finishLeave}
          />
        )}

        {intro && (
          <div className="hd-intro" key={`intro-${intro.key}`}>
            <div className="hd-intro-bar" />
            <div className="hd-intro-text">
              <div className="hd-intro-title">{intro.title}</div>
              <div className="hd-intro-sub">{intro.sub}</div>
            </div>
            <div className="hd-intro-bar" />
          </div>
        )}

        {state.phase === "loot" && <LootDraft state={state} onPick={handlePickLoot} />}
        {(state.phase === "dead" || state.phase === "won") && <EndScreen state={state} onRestart={restart} />}
      </div>

      {/* HUD */}
      <div className="hd-hud">
        <div className="hd-leftcol">
          <Vitals state={state} />
          <Loadout state={state} />
        </div>
        <div className="hd-panel hd-cardwrap">
          <ActionBar state={state} busy={busy || exploring} recommended={recommended} onAct={act} onHover={setPreviewAction} />
        </div>
        <div className="hd-panel hd-log-wrap">
          <div className="hd-log hd-scroll">
            {[...state.log].slice(-40).reverse().map((entry, i) => (
              <div key={state.log.length - i} className={entry.cls}>
                {entry.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function baseVfx(enemy: Enemy, reaction: ActorState | undefined): ActorState {
  if (enemy.hp <= 0) return "dead";
  if (reaction) return reaction;
  if (enemy.intent === "heal" || enemy.intent === "shield") return "cast";
  if (enemy.intent === "guard") return "guard";
  return "idle";
}
