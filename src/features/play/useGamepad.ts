import { useEffect, useRef, useState } from "react";

/**
 * Minimal gamepad layer for the playable game (standard button mapping).
 *
 * Each interested surface mounts its own hook and interprets the semantic
 * events for its phase — explore moves the hero, combat maps face buttons to
 * actions, the loot draft moves a cursor. Edge-triggered buttons; held
 * d-pad/stick emits `move` immediately and then repeats. A pad attached with
 * buttons already held emits nothing until the next fresh press, so phase
 * changes never replay the button that caused them.
 *
 * Default scheme (change freely later):
 *   A attack/confirm · X heavy · Y bash · B guard/skip · LB sweep · RB ability
 *   RT or Start end turn · d-pad / left stick move + cycle target/choice
 */

export type PadButton = "a" | "b" | "x" | "y" | "lb" | "rb" | "lt" | "rt" | "select" | "start";

export type PadEvent =
  | { kind: "button"; button: PadButton }
  | { kind: "move"; dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

const BUTTON_NAMES: Record<number, PadButton> = {
  0: "a",
  1: "b",
  2: "x",
  3: "y",
  4: "lb",
  5: "rb",
  6: "lt",
  7: "rt",
  8: "select",
  9: "start",
};

const STICK_DEADZONE = 0.45;
const MOVE_REPEAT_MS = 150;

/** Polls the first connected gamepad and reports semantic events. Returns whether a pad is connected. */
export function useGamepad(onEvent: (event: PadEvent) => void, enabled = true): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.getGamepads) return;
    let raf = 0;
    let prev: boolean[] | null = null;
    let lastDir = "0,0";
    let lastMoveAt = 0;

    const poll = (now: number) => {
      raf = requestAnimationFrame(poll);
      const pad = [...navigator.getGamepads()].find((p): p is Gamepad => Boolean(p && p.connected));
      if (!pad) {
        if (prev) {
          prev = null;
          setConnected(false);
        }
        return;
      }
      if (!prev) {
        // swallow whatever is held at attach / mount time
        setConnected(true);
        prev = pad.buttons.map((b) => b.pressed);
        lastDir = "0,0";
        return;
      }

      pad.buttons.forEach((button, index) => {
        const name = BUTTON_NAMES[index];
        if (name && button.pressed && !prev![index]) handler.current({ kind: "button", button: name });
      });

      // d-pad (12-15) or left stick with a deadzone
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const dx = pad.buttons[14]?.pressed || ax < -STICK_DEADZONE ? -1 : pad.buttons[15]?.pressed || ax > STICK_DEADZONE ? 1 : 0;
      const dy = pad.buttons[12]?.pressed || ay < -STICK_DEADZONE ? -1 : pad.buttons[13]?.pressed || ay > STICK_DEADZONE ? 1 : 0;
      const dir = `${dx},${dy}`;
      if ((dx || dy) && (dir !== lastDir || now - lastMoveAt >= MOVE_REPEAT_MS)) {
        lastMoveAt = now;
        handler.current({ kind: "move", dx, dy });
      }
      lastDir = dir;
      prev = pad.buttons.map((b) => b.pressed);
    };

    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return connected;
}
