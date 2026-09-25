/** Fixed positions in the 256 × 160 pixel mine scene, shared by the renderer and the particle system. */
export const SCENE_W = 256;
/** The scene is laid out for 160 rows; taller (portrait) canvases add up to 112 rows of rock ceiling above it. */
export const SCENE_H = 160;
export const SCENE_H_MAX = 272;
/** Canvas height that best fills a box of the given aspect ratio (width / height), in steps of 8 rows. */
export function sceneHeight(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return SCENE_H;
  return Math.min(SCENE_H_MAX, Math.max(SCENE_H, Math.floor(SCENE_W / aspect / 8) * 8));
}
export const FLOOR_Y = 128;
export const ROCK_X = 184;
/** Where the pickaxe meets the rock. */
export const IMPACT = { x: 188, y: 98 } as const;
/** The mine cart that holds the pot (top-left corner of its rim, width). */
export const CART = { x: 52, y: 108, w: 48 } as const;
/** The glass jar that holds the safe balance. */
export const JAR = { x: 8, y: 84, w: 24, h: 42 } as const;
