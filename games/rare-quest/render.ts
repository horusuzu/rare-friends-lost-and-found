/** Canvas presentation of a GameState. Visual only: nothing here changes game rules. */
import { spriteFrame, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { drawBattle, drawWorld, SCREEN_H, SCREEN_W, TILE, type FriendRows } from './art.ts';
import { battleView, STEP_TIME, type GameState } from './game.ts';
import { MAPS, isGrass } from './world.ts';

export interface RenderClock {
  /** Seconds since page start. */
  readonly now: number;
  readonly reduced: boolean;
  /** When the current battle started and when the current battle line appeared. */
  readonly battleAt: number;
  readonly lineAt: number;
}

function friendRows(sprites: GenerationSprites | null, face: 'up' | 'down' | 'left' | 'right', walking: boolean, frame: number): FriendRows | null {
  if (!sprites) return null;
  try { return spriteFrame(sprites, face, walking, frame % 8).frame.rows; } catch { return sprites.clips.idle.down[0]?.rows ?? null; }
}

/** Which side the current battle line damaged, for a short blink. */
export function hitSide(s: GameState): 'me' | 'foe' | null {
  if (s.scene.k !== 'battle' || s.scene.ui !== 'lines') return null;
  const line = s.scene.lines[s.scene.li], prev = s.scene.lines[s.scene.li - 1];
  if (!line || !prev || !line.sfx || !['hit', 'super', 'weak'].includes(line.sfx)) return null;
  if (line.snap.foeHp < prev.snap.foeHp) return 'foe';
  if (line.snap.myHp < prev.snap.myHp) return 'me';
  return null;
}

export function drawGame(c: CanvasRenderingContext2D, s: GameState, sprites: GenerationSprites | null, clock: RenderClock): void {
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, SCREEN_W, SCREEN_H);
  if (s.scene.k === 'battle') {
    const view = battleView(s)!;
    const flashing = !clock.reduced && clock.now - clock.lineAt < 0.45 ? hitSide(s) : null;
    drawBattle(c, {
      foeSpecies: view.foe.mon.species, foeVisible: view.foe.hp > 0,
      me: { species: view.me.mon.species, friend: friendRows(sprites, 'up', false, Math.floor(clock.now * 4)), visible: view.me.hp > 0 },
      intro: clock.reduced ? 1 : Math.min(1, (clock.now - clock.battleAt) / 0.6), flash: flashing, clock: clock.now,
    });
    return;
  }
  const map = MAPS[s.map];
  const t = s.walk ? Math.min(1, s.walk.t / STEP_TIME) : 1;
  const fx = s.walk ? s.walk.fromX + (s.x - s.walk.fromX) * t : s.x, fy = s.walk ? s.walk.fromY + (s.y - s.walk.fromY) * t : s.y;
  const frame = s.walk ? Math.floor(t * 4) + (s.steps % 2) * 4 : Math.floor(s.clock * 5);
  drawWorld(c, {
    rows: map.rows, outdoor: map.outdoor, npcs: map.npcs, px: fx * TILE, py: fy * TILE,
    friend: friendRows(sprites, s.face, s.walk !== null, frame), onGrass: isGrass(s.map, s.x, s.y) && t > 0.5, clock: s.clock,
  });
}
