import type { JSX } from "react";
import { expectedIncomingDamage, guardBlockAmount, humanChance, humanHp, humanStamina, humanStat, playerDodgeChance, type GameState } from "../playtest/engine";

export function Vitals({ state }: { state: GameState }): JSX.Element {
  const p = state.player;
  const hpPctVal = Math.max(0, (p.hp / p.maxHp) * 100);
  const low = hpPctVal <= 30;
  const incoming = state.phase === "combat" ? expectedIncomingDamage(state) : 0;
  const incomingLethal = incoming >= p.hp;

  return (
    <div className="hd-panel hd-vitals">
      <div>
        <div className="hd-vital-label">
          <span>VITALITY</span>
          <span className="hd-vital-num">
            {humanHp(p.hp)} <span style={{ color: "var(--ink-faint)" }}>/ {humanHp(p.maxHp)}</span>
          </span>
        </div>
        <div className="hd-bigbar">
          <div className="hd-bigbar-fill" data-low={low} style={{ width: `${hpPctVal}%` }} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div className="hd-mana" aria-label={`${humanStamina(p.stamina)} of ${humanStamina(p.maxStamina)} stamina`} title="Stamina — spend on actions, refreshes every turn">
          {Array.from({ length: p.maxStamina }).map((_, i) => (
            <span key={i} className="hd-pip" data-on={i < Math.round(p.stamina)} />
          ))}
        </div>
        <div className="hd-statline">
          {p.block > 0 && (
            <span title="Block — absorbs incoming damage this turn" style={{ color: "var(--accent)" }}>
              🛡 <b>{humanStat(p.block)}</b>
            </span>
          )}
          {p.dodging && (
            <span title={`Dodging — ${humanChance(playerDodgeChance(p))} to slip every attack this round`} style={{ color: "var(--accent)" }}>
              💨 <b>{humanChance(playerDodgeChance(p))}</b>
            </span>
          )}
          {state.riposteArmed && (
            <span title="Riposte armed — the biggest attack that comes will be negated and countered" style={{ color: "var(--accent)" }}>
              ⛨ <b>PARRY</b>
            </span>
          )}
          {incoming > 0 && (
            <span
              title="Total telegraphed damage landing next enemy turn, after your current block"
              style={{ color: incomingLethal ? "#ff5a4a" : "var(--danger, #ff8a72)", fontWeight: 700 }}
            >
              IN <b>{humanStat(incoming)}</b>{incomingLethal ? " ☠" : ""}
            </span>
          )}
          <span>STR <b>{humanStat(p.strength)}</b></span>
          <span>DEX <b>{humanStat(p.dexterity)}</b></span>
        </div>
      </div>

      <div className="hd-statline" style={{ justifyContent: "space-between" }}>
        <span title="Equipped weapon and its base strike damage">
          <b style={{ color: "var(--ember-2)" }}>{p.weapon.name}</b> <span style={{ color: "var(--ink-faint)" }}>{p.weapon.damage} dmg</span>
        </span>
        <span title="Block gained per Guard">Guard +{humanStat(guardBlockAmount(p))}</span>
        {p.abilityCharges > 0 && <span style={{ color: "var(--accent)" }}>Riposte ready</span>}
      </div>
    </div>
  );
}
