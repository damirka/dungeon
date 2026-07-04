import { useEffect, useRef, useState } from "react";
import type { CSSProperties, JSX } from "react";
import {
  CREATURE_COLS,
  CREATURE_FRAMES,
  CREATURE_ROWS,
  CREATURE_SHEET,
  type Frame,
} from "../../game/spriteData";

export type ActorState = "idle" | "attack" | "hurt" | "cast" | "guard" | "dead";

// Preload the creature sheet at module load so the very first sprite paints
// immediately instead of flashing blank until the background image is fetched.
if (typeof Image !== "undefined") {
  const preload = new Image();
  preload.src = CREATURE_SHEET;
}

/** Renders a real Oryx creature/hero sprite, sliced from the 24px sheet, with a
 *  looping idle frame cycle plus state-driven lunge / hurt / cast / death. */
export function SpriteActor({
  id,
  size,
  state,
  flip = false,
  phase = 0,
}: {
  id: string;
  size: number;
  state: ActorState;
  flip?: boolean;
  phase?: number;
}): JSX.Element {
  const frames: Frame[] = (id && CREATURE_FRAMES[id]) || [[0, 0]];
  const [f, setF] = useState(0);
  const offset = useRef(phase % 5);

  useEffect(() => {
    if (frames.length < 2 || state === "dead") return;
    const ms = 360 + offset.current * 40;
    const t = window.setInterval(() => setF((i) => (i + 1) % frames.length), ms);
    return () => window.clearInterval(t);
  }, [frames.length, state]);

  const idx = state === "dead" ? 0 : Math.min(f, frames.length - 1);
  const [c, r] = frames[idx];

  const imgStyle: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${CREATURE_SHEET})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${CREATURE_COLS * size}px ${CREATURE_ROWS * size}px`,
    backgroundPosition: `${-c * size}px ${-r * size}px`,
    imageRendering: "pixelated",
  };

  const outerStyle = {
    width: size,
    height: size,
    "--lunge": flip ? "28px" : "-28px",
  } as CSSProperties;

  return (
    <div className="hd-sprite" data-state={state} style={outerStyle}>
      <div className="hd-sprite-flip" style={{ transform: flip ? "scaleX(-1)" : undefined, width: size, height: size }}>
        <div className="hd-sprite-img" style={imgStyle} />
      </div>
    </div>
  );
}
