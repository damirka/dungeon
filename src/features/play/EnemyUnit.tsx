import type { JSX } from "react";
import { SpriteActor, type ActorState } from "./SpriteActor";
import { humanHp, type Enemy } from "../playtest/engine";
import { IntentIcon } from "./icons";

const INTENT_LABEL: Record<string, string> = {
  strike: "Strike",
  heavy: "Heavy",
  pierce: "Pierce",
  aim: "Aims ×1.5", // winding up: its NEXT attack is boosted 1.5×
  guard: "Guard",
  heal: "Heal",
  shield: "Shield",
};

const INTENT_TITLE: Record<string, string> = {
  strike: "Will attack for the shown damage",
  heavy: "Will attack hard — CRUSHES block (your block is half as effective)",
  pierce: "Will attack for the shown damage — pierces block entirely",
  aim: "Winding up: its next attack will hit 1.5× harder",
  guard: "Will raise block on itself",
  heal: "Will heal a wounded ally",
  shield: "Will grant an ally block",
};

export function EnemyUnit({
  enemy,
  index,
  selected,
  vfx,
  size,
  previewDamage,
  onSelect,
  registerEl,
}: {
  enemy: Enemy;
  index: number;
  selected: boolean;
  vfx: ActorState;
  size: number;
  /** Damage the hovered player action would deal to this enemy (after its block). */
  previewDamage?: number | null;
  onSelect: (index: number) => void;
  registerEl: (index: number, el: HTMLDivElement | null) => void;
}): JSX.Element {
  const dead = enemy.hp <= 0;
  const isBoss = enemy.tags.includes("boss");
  const isElite = !isBoss && enemy.tags.includes("elite");
  const hpPctVal = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
  const blockPctVal = enemy.block > 0 ? Math.min(100, (enemy.block / enemy.maxHp) * 100) : 0;
  const intentLabel = INTENT_LABEL[enemy.intent] || enemy.intent;
  const preview = previewDamage != null && previewDamage > 0 ? Math.min(previewDamage, enemy.hp) : 0;
  const lethal = previewDamage != null && previewDamage >= enemy.hp;
  const previewPctVal = preview > 0 ? (preview / enemy.maxHp) * 100 : 0;

  return (
    <div
      className="hd-enemy"
      data-selected={selected}
      data-dead={dead}
      data-boss={isBoss}
      ref={(el) => registerEl(index, el)}
      onClick={() => !dead && onSelect(index)}
      role="button"
      aria-label={`${enemy.name}, ${humanHp(enemy.hp)} of ${humanHp(enemy.maxHp)} HP, next: ${intentLabel} ${enemy.intentDamage || ""}`}
    >
      {!dead && (
        <div
          className="hd-intent"
          data-kind={enemy.denied ? "denied" : enemy.intent}
          title={enemy.denied ? "Denied — this action is delayed to next turn" : INTENT_TITLE[enemy.intent] || `Next turn: ${intentLabel}`}
        >
          <IntentIcon intent={enemy.intent} size={13} />
          <span style={enemy.denied ? { textDecoration: "line-through", opacity: 0.75 } : undefined}>{intentLabel}</span>
          {enemy.intentDamage > 0 && (
            <b className="hd-intent-dmg" style={enemy.denied ? { textDecoration: "line-through", opacity: 0.75 } : undefined}>
              {enemy.intentDamage}
              {enemy.intent === "pierce" ? "†" : enemy.intent === "heavy" ? "‡" : ""}
            </b>
          )}
        </div>
      )}

      <div className="hd-enemy-art">
        <SpriteActor id={enemy.spriteId} size={size} state={dead ? "dead" : vfx} phase={enemy.visualSeed} flip={false} />
        {!dead && lethal && <div className="hd-kill-mark" aria-hidden="true">☠</div>}
      </div>

      {!dead && (
        <div className="hd-plate">
          <div className="hd-plate-name" title={enemy.name}>
            {enemy.name}
          </div>
          <div className="hd-hpbar" title={`${humanHp(enemy.hp)} / ${humanHp(enemy.maxHp)} HP`}>
            <div className="hd-hpbar-fill" style={{ width: `${hpPctVal}%` }} />
            {preview > 0 && (
              <div
                className="hd-hpbar-preview"
                style={{ width: `${previewPctVal}%`, left: `${Math.max(0, hpPctVal - previewPctVal)}%` }}
              />
            )}
            {blockPctVal > 0 && <div className="hd-hpbar-shield" style={{ width: `${blockPctVal}%` }} />}
          </div>
          <div className="hd-plate-hp">
            {humanHp(enemy.hp)}/{humanHp(enemy.maxHp)}
            {preview > 0 && <b className="hd-plate-hp-preview"> −{humanHp(preview)}{lethal ? " ☠" : ""}</b>}
          </div>
          {(isElite || enemy.block > 0 || enemy.denied || enemy.steadied || enemy.aimed || enemy.exposed) && (
            <div className="hd-status-row">
              {isElite && <span className="hd-status" data-k="sunder">ELITE</span>}
              {enemy.block > 0 && <span className="hd-status" data-k="shield">BLOCK {humanHp(enemy.block)}</span>}
              {enemy.exposed && (
                <span className="hd-status" data-k="sunder" title="Hit by Heavy: your other attacks deal bonus damage this round">
                  EXPOSED
                </span>
              )}
              {enemy.aimed && (
                <span className="hd-status" data-k="sunder" title="Aimed: its shown attack is already boosted 1.5×">
                  AIMED ×1.5
                </span>
              )}
              {enemy.denied && <span className="hd-status" data-k="invisible">DELAYED</span>}
              {!enemy.denied && enemy.steadied && <span className="hd-status" data-k="sunder">STEADIED</span>}
            </div>
          )}
        </div>
      )}

      {!dead && <div className="hd-target-arrow" aria-hidden="true">▲</div>}
    </div>
  );
}
