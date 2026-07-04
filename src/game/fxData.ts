/** Auto-generated FX sprite map from oryx_creature_fx_catalog.json (oryx_fx.png). */
export const FX_SHEET = "/room-assets/oryx_fx.png";
export const FX_SHEET_W = 256;
export const FX_SHEET_H = 256;
export interface FxSprite { x: number; y: number; w: number; h: number; hex: string }
export type FxKey = "hit" | "crit" | "quick" | "guard" | "magic" | "heal" | "loot" | "hurt" | "slash";
export const FX_SPRITES: Record<FxKey, FxSprite> = {"hit":{"x":73,"y":1,"w":22,"h":22,"hex":"#f66a00"},"crit":{"x":121,"y":1,"w":22,"h":22,"hex":"#ff0000"},"quick":{"x":169,"y":1,"w":22,"h":22,"hex":"#afafaf"},"guard":{"x":29,"y":5,"w":14,"h":14,"hex":"#f3f3f3"},"magic":{"x":198,"y":53,"w":13,"h":13,"hex":"#9b4dc6"},"heal":{"x":177,"y":125,"w":8,"h":13,"hex":"#1aa140"},"loot":{"x":101,"y":100,"w":14,"h":16,"hex":"#a6b62b"},"hurt":{"x":121,"y":1,"w":22,"h":22,"hex":"#ff0000"},"slash":{"x":81,"y":29,"w":5,"h":13,"hex":"#6a6a6a"}};
