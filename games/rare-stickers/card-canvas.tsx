import { useEffect, useRef } from 'react';
import { CARD_RATIO, drawCard, type Sprite, type Tilt } from './art.ts';
import { ELEMENTS, cardStats } from './cards.ts';
import { stickerName, type Sticker } from './album.ts';

interface Props { sticker: Sticker; rows: Sprite | null; width: number; lang: 'ja' | 'en'; live?: boolean; reduced?: boolean; label?: string }
/** One trading card on a canvas; `live` animates foil/glitter and follows the pointer. */
export function CardCanvas({ sticker, rows, width, lang, live = false, reduced = false, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null), tilt = useRef<Tilt>({ x: 0, y: 0 });
  useEffect(() => {
    const canvas = ref.current, c = canvas?.getContext('2d');
    if (!canvas || !c) return;
    const scale = Math.min(2, globalThis.devicePixelRatio || 1), W = Math.round(width * scale);
    canvas.width = W; canvas.height = Math.round(W * CARD_RATIO);
    const stats = cardStats(sticker), element = ELEMENTS[stats.element][lang === 'ja' ? 0 : 1];
    if (!live || reduced) { drawCard(c, sticker, rows, W, lang, stats, element, tilt.current); return; }
    let frame = 0;
    const tick = (now: number) => { drawCard(c, sticker, rows, W, lang, stats, element, tilt.current, now / 1000); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sticker, rows, width, lang, live, reduced]);
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    tilt.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
  };
  const hidden = label === '';
  return <canvas ref={ref} className="card-canvas" style={{ width, height: Math.round(width * CARD_RATIO) }} role={hidden ? undefined : 'img'}
    aria-hidden={hidden || undefined} aria-label={hidden ? undefined : label ?? stickerName(sticker, lang)} onPointerMove={live ? move : undefined} />;
}
