import { useEffect, useRef } from 'react';
import { CARD_RATIO, drawCard, type Sprite, type Tilt } from './art.ts';
import { ELEMENTS, cardStats } from './cards.ts';
import { stickerName, type Sticker } from './album.ts';

interface Props { sticker: Sticker; rows: Sprite | null; width: number; lang: 'ja' | 'en'; live?: boolean; reduced?: boolean; label?: string }
/**
 * One trading card on a canvas; `live` animates foil/glitter and follows the pointer or a dragging finger.
 * Without a pointer on it (touch screens between drags) the glint sways gently on its own, so shiny
 * finishes shine on phones without device-orientation access.
 */
export function CardCanvas({ sticker, rows, width, lang, live = false, reduced = false, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null), tilt = useRef<Tilt>({ x: 0, y: 0 }), held = useRef(false);
  useEffect(() => {
    const canvas = ref.current, c = canvas?.getContext('2d');
    if (!canvas || !c) return;
    const scale = Math.min(2, globalThis.devicePixelRatio || 1), W = Math.round(width * scale);
    canvas.width = W; canvas.height = Math.round(W * CARD_RATIO);
    const stats = cardStats(sticker), element = ELEMENTS[stats.element][lang === 'ja' ? 0 : 1];
    if (!live || reduced) { drawCard(c, sticker, rows, W, lang, stats, element, tilt.current); return; }
    let frame = 0;
    const tick = (now: number) => {
      const t = now / 1000;
      // Ease toward a slow figure-eight while nothing is pointing at the card.
      if (!held.current) tilt.current = sway(tilt.current, t);
      drawCard(c, sticker, rows, W, lang, stats, element, tilt.current, t); frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sticker, rows, width, lang, live, reduced]);
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    held.current = true;
    tilt.current = { x: clamp(((e.clientX - r.left) / r.width) * 2 - 1), y: clamp(((e.clientY - r.top) / r.height) * 2 - 1) };
  };
  // A mouse hovering keeps the glint where it points; a lifted or cancelled finger hands it back to the sway.
  const release = (e: React.PointerEvent<HTMLCanvasElement>) => { if (e.type === 'pointerleave' || e.pointerType !== 'mouse') held.current = false; };
  const hidden = label === '';
  return <canvas ref={ref} className={live ? 'card-canvas live' : 'card-canvas'} style={{ width, height: Math.round(width * CARD_RATIO) }} role={hidden ? undefined : 'img'}
    aria-hidden={hidden || undefined} aria-label={hidden ? undefined : label ?? stickerName(sticker, lang)}
    {...(live ? { onPointerDown: move, onPointerMove: move, onPointerUp: release, onPointerCancel: release, onPointerLeave: release } : {})} />;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
/** One animation step toward the idle sway: a gentle ±0.6 × ±0.4 figure-eight every ~7 seconds. */
function sway(from: Tilt, t: number): Tilt {
  const to = { x: Math.sin(t * 0.9) * 0.6, y: Math.sin(t * 1.8) * 0.4 };
  return { x: from.x + (to.x - from.x) * 0.06, y: from.y + (to.y - from.y) * 0.06 };
}
