/**
 * Flying coins, gems, sparks, chips and flames. Presentation only: it turns new engine effects into particles and
 * sound cues, and reports how much of the pot and safe balance has visibly landed. Browser randomness is fine here;
 * it never touches game outcomes.
 */
import type { Fx, MineState } from './game.ts';
import { LOSE_BEAT, WIN_PARTY_AT } from './reach.ts';
import { COIN_FRAMES, GEM, PALETTE as P, drawSprite } from './art.ts';
import { CART, FLOOR_Y, IMPACT, JAR } from './layout.ts';

export type CueKind = 'tock' | 'crumble' | 'land' | 'jar' | 'vein' | 'gem' | 'chaching';
export interface Cue { readonly k: CueKind; readonly n: number }
export interface View {
  /** Coins visibly in the cart (lags the pot while coins are in flight). */
  readonly pile: number;
  readonly jar: number;
  /** A burning pile that shrinks away after a lost bet. */
  readonly burning: number;
  /** How the burning pile looks: still gold in the beat of silence, then glowing, then charred and crumbling. */
  readonly burnLook: 'gold' | 'burn' | 'char';
  readonly shake: number;
  readonly flash: number;
  readonly flashColor: string;
  readonly cues: Cue[];
}
export interface Particles {
  reset(s: MineState): void;
  /** `top`: rows of canvas above the scene (the coin torrent pours in from the very top). */
  intake(s: MineState, now: number, reduced: boolean, top?: number): Cue[];
  step(s: MineState, now: number, reduced: boolean): View;
  draw(c: CanvasRenderingContext2D, now: number): void;
}

type Dest = 'cart' | 'jar' | 'none';
interface Coin { gem: boolean; x0: number; y0: number; x1: number; y1: number; t0: number; dur: number; h: number; value: number; dest: Dest; spin: number; fall?: boolean }
interface Bit { x: number; y: number; vx: number; vy: number; t0: number; life: number; color: string; g: number; size: number }

const MAX_COINS = 160, MAX_BITS = 260, BURN_TIME = 1.6;
/** The win torrent: coins pour for this long; more coins the longer the streak. */
const POUR_TIME = 2.2;
const torrentSize = (streak: number): number => Math.min(100, 40 + 15 * Math.max(0, streak - 1));
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const SPIN = [0, 1, 2, 3, 2, 1];

