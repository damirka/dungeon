import type { JSX } from "react";
import {
  CHARACTER,
  abilityAvailable,
  actionDamage,
  actionStaminaCost,
  bashAvailable,
  canAffordAction,
  expectedIncomingDamage,
  guardBlockAmount,
  humanChance,
  humanDamage,
  humanStamina,
  playerCritChance,
  type Enemy,
  type GameState,
  type PlayerAction,
} from "../playtest/engine";
import { ActionIcon } from "./icons";

interface ActionDef {
  action: PlayerAction;
  key: string;
  label: string;
}

const ACTIONS: ActionDef[] = [
  { action: "attack", key: "1", label: "Attack" },
  { action: "heavy", key: "2", label: "Heavy" },
  { action: "bash", key: "3", label: "Bash" },
  { action: "sweep", key: "4", label: "Sweep" },
  { action: "guard", key: "5", label: "Guard" },
  { action: "ability", key: "R", label: "Riposte" },
];

function actionRole(action: PlayerAction): string {
  if (action === "attack") return "Stable";
  if (action === "heavy") return "Commit";
  if (action === "bash") return "Deny";
  if (action === "sweep") return "Group";
  if (action === "guard") return "Block";
  return "Counter";
}

function cardStats(state: GameState, action: PlayerAction, target: Enemy | undefined): { role: string; dmgText: string } {
  if (action === "guard") return { role: actionRole(action), dmgText: `+${guardBlockAmount(state.player)}` };
  if (!target) return { role: actionRole(action), dmgText: "—" };
  if (action === "sweep") {
    const total = state.enemies.reduce((sum, e) => (e.hp > 0 ? sum + actionDamage(state, e, "sweep") : sum), 0);
    return { role: actionRole(action), dmgText: humanDamage(total) };
  }
  return { role: actionRole(action), dmgText: humanDamage(actionDamage(state, target, action === "ability" ? "ability" : action)) };
}

function tip(state: GameState, action: PlayerAction, target: Enemy | undefined): JSX.Element {
  const p = state.player;
  const crit = humanChance(playerCritChance(p));
  if (action === "guard") {
    const raw = expectedIncomingDamage(state);
    const guarded = expectedIncomingDamage(state, guardBlockAmount(p));
    return (
      <>
        <b>Guard</b> — +{guardBlockAmount(p)} block. Incoming <span className="dmg">{humanDamage(raw)}</span> →{" "}
        <span className="dmg">{humanDamage(guarded)}</span>. Stacks.
      </>
    );
  }
  if (action === "ability") {
    if ((p.abilityCharges || 0) <= 0) return <><b>Riposte</b> — spent for this room.</>;
    return (
      <>
        <b>Riposte</b> — negates damage for one attack, once per encounter.{" "}
        <span style={{ opacity: 0.8 }}>
          (+{CHARACTER.ability.block} block, block fully stops Heavy ‡, counters every attacker for{" "}
          <span className="dmg">{target ? humanDamage(actionDamage(state, target, "ability")) : "—"}</span> each.)
        </span>
      </>
    );
  }
  if (action === "sweep") {
    const total = state.enemies.reduce((sum, e) => (e.hp > 0 ? sum + actionDamage(state, e, "sweep") : sum), 0);
    return (
      <>
        <b>Sweep</b> — hit every enemy. Total <span className="dmg">{humanDamage(total)}</span>. No crits.
      </>
    );
  }
  const dmg = target ? actionDamage(state, target, action) : 0;
  if (action === "bash") {
    const blockedText = target?.steadied
      ? " Target is steadied — damage only."
      : " Stops the target's action this round — next round it rolls a NEW plan.";
    return (
      <>
        <b>Bash</b> — <span className="dmg">{humanDamage(dmg)}</span> and deny.{blockedText} {p.bashCharges} use
        {p.bashCharges === 1 ? "" : "s"} left this fight.
      </>
    );
  }
  const extra = action === "heavy" ? " EXPOSES the target: your other hits this round deal +3." : "";
  return (
    <>
      <b>{action[0].toUpperCase() + action.slice(1)}</b> — exactly <span className="dmg">{humanDamage(dmg)}</span> ({crit} crit ×2).{extra}
    </>
  );
}

export function ActionBar({
  state,
  busy,
  recommended,
  onAct,
  onHover,
}: {
  state: GameState;
  busy: boolean;
  recommended: PlayerAction | null;
  onAct: (action: PlayerAction) => void;
  onHover?: (action: PlayerAction | null) => void;
}): JSX.Element {
  const target = state.enemies[state.selected] && state.enemies[state.selected].hp > 0 ? state.enemies[state.selected] : state.enemies.find((e) => e.hp > 0);
  const combat = state.phase === "combat" && state.player.hp > 0;

  return (
    <div className="hd-actions" role="group" aria-label="Combat actions">
      <div className="hd-actions-grid">
      {ACTIONS.map(({ action, key, label }) => {
        const cost = actionStaminaCost(action);
        const affordable = canAffordAction(state.player, action);
        const usable =
          action === "ability"
            ? abilityAvailable(state.player) && !state.riposteArmed
            : action === "bash"
              ? bashAvailable(state.player)
              : affordable;
        const disabled = !combat || busy || !usable;
        const { role, dmgText } = cardStats(state, action, target);
        const chargeText = action === "bash" ? ` ·${state.player.bashCharges}×` : action === "ability" ? ` ·${state.player.abilityCharges}×` : "";
        return (
          <button
            key={action}
            type="button"
            className="hd-action"
            data-kind={action}
            data-primary={recommended === action}
            disabled={disabled}
            onClick={() => onAct(action)}
            onMouseEnter={() => onHover?.(action)}
            onMouseLeave={() => onHover?.(null)}
          >
            <span className="hd-action-key">{key}</span>
            <span className="hd-action-mp" data-free={cost === 0} title={cost === 0 ? "No stamina cost" : `${humanStamina(cost)} stamina`}>
              {cost === 0 ? "FREE" : `${humanStamina(cost)} STA`}
              {chargeText}
            </span>
            <span className="hd-action-icon">
              <ActionIcon action={action} size={24} />
            </span>
            <span className="hd-action-name">{label}</span>
              <span className="hd-action-stats" aria-hidden="true">
                <span className="hd-action-stat">
                <i>ROLE</i>
                <b>{role}</b>
              </span>
              <span className="hd-action-stat">
                <i>{action === "guard" ? "BLK" : "DMG"}</i>
                <b>{dmgText}</b>
              </span>
            </span>
            <span className="hd-tip">{tip(state, action, target)}</span>
          </button>
        );
      })}
      </div>
      <button
        type="button"
        className="hd-action"
        data-kind="end"
        disabled={!combat || busy}
        onClick={() => onAct("end")}
        title="End your turn — enemies act, stamina refreshes"
      >
        <span className="hd-action-key">E</span>
        <span className="hd-action-mp" data-free={true}>FREE</span>
        <span className="hd-action-icon">
          <ActionIcon action="end" size={24} />
        </span>
        <span className="hd-action-name">End Turn</span>
        <span className="hd-action-stats" aria-hidden="true">
          <span className="hd-action-stat">
            <i>STA</i>
            <b>{humanStamina(state.player.stamina)}</b>
          </span>
          <span className="hd-action-stat">
            <i>IN</i>
            <b>{humanDamage(expectedIncomingDamage(state))}</b>
          </span>
        </span>
        <span className="hd-tip">
          <b>End Turn</b> — enemies act. Incoming after block: <span className="dmg">{humanDamage(expectedIncomingDamage(state))}</span>.
        </span>
      </button>
    </div>
  );
}
