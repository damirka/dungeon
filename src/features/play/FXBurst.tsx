import type { CSSProperties, JSX } from "react";
import { FX_SHEET, FX_SHEET_H, FX_SHEET_W, FX_SPRITES, type FxKey } from "../../game/fxData";

/** Renders a single Oryx FX sprite (oryx_fx.png) as a pop-in impact effect. */
export function FXBurst({ fxKey, x, y, size = 76 }: { fxKey: FxKey; x: number; y: number; size?: number }): JSX.Element {
  const s = FX_SPRITES[fxKey];
  const scale = size / Math.max(s.w, s.h);
  const style: CSSProperties = {
    left: x,
    top: y,
    width: s.w * scale,
    height: s.h * scale,
    backgroundImage: `url(${FX_SHEET})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${FX_SHEET_W * scale}px ${FX_SHEET_H * scale}px`,
    backgroundPosition: `${-s.x * scale}px ${-s.y * scale}px`,
    imageRendering: "pixelated",
    ["--glow" as string]: s.hex,
  };
  return <span className="hd-fx" data-key={fxKey} style={style} />;
}
