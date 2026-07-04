import type { JSX } from "react";
import {
  TACTICAL,
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
  playerDodgeChance,
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
  { action: "dodge", key: "6", label: "Dodge" },
  { action: "ability", key: "R", label: "Riposte" },
];

function actionRole(action: PlayerAction): string {
  if (action === "attack") return "Stable";
  if (action === "heavy") return "Commit";
  if (action === "bash") return "Deny";
  if (action === "sweep") return "Group";
  if (action === "guard") return "Block";
  if (action === "dodge") return "Gamble";
  return "Counter";
}

function cardStats(state: GameState, action: PlayerAction, target: Enemy | undefined): { role: string; dmgText: string } {
  if (action === "guard") return { role: actionRole(action), dmgText: `+${guardBlockAmount(state.player)}` };
  if (action === "dodge") return { role: actionRole(action), dmgText: humanChance(playerDodgeChance(state.player)) };
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
  const fine = { opacity: 0.8 } as const;
  if (action === "guard") {
    const raw = expectedIncomingDamage(state);
    const guarded = expectedIncomingDamage(state, guardBlockAmount(p));
    const tired = (p.guardFatigue || 0) > 0;
    return (
      <>
        <b>Guard</b> — raise <span className="dmg">+{guardBlockAmount(p)}</span> block: a shield of points that soaks the
        damage coming this turn, then fades. Incoming right now: <span className="dmg">{humanDamage(raw)}</span> →{" "}
        <span className="dmg">{humanDamage(guarded)}</span> if you guard.{" "}
        <span style={fine}>
          Stack it freely within one turn — but guarding every round tires your arm
          {tired ? " (tiring NOW — take a round off to recover)" : " (−3 block per consecutive round)"}. Watch the marks:
          Pierce † slips past block entirely, Heavy ‡ crushes it (2 block only stops 1 damage).
        </span>
      </>
    );
  }
  if (action === "ability") {
    if (state.riposteArmed) return <><b>Riposte</b> — armed and waiting: the biggest attack that comes will be negated entirely and countered.</>;
    if ((p.abilityCharges || 0) <= 0) return <><b>Riposte</b> — spent for this room.</>;
    return (
      <>
        <b>Riposte</b> — negates damage for one attack, once per encounter.{" "}
        <span style={fine}>
          Arm the stance and the BIGGEST attack that comes while it holds is turned aside completely — 0 damage, even
          Pierce † and Heavy ‡ — and you instantly counter that attacker for{" "}
          <span className="dmg">{target ? humanDamage(actionDamage(state, target, "ability")) : "—"}</span>. The stance
          holds across rounds until an attack arrives.
        </span>
      </>
    );
  }
  if (action === "dodge") {
    const chance = humanChance(playerDodgeChance(p));
    return (
      <>
        <b>Dodge</b> — a gamble: <span className="dmg">{chance}</span> to slip EVERY attack this round untouched.
        Fail, and you are caught mid-step — every hit lands 25% HARDER.{" "}
        <span style={fine}>
          One roll covers the whole enemy turn. No fatigue, and speed beats Pierce † and Heavy ‡ alike. The odds grow
          with DEX. Guard is the reliable tool — Dodge is the coin you flip when blocking is not enough
          {p.dodging ? " (already set to dodge this round)" : ""}.
        </span>
      </>
    );
  }
  if (action === "sweep") {
    const alive = state.enemies.filter((e) => e.hp > 0);
    const total = alive.reduce((sum, e) => sum + actionDamage(state, e, "sweep"), 0);
    const afflictions = (["poison_on_hit", "bleed_on_hit", "sunder_on_hit"] as const)
      .filter((key) => (p.effects[key] || 0) > 0)
      .map((key) => key.replace("_on_hit", ""));
    return (
      <>
        <b>Sweep</b> — one wide swing that hits EVERY enemy at once:{" "}
        <span className="dmg">{humanDamage(total)}</span> total across {alive.length || "the"} foe{alive.length === 1 ? "" : "s"}.{" "}
        <span style={fine}>
          Each cut is smaller than an Attack and can never crit, so it pays off against 3 enemies (or 2 with a sweep
          weapon). Grows with DEX. Great for grinding a whole pack down together.
          {afflictions.length > 0 && (
            <> Your on-hit {afflictions.join(" + ")} lands on EVERY foe it touches — the affliction build.</>
          )}
        </span>
      </>
    );
  }
  const dmg = target ? actionDamage(state, target, action) : 0;
  if (action === "bash") {
    return (
      <>
        <b>Bash</b> — a denying blow: <span className="dmg">{humanDamage(dmg)}</span> damage AND the target's telegraphed
        action is stopped cold this round.{" "}
        <span style={fine}>
          Next round it must roll a NEW plan — the stopped attack never comes back (bosses skip to their next move).
          Best spent cancelling a big Heavy ‡. A bashed enemy is STEADIED and can't be denied again until it acts
          {target?.steadied ? " — this target is steadied, so Bash would deal damage only" : ""}. Limited:{" "}
          {p.bashCharges} use{p.bashCharges === 1 ? "" : "s"} left this fight.
        </span>
      </>
    );
  }
  if (action === "heavy") {
    return (
      <>
        <b>Heavy</b> — a committed two-stamina blow for exactly <span className="dmg">{humanDamage(dmg)}</span> ({crit} crit
        ×2), double a basic Attack.{" "}
        <span style={fine}>
          When it lands it EXPOSES the target: every OTHER hit you land on it this round deals +{TACTICAL.exposedBonusDamage}.
          Lead with Heavy, follow with Attack — that combo out-damages three plain Attacks. Axe-style weapons make it hit
          even harder.
        </span>
      </>
    );
  }
  return (
    <>
      <b>Attack</b> — your bread-and-butter strike: exactly <span className="dmg">{humanDamage(dmg)}</span> to the target
      ({crit} chance to crit for double).{" "}
      <span style={fine}>
        Costs just 1 stamina, so you can swing up to three times a turn. Numbers are exact — no misses, ever. Hits an
        EXPOSED target (after your Heavy lands) for +{TACTICAL.exposedBonusDamage}.
      </span>
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
              : action === "dodge"
                ? affordable && !state.player.dodging
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
                <i>{action === "guard" ? "BLK" : action === "dodge" ? "ODDS" : "DMG"}</i>
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
