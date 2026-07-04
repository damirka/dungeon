import type { CSSProperties, JSX } from "react";
import { CREATURE_COLS, CREATURE_FRAMES, CREATURE_NAMES, CREATURE_ROWS, CREATURE_SHEET, CREATURE_TILE } from "../../game/spriteData";

/** Static creature sprite chip from the shared Oryx creatures sheet. */
export function CreatureSprite({ id, size = 36, className = "" }: { id: string; size?: number; className?: string }): JSX.Element {
  const frame = CREATURE_FRAMES[id]?.[0];
  if (!frame) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded bg-black/40 text-[10px] text-neutral-500 ${className}`}
        style={{ width: size, height: size }}
        title={id}
      >
        ?
      </span>
    );
  }
  const scale = size / CREATURE_TILE;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${CREATURE_SHEET})`,
    backgroundPosition: `-${frame[0] * CREATURE_TILE * scale}px -${frame[1] * CREATURE_TILE * scale}px`,
    backgroundSize: `${CREATURE_COLS * CREATURE_TILE * scale}px ${CREATURE_ROWS * CREATURE_TILE * scale}px`,
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
  };
  return <span className={`inline-block shrink-0 ${className}`} style={style} title={CREATURE_NAMES[id] || id} />;
}
