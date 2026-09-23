/** Orb palette and 8×8 motifs drawn by this game. Tier 11 uses the player's canonical Friend sprite. */
import { radius, TIERS, type State, WIDTH, HEIGHT, FLOOR, DROP_Y, DANGER_Y } from './engine.js';

export interface Tier { ja: string; en: string; fill: string; rim: string; ink: string; motif: string }
export const TIER_INFO: readonly Tier[] = [
  { ja: 'しずく', en: 'Drop', fill: '#ff9db1', rim: '#c9587a', ink: '#fff4f6', motif: '00011000/00111100/01111110/01111110/11111111/11111111/01111110/00111100' },
  { ja: 'たね', en: 'Seed', fill: '#ffbd76', rim: '#c47a32', ink: '#5a3312', motif: '00000000/00011000/00111100/01111110/01111110/00111100/00011000/00000000' },
  { ja: 'めばえ', en: 'Sprout', fill: '#ffe26f', rim: '#b99a1f', ink: '#3f6d1c', motif: '01100110/11110111/01111110/00011000/00011000/00011000/00111100/00000000' },
  { ja: 'クローバー', en: 'Clover', fill: '#a3e86a', rim: '#5f9d2c', ink: '#f4ffe6', motif: '01100110/11111111/11111111/01111110/01111110/11111111/11011011/00011000' },
  { ja: 'かいがら', en: 'Shell', fill: '#63d8c4', rim: '#2a8f80', ink: '#f0fffb', motif: '00011000/00111100/01011010/01011010/11011011/11011011/11111111/01111110' },
  { ja: 'おつきさま', en: 'Moon', fill: '#6fbaff', rim: '#2f73b8', ink: '#fffbd8', motif: '00111100/01110000/11100000/11100000/11100000/11100000/01110000/00111100' },
  { ja: 'わくせい', en: 'Planet', fill: '#a293ff', rim: '#5d4fc0', ink: '#f7f3ff', motif: '00000000/00111100/01111110/11111111/11111111/01111110/00111100/00000000' },
  { ja: 'リングせい', en: 'Ringed', fill: '#e48dff', rim: '#9a45b8', ink: '#fff0ff', motif: '00000000/00111100/01111110/11111111/01111110/00111100/00000000/00000000' },
  { ja: 'たいよう', en: 'Sun', fill: '#ff7a64', rim: '#b83c28', ink: '#fff2b0', motif: '10011001/01011010/00111100/11111111/11111111/00111100/01011010/10011001' },
  { ja: 'ぎんが', en: 'Galaxy', fill: '#4150a8', rim: '#232c6c', ink: '#e5ecff', motif: '10000010/00111000/01000101/01011001/10011010/10100010/00011100/01000001' },
  { ja: 'あなたのFriend', en: 'Your Friend', fill: '#d3ff64', rim: '#86a832', ink: '#142011', motif: '' },
];
if (TIER_INFO.length !== TIERS) throw new Error('Tier art must match engine tiers.');

export type Sprite = readonly string[];

function bitmap(c: CanvasRenderingContext2D, rows: readonly string[], x: number, y: number, size: number, color: string): void {
  c.fillStyle = color;
  const cell = size / rows[0].length;
  rows.forEach((row, j) => [...row].forEach((p, i) => {
    if (p === '#' || p === '1') c.fillRect(Math.floor(x - size / 2 + i * cell), Math.floor(y - size / 2 + j * cell), Math.ceil(cell), Math.ceil(cell));
  }));
}

export function drawOrb(c: CanvasRenderingContext2D, tier: number, x: number, y: number, friend: Sprite | null, scale = 1): void {
  const info = TIER_INFO[tier - 1], r = radius(tier) * scale;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = info.fill; c.fill();
  c.lineWidth = Math.max(2, r * 0.09); c.strokeStyle = info.rim; c.stroke();
  c.beginPath(); c.arc(x - r * 0.34, y - r * 0.38, r * 0.2, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
  if (tier === TIERS) {
    if (friend) bitmap(c, friend, x, y + r * 0.04, r * 1.3, info.ink);
    return;
  }
  bitmap(c, info.motif.split('/'), x, y, r * 1.02, info.ink);
}

export function drawJar(c: CanvasRenderingContext2D, s: State, friend: Sprite | null, reduced: boolean, active: boolean): void {
  const glow = c.createLinearGradient(0, 0, 0, HEIGHT);
  glow.addColorStop(0, '#171430'); glow.addColorStop(1, '#0d1a1c');
  c.fillStyle = glow; c.fillRect(0, 0, WIDTH, HEIGHT);
  c.fillStyle = 'rgba(211,255,100,.05)';
  for (let i = 0; i < 34; i++) c.fillRect((i * 131) % WIDTH, 150 + ((i * 197) % (FLOOR - 160)), 2, 2);
  const warn = s.danger > 0;
  c.setLineDash([8, 8]); c.lineWidth = 2;
  c.strokeStyle = warn && (reduced || Math.floor(s.time * 6) % 2 === 0) ? '#ff7a64' : 'rgba(255,157,177,.45)';
  c.beginPath(); c.moveTo(0, DANGER_Y); c.lineTo(WIDTH, DANGER_Y); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#2b3b33'; c.fillRect(0, FLOOR, WIDTH, HEIGHT - FLOOR);
  if (active && s.status === 'playing') {
    c.strokeStyle = 'rgba(234,244,218,.18)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(s.aimX, DROP_Y + radius(s.current)); c.lineTo(s.aimX, FLOOR); c.stroke();
  }
  for (const b of s.bodies) drawOrb(c, b.tier, b.x, b.y, friend);
  if (!reduced) for (const p of s.pops) {
    const t = p.age / 0.45, r = radius(p.tier) * (1 + t * 0.6);
    c.globalAlpha = 1 - t; c.strokeStyle = TIER_INFO[p.tier - 1].fill; c.lineWidth = 4;
    c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
  }
  if (s.status === 'playing') {
    const ready = s.cooldown === 0;
    c.globalAlpha = ready ? 1 : 0.55;
    drawOrb(c, s.current, s.aimX, DROP_Y, friend);
    c.globalAlpha = 1;
    if (friend) {
      const top = DROP_Y - radius(s.current);
      bitmap(c, friend, s.aimX, top - 17, 34, '#eaf4da');
    }
  }
}
