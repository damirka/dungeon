import type { JSX } from "react";
import { expectedIncomingDamage, guardBlockAmount, humanHp, type GameState, type PlayerAction } from "../playtest/engine";

/**
 * In-arena hero health bar (combat only), styled like the enemy plates. The
 * telegraphed enemy intents land HERE: the striped red slice is exactly the HP
 * the coming enemy turn will remove (engine truth — block, pierce, heavy
 * crush, denied enemies and Riposte all accounted for). Hovering Guard
 * previews how much of that slice the extra block would erase.
 */
export function HeroPlate({ state, previewAction }: { state: GameState; previewAction?: PlayerAction | null }): JSX.Element {
  const p = state.player;
  // once the hero is down (death animation playing) the telegraphs are moot
  const incoming = p.hp > 0 ? expectedIncomingDamage(state) : 0;
  const guardPreview = previewAction === "guard" ? expectedIncomingDamage(state, guardBlockAmount(p)) : null;
  const shown = guardPreview ?? incoming;

  const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);
  const hit = Math.min(shown, p.hp);
  const hitPct = (hit / p.maxHp) * 100;
  const blockPct = p.block > 0 ? Math.min(100, (p.block / p.maxHp) * 100) : 0;
  const lethal = shown >= p.hp;

  return (
    <div className="hd-plate hd-plate-hero">
      <div
        className="hd-hpbar hd-hpbar-hero"
        title={`${humanHp(p.hp)} / ${humanHp(p.maxHp)} HP — enemies telegraph ${humanHp(incoming)} damage next turn`}
      >
        <div className="hd-hpbar-fill" style={{ width: `${hpPct}%` }} />
        {hit > 0 && <div className="hd-hpbar-incoming" style={{ width: `${hitPct}%`, left: `${Math.max(0, hpPct - hitPct)}%` }} />}
        {blockPct > 0 && <div className="hd-hpbar-shield" style={{ width: `${blockPct}%` }} />}
      </div>
      <div className="hd-plate-hp">
        {humanHp(p.hp)}/{humanHp(p.maxHp)}
        {shown > 0 && (
          <b className="hd-plate-incoming" title="Total telegraphed enemy damage you would take next turn">
            {" "}−{humanHp(shown)}{lethal ? " ☠" : ""}
          </b>
        )}
        {shown === 0 && incoming === 0 && p.hp > 0 && <b className="hd-plate-safe"> safe</b>}
        {guardPreview != null && guardPreview < incoming && (
          <b className="hd-plate-safe" title="With Guard raised"> (−{humanHp(incoming - guardPreview)})</b>
        )}
      </div>
      {(p.block > 0 || state.riposteArmed) && (
        <div className="hd-status-row">
          {p.block > 0 && <span className="hd-status" data-k="shield">BLOCK {humanHp(p.block)}</span>}
          {state.riposteArmed && <span className="hd-status" data-k="shield">RIPOSTE</span>}
        </div>
      )}
    </div>
  );
}
