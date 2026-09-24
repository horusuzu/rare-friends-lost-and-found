/**
 * Sticker renderer. Eight finishes (matte, patch, puffy, clear, glitter, holo, prism, gold) over
 * eight backdrops, all drawn in code around the Friend's canonical pixel sprite. `tilt` (-1..1)
 * moves the foil and sheen so shiny stickers glint as the viewer moves the pointer.
 */
import { STYLES, RARITY_LABEL, stickerName, type Sticker } from './album.js';

export type Sprite = readonly string[];
export interface Tilt { x: number; y: number }
const HUES = [352, 18, 38, 55, 90, 145, 175, 198, 222, 262, 292, 322];
const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h} ${s}% ${l}% / ${a})`;

function hash(n: number): () => number {
  let s = n >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}

/** Pixel sprite as filled cells; `pad` grows each cell for outlines. */
function spritePath(c: CanvasRenderingContext2D, rows: Sprite, x: number, y: number, size: number, pad = 0): void {
  const cell = size / rows[0].length;
  c.beginPath();
  rows.forEach((row, j) => [...row].forEach((p, i) => {
    if (p === '#') c.rect(x + i * cell - pad, y + j * cell - pad, cell + pad * 2, cell + pad * 2);
  }));
}

function backdrop(c: CanvasRenderingContext2D, s: Sticker, S: number, hue: number): void {
  const base = c.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, hsl(hue, 85, 72)); base.addColorStop(1, hsl(hue + 30, 80, 58));
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  const ink = hsl(hue + 180, 70, 92, 0.45), cx = S / 2, cy = S * 0.54, r = hash(s.serial * 31 + s.backdrop);
  c.fillStyle = ink; c.strokeStyle = ink;
  switch (s.backdrop) {
    case 0: // burst rays
      for (let i = 0; i < 24; i += 2) {
        const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a0) * S, cy + Math.sin(a0) * S); c.lineTo(cx + Math.cos(a1) * S, cy + Math.sin(a1) * S); c.fill();
      }
      break;
    case 1: // checker
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) c.fillRect(x * S / 8, y * S / 8, S / 8, S / 8);
      break;
    case 2: // polka dots
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { c.beginPath(); c.arc((x + (y % 2) * 0.5) * S / 6.5, y * S / 6.5, S * 0.035, 0, Math.PI * 2); c.fill(); }
      break;
    case 3: // diagonal stripes
      c.lineWidth = S * 0.05;
      for (let i = -S; i < S * 2; i += S * 0.13) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i - S, S); c.stroke(); }
      break;
    case 4: // stars
      for (let i = 0; i < 14; i++) star(c, r() * S, r() * S, S * (0.02 + r() * 0.03));
      break;
    case 5: // hearts
      for (let i = 0; i < 12; i++) heart(c, r() * S, r() * S, S * (0.03 + r() * 0.03));
      break;
    case 6: // concentric rings
      c.lineWidth = S * 0.035;
      for (let rr = S * 0.1; rr < S; rr += S * 0.1) { c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke(); }
      break;
    default: // spotlight grid
      c.lineWidth = 1.5;
      for (let i = 0; i <= S; i += S / 10) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, S); c.moveTo(0, i); c.lineTo(S, i); c.stroke(); }
      c.fillStyle = hsl(hue + 180, 80, 96, 0.4); c.beginPath(); c.arc(cx, cy, S * 0.32, 0, Math.PI * 2); c.fill();
  }
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill();
}
function heart(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath(); c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); c.fill();
}

/** Rainbow foil across the whole card, shifted by tilt. */
function foil(c: CanvasRenderingContext2D, S: number, tilt: Tilt, strength: number, diamonds: boolean): void {
  c.save(); c.globalCompositeOperation = 'color-dodge';
  const shift = (tilt.x + tilt.y) * S * 0.6;
  const g = c.createLinearGradient(-S + shift, 0, S * 2 + shift, S);
  ['#ff5fd2', '#ffd36b', '#8dff9b', '#5ff2ff', '#a78bff', '#ff5fd2', '#ffd36b'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
  c.globalAlpha = strength; c.fillStyle = g; c.fillRect(0, 0, S, S);
  if (diamonds) {
    c.globalAlpha = strength * 0.9; c.globalCompositeOperation = 'overlay';
    const step = S / 11;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      c.fillStyle = hsl((x * 40 + y * 25 + tilt.x * 180) % 360, 100, (x + y) % 2 ? 80 : 45);
      c.beginPath(); c.moveTo(x * step, y * step - step / 2); c.lineTo(x * step + step / 2, y * step); c.lineTo(x * step, y * step + step / 2); c.lineTo(x * step - step / 2, y * step); c.fill();
    }
  }
  c.restore();
}

function sheen(c: CanvasRenderingContext2D, S: number, tilt: Tilt, alpha: number): void {
  const pos = (tilt.x * 0.5 + 0.5) * S * 1.6 - S * 0.3;
  const g = c.createLinearGradient(pos - S * 0.25, 0, pos + S * 0.25, S * 0.3);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, S, S);
}

function character(c: CanvasRenderingContext2D, rows: Sprite | null, S: number, fill: string | CanvasGradient, outline: string, emboss: boolean): void {
  const size = S * 0.56, x = (S - size) / 2, y = S * 0.24, cell = size / 16;
  if (!rows) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + size * 0.3, y + size * 0.3, size * 0.4, size * 0.4); return; }
  c.fillStyle = '#ffffff'; spritePath(c, rows, x, y, size, cell * 0.9); c.fill();
  c.fillStyle = outline; spritePath(c, rows, x, y, size, cell * 0.45); c.fill();
  if (emboss) {
    c.fillStyle = 'rgba(0,0,0,.25)'; spritePath(c, rows, x + cell * 0.25, y + cell * 0.25, size); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)'; spritePath(c, rows, x - cell * 0.2, y - cell * 0.2, size); c.fill();
  }
  c.fillStyle = fill; spritePath(c, rows, x, y, size); c.fill();
}

function nameplate(c: CanvasRenderingContext2D, s: Sticker, S: number, lang: 'ja' | 'en', fg: string, bg: string): void {
  const name = stickerName(s, lang);
  c.fillStyle = bg; roundRect(c, S * 0.08, S * 0.045, S * 0.84, S * 0.14, S * 0.05); c.fill();
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `900 ${Math.round(S * (name.length > 9 ? 0.065 : 0.08))}px system-ui, sans-serif`;
  c.fillText(name, S / 2, S * 0.117, S * 0.8);
  const style = STYLES[s.style], rarity = RARITY_LABEL[style.rarity][lang === 'ja' ? 0 : 1];
  c.font = `800 ${Math.round(S * 0.045)}px system-ui, sans-serif`; c.textAlign = 'left';
  c.fillStyle = bg; roundRect(c, S * 0.06, S * 0.86, S * 0.4, S * 0.09, S * 0.04); c.fill();
  c.fillStyle = fg; c.fillText(`${'★'.repeat(style.rarity)} ${rarity}`, S * 0.09, S * 0.907);
  c.textAlign = 'right'; c.fillStyle = bg; roundRect(c, S * 0.56, S * 0.86, S * 0.38, S * 0.09, S * 0.04); c.fill();
  c.fillStyle = fg; c.fillText(`No.${String(s.serial).padStart(4, '0')}`, S * 0.91, S * 0.907);
}

/** Draw a whole sticker into a square canvas of side S. */
export function drawSticker(c: CanvasRenderingContext2D, s: Sticker, rows: Sprite | null, S: number, lang: 'ja' | 'en', tilt: Tilt = { x: 0, y: 0 }, time = 0): void {
  const hue = HUES[s.hue], id = STYLES[s.style].id, radius = S * 0.1;
  c.clearRect(0, 0, S, S); c.save();
  if (id === 'clear') {
    // Clear vinyl: no card, a thin white die-cut around the Friend and a glassy streak.
    c.fillStyle = 'rgba(255,255,255,.14)'; roundRect(c, S * 0.04, S * 0.04, S * 0.92, S * 0.92, radius); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.stroke();
    character(c, rows, S, hsl(hue, 80, 55, 0.85), hsl(hue, 60, 25, 0.9), false);
    sheen(c, S, tilt, 0.45);
    nameplate(c, s, S, lang, '#fff', hsl(hue, 60, 30, 0.55));
    c.restore(); return;
  }
  // Every other finish is a die-cut card.
  c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = id === 'puffy' ? S * 0.06 : S * 0.02; c.shadowOffsetY = id === 'puffy' ? S * 0.03 : S * 0.01;
  c.fillStyle = '#fff'; roundRect(c, S * 0.02, S * 0.02, S * 0.96, S * 0.96, radius * (id === 'puffy' ? 2.4 : 1)); c.fill();
  c.shadowColor = 'transparent';
  roundRect(c, S * 0.05, S * 0.05, S * 0.9, S * 0.9, radius * (id === 'puffy' ? 2.2 : 0.8)); c.clip();

  if (id === 'gold') {
    const g = c.createLinearGradient(0, 0, S, S);
    const shift = tilt.x * 0.15;
    [[0, '#7a5a12'], [0.3 + shift, '#f7df8c'], [0.5 + shift, '#fff6c9'], [0.7 + shift, '#d6a93a'], [1, '#6e4c0c']].forEach(([o, col]) => g.addColorStop(Math.max(0, Math.min(1, o as number)), col as string));
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.globalAlpha = 0.25; c.fillStyle = '#fff6c9';
    for (let i = 0; i < 24; i += 2) {
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
      c.beginPath(); c.moveTo(S / 2, S * 0.54); c.lineTo(S / 2 + Math.cos(a0) * S, S * 0.54 + Math.sin(a0) * S); c.lineTo(S / 2 + Math.cos(a1) * S, S * 0.54 + Math.sin(a1) * S); c.fill();
    }
    c.globalAlpha = 1;
    const body = c.createLinearGradient(0, S * 0.24, 0, S * 0.8); body.addColorStop(0, '#fff3b8'); body.addColorStop(1, '#b98a1d');
    character(c, rows, S, body, '#5a3f06', true);
    sheen(c, S, tilt, 0.7);
    c.strokeStyle = '#fff6c9'; c.lineWidth = S * 0.012; roundRect(c, S * 0.085, S * 0.085, S * 0.83, S * 0.83, radius * 0.6); c.stroke();
    nameplate(c, s, S, lang, '#fff6c9', 'rgba(70,45,5,.8)');
    c.restore(); return;
  }

  backdrop(c, s, S, hue);
  if (id === 'patch') {
    // Woven fabric texture and stitched border.
    c.strokeStyle = 'rgba(0,0,0,.08)'; c.lineWidth = 1;
    for (let i = 0; i < S; i += 3) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, S); c.stroke(); }
    c.setLineDash([S * 0.025, S * 0.018]); c.strokeStyle = hsl(hue, 60, 95); c.lineWidth = S * 0.012;
    roundRect(c, S * 0.08, S * 0.08, S * 0.84, S * 0.84, radius * 0.6); c.stroke(); c.setLineDash([]);
  }
  const fill = id === 'patch' ? hsl(hue + 180, 55, 45) : hsl(hue + 180, 75, 40);
  character(c, rows, S, fill, '#141018', id === 'puffy');
  if (id === 'patch' && rows) {
    // Satin-stitch grain across the character.
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1;
    const size = S * 0.56, x0 = (S - size) / 2, y0 = S * 0.24, cell = size / 16;
    rows.forEach((row, j) => [...row].forEach((p, i) => { if (p === '#') { c.beginPath(); c.moveTo(x0 + i * cell, y0 + j * cell + cell); c.lineTo(x0 + i * cell + cell, y0 + j * cell); c.stroke(); } }));
  }
  if (id === 'puffy') {
    // Inflated dome: dark rim, bright top-left bubble highlight.
    const dome = c.createRadialGradient(S * 0.35, S * 0.3, S * 0.05, S * 0.5, S * 0.5, S * 0.75);
    dome.addColorStop(0, 'rgba(255,255,255,.55)'); dome.addColorStop(0.45, 'rgba(255,255,255,0)'); dome.addColorStop(1, 'rgba(0,0,0,.35)');
    c.fillStyle = dome; c.fillRect(0, 0, S, S);
    c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.ellipse(S * 0.27 + tilt.x * S * 0.03, S * 0.22 + tilt.y * S * 0.03, S * 0.12, S * 0.05, -0.6, 0, Math.PI * 2); c.fill();
  }
  if (id === 'glitter') {
    const r = hash(s.serial * 97 + 11);
    for (let i = 0; i < 90; i++) {
      const x = r() * S, y = r() * S, phase = r() * 6.28;
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(time * 3 + phase + tilt.x * 4 + tilt.y * 3));
      c.fillStyle = `hsla(${(r() * 360) | 0} 100% 85% / ${tw})`;
      const k = S * (0.006 + r() * 0.01); c.fillRect(x - k, y - k, k * 2, k * 2);
      if (tw > 0.9) { c.fillStyle = `rgba(255,255,255,${tw})`; star(c, x, y, k * 2.6); }
    }
  }
  if (id === 'holo') { foil(c, S, tilt, 0.55, false); sheen(c, S, tilt, 0.4); }
  if (id === 'prism') {
    foil(c, S, tilt, 0.7, true); sheen(c, S, tilt, 0.5);
    // Ornate corners, like old collectible stickers.
    c.fillStyle = '#fff'; for (const [x, y] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]]) star(c, S * x, S * y, S * 0.045);
  }
  nameplate(c, s, S, lang, '#fff', id === 'prism' ? 'rgba(20,10,40,.8)' : hsl(hue, 55, 25, 0.8));
  c.restore();
}
