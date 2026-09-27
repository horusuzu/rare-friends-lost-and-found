/**
 * Desktop pet window contents (trusted host, plain DOM + canvas). Mounted into a Document Picture-in-Picture window,
 * which starts blank, so its styles are inlined here. Read-only: it shows what the host's reward reader returns and
 * never links, navigates, signs or sends anything. Timers and frames run on the pet window itself, so the pet keeps
 * animating while the game tab is in the background.
 */
import type { GenerationSprites } from './generation-sprites.js';
import { coinsCrossed, coinUnit, ease, fmtRate, fmtRF, project, EMPTY_READER, type Reader } from './reward-feed.js';
import { petStatus, type PetStatus } from './desktop-pet-control.js';
import { coinLanded, drawScene, paintBackdrop, PILE_MAX, SCENE, STRIKE_AT, SWING_S, type Coin, type Spark } from './pet-scene.js';

/** Coins pop about 1-4 a second at the real accrual. */
export const PET_MAX_COINS_PER_S = 4n;
const MAX_QUEUED = 8, COINS_PER_STRIKE = 2, TEXT_EVERY_MS = 125, HINT_MS = 4_000, CLINK_EVERY_MS = 120;
const STATUS_TEXT: Readonly<Record<PetStatus, string>> = {
  reading: '読み取り中…', measuring: '計測中…', accruing: '', none: '報酬なし', failed: '読み取り失敗・再試行中',
};
const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#140f0c;color:#f3e6cc;font:12px/1.35 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;overflow:hidden;user-select:none;-webkit-user-select:none}
.pet{height:100%;display:flex;flex-direction:column;gap:3px;padding:6px 8px;background:radial-gradient(120% 70% at 50% 38%,#2a1f1a 0%,#140f0c 70%)}
.pet-head{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:24px}
.pet-name{font-weight:700;color:#f5c542;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pet-sound{min-width:30px;height:24px;border:1px solid #5a453a;border-radius:6px;background:#231a16;color:#9b8a78;font:inherit;cursor:pointer;padding:0 6px}
.pet-sound[aria-pressed=true]{color:#140f0c;background:#f5c542;border-color:#f5c542}
.pet-sound:focus-visible{outline:2px solid #f5c542;outline-offset:1px}
.pet-scene{display:block;width:${SCENE.width * 2}px;height:${SCENE.height * 2}px;margin:0 auto;border:1px solid #3a2c26;border-radius:6px;image-rendering:pixelated;cursor:pointer;box-shadow:0 2px 8px #0008}
.pet-odo{display:flex;align-items:baseline;justify-content:center;gap:2px;min-height:24px}
.pet-odo-num{display:flex;gap:1px}
.pet-digit{display:inline-block;min-width:11px;padding:1px 1px;text-align:center;font:700 15px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;color:#fff1a8;background:linear-gradient(#1a1310,#2a1f1a 50%,#1a1310);border:1px solid #3a2c26;border-radius:2px}
.pet-sep{font:700 15px/1.2 ui-monospace,monospace;color:#b07a1c;min-width:4px;text-align:center}
.pet-unit{margin-left:4px;font-weight:700;color:#f5c542}
.pet-row{display:flex;align-items:center;justify-content:center;gap:6px;min-height:18px}
.pet-rate{padding:0 6px;border-radius:9px;background:#3a2c26;color:#f5c542;font-weight:700;font-size:11px}
.pet-rate[hidden]{display:none}
.pet-status{color:#e2c9a8;font-size:11px}
.pet-note{text-align:center;color:#9b8a78;font-size:10px;white-space:nowrap}
.pet-hint{text-align:center;color:#f3e6cc;font-size:10px;min-height:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

export type PetViewOptions = Readonly<{
  /** e.g. "Friend #7730"; also the canvas's accessible name. */
  label: string;
  gameTitle: string;
  loadSprites: () => Promise<GenerationSprites>;
  /** Best-effort attempt to bring the game tab forward; the hint is shown regardless. */
  onActivate?: () => void;
}>;
export type PetView = { update(reader: Reader): void; destroy(): void };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountPetView(win: Window, { label, gameTitle, loadSprites, onActivate }: PetViewOptions): PetView {
  const doc = win.document;
  doc.documentElement.lang = 'ja';
  doc.title = `${label} · ${gameTitle}`;
  const style = el(doc, 'style', {}, STYLE);
  doc.head.append(style);
  const root = el(doc, 'div', { class: 'pet', 'data-testid': 'pet', 'data-status': 'reading', 'data-sprite': 'loading', 'data-coins': '0', 'data-reads': '0', 'data-value': '' });
  const head = el(doc, 'div', { class: 'pet-head' });
  const sound = el(doc, 'button', { type: 'button', class: 'pet-sound', 'aria-pressed': 'false', 'aria-label': 'コインの音', title: 'コインの音（オフ）' }, '♪');
  head.append(el(doc, 'span', { class: 'pet-name' }, label), sound);
  const scale = 2 * Math.max(1, Math.round(win.devicePixelRatio || 1));
  const canvas = el(doc, 'canvas', { class: 'pet-scene', role: 'img', 'aria-label': label, width: String(SCENE.width * scale), height: String(SCENE.height * scale) });
  const odo = el(doc, 'div', { class: 'pet-odo', 'data-testid': 'pet-odometer' });
  const digits = el(doc, 'span', { class: 'pet-odo-num' });
  odo.append(digits, el(doc, 'span', { class: 'pet-unit' }, 'RF'));
  const rate = el(doc, 'span', { class: 'pet-rate', 'data-testid': 'pet-rate', hidden: '' });
  const status = el(doc, 'span', { class: 'pet-status', 'data-testid': 'pet-status', role: 'status' });
  const row = el(doc, 'div', { class: 'pet-row' });
  row.append(rate, status);
  const hint = el(doc, 'div', { class: 'pet-hint', 'data-testid': 'pet-hint', 'aria-live': 'polite' });
  root.append(head, canvas, odo, row, el(doc, 'div', { class: 'pet-note' }, '読み取りのみ・本物のRF'), hint);
  doc.body.append(root);

  const ctx = canvas.getContext('2d');
  const backdrop = doc.createElement('canvas');
  backdrop.width = SCENE.width; backdrop.height = SCENE.height;
  const backdropCtx = backdrop.getContext('2d');
  if (backdropCtx) paintBackdrop(backdropCtx);

  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let reader: Reader = EMPTY_READER, lastEvent = 0, shown: bigint | null = null, textAt = 0, lastText = '';
  let sprites: GenerationSprites | null = null, alive = true, frame = 0, hintTimer = 0;
  let swingAt: number | null = null, struck = false, queued = 0, coins: Coin[] = [], sparks: Spark[] = [], pile = 0, popped = 0, lastTick = 0;
  let audio: AudioContext | null = null, soundOn = false, clinkAt = 0;
  const start = win.performance.now();

  loadSprites().then(value => { if (alive) { sprites = value; root.dataset.sprite = 'ready'; } }, () => { if (alive) root.dataset.sprite = 'error'; });

  function clink() {
    if (!soundOn || !audio || audio.state !== 'running') return;
    const now = win.performance.now();
    if (now - clinkAt < CLINK_EVERY_MS) return;
    clinkAt = now;
    const t = audio.currentTime, gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.035, t + 0.004); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    gain.connect(audio.destination);
    for (const f of [2637, 3951]) { const o = audio.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(gain); o.start(t); o.stop(t + 0.13); }
  }
  function onSound() {
    soundOn = !soundOn;
    sound.setAttribute('aria-pressed', String(soundOn)); sound.title = soundOn ? 'コインの音（オン）' : 'コインの音（オフ）';
    // Audio starts only from this click inside the pet.
    try {
      const Ctx = (win as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
      if (soundOn && !audio && Ctx) audio = new Ctx();
      if (audio) void (soundOn ? audio.resume() : audio.suspend()).catch(() => undefined);
    } catch { /* audio unavailable: the pet stays silent */ }
  }
  function onScene() {
    hint.textContent = `${gameTitle} に戻る → 元のタブへ`;
    win.clearTimeout(hintTimer);
    hintTimer = win.setTimeout(() => { hint.textContent = ''; }, HINT_MS);
    try { onActivate?.(); } catch { /* focus cannot always be forced */ }
  }
  sound.addEventListener('click', onSound);
  canvas.addEventListener('click', onScene);

  function renderText(value: bigint | null, state: PetStatus) {
    const text = value === null ? '-.----' : fmtRF(value);
    if (text !== lastText) {
      lastText = text;
      digits.replaceChildren(...[...text].map(ch => el(doc, 'span', { class: /\d/.test(ch) ? 'pet-digit' : 'pet-sep' }, ch)));
    }
    root.dataset.value = value === null ? '' : value.toString();
    const rateText = state === 'accruing' && reader.feed.rate !== null ? `+${fmtRate(reader.feed.rate)} RF/分` : '';
    if (rate.textContent !== rateText) rate.textContent = rateText;
    rate.hidden = rateText === '';
    if (status.textContent !== STATUS_TEXT[state]) status.textContent = STATUS_TEXT[state];
    root.dataset.status = state;
    root.dataset.reads = String(reader.reads);
    root.dataset.coins = String(popped);
  }

  function tick(now: number) {
    if (!alive) return;
    frame = win.requestAnimationFrame(tick);
    const dt = lastTick ? Math.min(0.25, (now - lastTick) / 1000) : 0;
    lastTick = now;
    const t = (now - start) / 1000, reduced = motion.matches, state = petStatus(reader);
    root.dataset.motion = reduced ? 'reduced' : 'full';
    const target = project(reader.feed, Date.now());
    const reset = reader.event !== null && reader.event.id !== lastEvent && reader.event.kind === 'drop';
    if (reader.event) lastEvent = reader.event.id;
    const previous = shown;
    if (target !== null) shown = ease(shown, target, dt, reset);
    if (!reduced && state === 'accruing' && previous !== null && shown !== null && !reset) {
      queued = Math.min(MAX_QUEUED, queued + coinsCrossed(previous, shown, coinUnit(reader.feed.rate, PET_MAX_COINS_PER_S)));
    }
    if (reduced) { queued = 0; coins = []; sparks = []; swingAt = null; }
    // Swing when coins are due; the strike releases them.
    if (swingAt === null && queued > 0) { swingAt = t; struck = false; }
    if (swingAt !== null && !struck && t - swingAt >= SWING_S * STRIKE_AT) {
      struck = true;
      const n = Math.min(queued, COINS_PER_STRIKE);
      queued -= n;
      for (let i = 0; i < n; i++) coins.push({ born: t + i * 0.08, x: 78 - i, slot: Math.min(PILE_MAX - 1, pile + coins.length) });
      popped += n;
      sparks = [...sparks.filter(s => t - s.born < 0.3), ...[[-1, -1], [-0.6, -1.4], [-1.3, -0.4], [-0.2, -1]].map(([dx, dy]) => ({ born: t, dx, dy }))];
    }
    if (swingAt !== null && t - swingAt >= SWING_S) swingAt = null;
    const landed = coins.filter(c => coinLanded(c, t)).length;
    if (landed) { coins = coins.filter(c => !coinLanded(c, t)); pile = Math.min(PILE_MAX, pile + landed); clink(); }
    if (ctx && backdropCtx) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawScene(ctx, backdrop, { t, swingAt, coins, sparks, pile, reduced, sprites });
    }
    if (now - textAt >= TEXT_EVERY_MS) { textAt = now; renderText(shown, state); }
  }
  frame = win.requestAnimationFrame(tick);
  renderText(null, 'reading');

  return {
    update(next) { reader = next; },
    destroy() {
      alive = false;
      win.cancelAnimationFrame(frame); win.clearTimeout(hintTimer);
      sound.removeEventListener('click', onSound); canvas.removeEventListener('click', onScene);
      void audio?.close().catch(() => undefined); audio = null;
      root.remove(); style.remove();
    },
  };
}