export function createParticles(): Particles {
  let coins: Coin[] = [], bits: Bit[] = [];
  let seen = 0, pile = 0, jar = 0, last = 0;
  let burnFrom = 0, burnAt = -10, shakeUntil = -10, flashAt = -10, flashPeak = 0, flashColor = '#ffffff';

  const addCoin = (c: Coin) => { if (coins.length < MAX_COINS) coins = [...coins, c]; };
  const addBit = (b: Bit) => { if (bits.length < MAX_BITS) bits = [...bits, b]; };
  function burst(n: number, x: number, y: number, now: number, colors: readonly string[], speed: number, g: number, life: number) {
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI, 0.3), v = rnd(speed * 0.4, speed);
      addBit({ x, y, vx: Math.cos(a) * v - speed * 0.3, vy: Math.sin(a) * v, t0: now, life: rnd(life * 0.6, life), color: colors[i % colors.length], g, size: 1 });
    }
  }
  function toCart(n: number, total: number, now: number, from: { x: number; y: number }, gem = false) {
    for (let i = 0; i < n; i++) {
      addCoin({ gem: gem && i === 0, x0: from.x + rnd(-2, 2), y0: from.y + rnd(-3, 3), x1: CART.x + CART.w / 2 + rnd(-16, 14), y1: CART.y - rnd(0, 6),
        t0: now + i * 0.035, dur: rnd(0.45, 0.62), h: rnd(22, 40), value: total / n, dest: 'cart', spin: Math.floor(rnd(0, 6)) });
    }
  }
  function flash(now: number, color: string, peak: number, reduced: boolean) { if (!reduced) { flashAt = now; flashColor = color; flashPeak = peak; } }

  function spawn(f: Fx, s: MineState, now: number, reduced: boolean, top: number): Cue[] {
    switch (f.kind) {
      case 'strike':
        // Cosmetic coins (real-mode taps) fly and clink but carry no value, so the pile never exceeds the real pot.
        toCart(reduced ? 1 : Math.min(6, f.coins), f.cosmetic ? 0 : f.coins, now + 0.05, IMPACT);
        if (!reduced) { burst(6, IMPACT.x, IMPACT.y, now, [P.goldHi, P.glow, '#ffffff'], 70, 60, 0.3); burst(4, IMPACT.x, IMPACT.y, now, [P.dust, P.rockHi], 50, 240, 0.6); }
        return [{ k: 'tock', n: f.tap ? 1 : 0 }];
      case 'vein':
        toCart(reduced ? 2 : 10, f.coins, now + 0.05, IMPACT);
        if (!reduced) burst(14, IMPACT.x, IMPACT.y, now, [P.gold, P.goldHi], 90, 80, 0.5);
        return [{ k: 'tock', n: 1 }, { k: 'vein', n: f.coins }];
      case 'gem':
        toCart(reduced ? 3 : 14, f.coins, now + 0.05, IMPACT, true);
        if (!reduced) { burst(18, IMPACT.x, IMPACT.y, now, [P.gemHi, P.gem, '#ffffff'], 110, 40, 0.7); shakeUntil = now + 0.25; }
        flash(now, '#ffffff', 0.45, reduced);
        return [{ k: 'tock', n: 1 }, { k: 'gem', n: f.coins }];
      case 'break':
        burst(reduced ? 3 : 18, IMPACT.x + 6, IMPACT.y, now, [P.rockHi, P.dust, P.rock], 80, 260, 0.8);
        if (!reduced) shakeUntil = Math.max(shakeUntil, now + 0.15);
        toCart(1, f.cosmetic ? 0 : f.coins, now + 0.1, IMPACT);
        return [{ k: 'crumble', n: 1 }];
      case 'withdraw': {
        const n = reduced ? 3 : 16;
        for (let i = 0; i < n; i++) {
          addCoin({ gem: false, x0: CART.x + rnd(6, CART.w - 6), y0: CART.y - rnd(0, 8), x1: JAR.x + JAR.w / 2 + rnd(-6, 6), y1: JAR.y + 4,
            t0: now + i * 0.04, dur: rnd(0.5, 0.7), h: rnd(30, 50), value: f.coins / n, dest: 'jar', spin: Math.floor(rnd(0, 6)) });
        }
        return [{ k: 'chaching', n: f.coins }];
      }
      case 'roll': return [];
      case 'win': {
        // ジャラジャラ: a torrent of coins pours from the top of the screen into the cart after the flash.
        const n = reduced ? 3 : torrentSize(s.streak);
        for (let i = 0; i < n; i++) {
          addCoin({ gem: false, x0: CART.x + CART.w / 2 + rnd(-34, 34), y0: -top - rnd(8, 40), x1: CART.x + CART.w / 2 + rnd(-16, 14), y1: CART.y - rnd(0, 6),
            t0: now + WIN_PARTY_AT + (i / n) * (reduced ? 0.4 : POUR_TIME) + rnd(0, 0.04), dur: rnd(0.45, 0.75), h: 0, value: f.coins / n, dest: 'cart',
            spin: Math.floor(rnd(0, 6)), fall: true });
        }
        return [];
      }
      case 'burn': {
        // The pile keeps its shape through the beat of silence, then burns, blackens and crumbles (fx-lose.ts draws the fire).
        burnFrom = pile; burnAt = now + (reduced ? 0 : LOSE_BEAT); pile = 0;
        return [];
      }
      default: return [];
    }
  }

  return {
    reset(s) { coins = []; bits = []; seen = s.fxId; pile = s.pot; jar = s.safe; burnAt = -10; flashAt = -10; shakeUntil = -10; },
    intake(s, now, reduced, top = 0) {
      const fresh = s.fx.filter(f => f.id > seen);
      if (s.fxId < seen) seen = s.fxId;
      seen = Math.max(seen, s.fxId);
      return fresh.flatMap(f => spawn(f, s, now, reduced, top));
    },
    step(s, now, reduced) {
      const dt = Math.min(0.05, Math.max(0, now - last)); last = now;
      let landed = 0, jarLanded = 0;
      const flying: Coin[] = [];
      for (const c of coins) {
        if (now < c.t0 + c.dur) { flying.push(c); continue; }
        if (c.dest === 'cart') { pile += c.value; landed++; }
        if (c.dest === 'jar') { jar += c.value; jarLanded++; }
      }
      coins = flying;
      bits = bits.filter(b => now < b.t0 + b.life).map(b => now < b.t0 ? b : { ...b, x: b.x + b.vx * dt, y: Math.min(FLOOR_Y, b.y + b.vy * dt), vy: b.vy + b.g * dt });
      const pending = (d: Dest) => coins.reduce((n, c) => n + (c.dest === d ? c.value : 0), 0);
      pile = Math.min(pile, s.pot); jar = Math.min(jar, s.safe);
      const catchUp = (shown: number, target: number) => target > shown + 0.5 ? shown + (target - shown) * Math.min(1, dt * 8) : shown;
      pile = Math.max(0, catchUp(pile, s.pot - pending('cart')));
      jar = Math.max(0, catchUp(jar, s.safe - pending('jar')));
      const p = (now - burnAt) / BURN_TIME;
      const f = (now - flashAt) / 0.35;
      return {
        pile, jar, burning: p < 0 ? burnFrom : p >= 0 && p < 1 ? burnFrom * (1 - p * p) : 0, burnLook: p < 0 ? 'gold' : p > 0.45 ? 'char' : 'burn',
        shake: !reduced && now < shakeUntil ? 1 : 0, flash: f >= 0 && f < 1 ? flashPeak * (1 - f) : 0, flashColor,
        cues: [...(landed ? [{ k: 'land' as const, n: landed }] : []), ...(jarLanded ? [{ k: 'jar' as const, n: jarLanded }] : [])],
      };
    },
    draw(c, now) {
      for (const b of bits) {
        if (now < b.t0) continue;
        c.globalAlpha = Math.max(0, 1 - (now - b.t0) / b.life);
        c.fillStyle = b.color; c.fillRect(Math.round(b.x), Math.round(b.y), b.size, b.size);
      }
      c.globalAlpha = 1;
      for (const k of coins) {
        if (now < k.t0) continue;
        const t = (now - k.t0) / k.dur, x = k.x0 + (k.x1 - k.x0) * t, y = k.fall ? k.y0 + (k.y1 - k.y0) * t * t : k.y0 + (k.y1 - k.y0) * t - k.h * 4 * t * (1 - t);
        if (k.gem) drawSprite(c, GEM, x - 7, y - 7, 2);
        else { const fr = COIN_FRAMES[SPIN[(Math.floor(now * 14) + k.spin) % SPIN.length]]; drawSprite(c, fr, x - 3, y - 3); }
      }
    },
  };
}
