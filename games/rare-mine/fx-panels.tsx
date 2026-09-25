/**
 * DOM layers of the bet show: the tappable reach overlay (リーチ / 激アツ / 超激アツ call, flashing border), the 大当たり
 * banner with a shine sweep, count-up, strobing edge lights and streak badge, and the burn card. Flashing stays at
 * 2 Hz or slower; with reduced motion every animation is off and the cards are static.
 */
import { useEffect, useRef } from 'react';
import { WIN_CHANCE } from './economy.ts';
import { multiplier } from './game.ts';
import { pick, type Lang, type Text } from './panels.tsx';
import type { ReachTier, WinTier } from './reach.ts';
import './fx.css';

const WIN_PCT = Math.round(WIN_CHANCE * 100);
const CALLS: readonly Text[] = [['リーチ！', 'REACH!'], ['激アツ！', 'HOT!!'], ['超激アツ！！', 'SUPER HOT!!']];
const TITLES: readonly Text[] = [['大当たり！', 'JACKPOT!'], ['連チャン！', 'BACK TO BACK!'], ['確変突入！', 'RUSH MODE!'], ['FEVER!!', 'FEVER!!']];
/** The count-up rolls from the stake to the doubled pot over this many seconds after the banner lands. */
const COUNT_FROM = 0.3, COUNT_TIME = 1.5;

/** Which call a reach stage shows: the tease keeps the tier it reached. */
export function callLevel(stage: string, tier: ReachTier): 0 | 1 | 2 | null {
  if (stage === 'spin') return null;
  if (stage === 'super') return 2;
  if (stage === 'hot') return 1;
  if (stage === 'tease') return tier;
  return 0;
}

export interface ReachProps { readonly lang: Lang; readonly stage: string; readonly tier: ReachTier; readonly stake: string; readonly onSkip: () => void }
export function ReachOverlay({ lang, stage, tier, stake, onSkip }: ReachProps) {
  const level = callLevel(stage, tier), tone = ['reach', 'hot', 'super'][level ?? 0];
  return <button className={`reach-fx ${tone}${stage === 'tease' ? ' tease' : ''}${level === null ? ' spin' : ''}`} data-testid="roll" onClick={onSkip}
    aria-label={pick(lang, ['結果を見る', 'Reveal the result'])}>
    <span className="reach-edge" aria-hidden="true" />
    {level !== null && <b className="reach-call" key={tone} aria-hidden="true">{pick(lang, CALLS[level])}</b>}
    <small className="reach-line">{pick(lang, [`勝率${WIN_PCT}% · 賭け金 ${stake} · タップで結果へ`, `${WIN_PCT}% to win · stake ${stake} · tap to reveal`])}</small>
  </button>;
}

export interface WinProps {
  readonly lang: Lang;
  readonly tier: WinTier;
  readonly streak: number;
  readonly pot: string;
  /** The pot text at progress 0–1 of the count-up (stake → doubled pot). */
  readonly count: (k: number) => string;
  readonly simulated: boolean;
  readonly reduced: boolean;
  /** Seconds into the celebration (freezes while paused). */
  readonly clock: () => number;
}
export function WinOverlay({ lang, tier, streak, pot, count, simulated, reduced, clock }: WinProps) {
  const out = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const el = out.current;
    if (!el) return;
    if (reduced) { el.textContent = count(1); return; }
    let frame = 0, last = '';
    const roll = () => {
      const k = Math.min(1, Math.max(0, (clock() - COUNT_FROM) / COUNT_TIME)), text = count(1 - (1 - k) ** 3);
      if (text !== last) { el.textContent = text; last = text; }
      if (k < 1) frame = requestAnimationFrame(roll);
    };
    roll();
    return () => cancelAnimationFrame(frame);
  }, [reduced]);
  return <div className={`win-fx tier-${tier}`} data-testid="result" aria-hidden="true">
    <span className="edge-lights"><i /><i /></span>
    <div className="win-card">
      <span className="shine" />
      <b className="win-title">{pick(lang, TITLES[tier])}</b>
      <strong className="win-mult">JACKPOT ×{multiplier(streak)}</strong>
      {/* Filled imperatively each frame, so React never re-renders the rolling number. */}
      <output className="win-count" ref={out} />
      <small>{pick(lang, [`${streak}連勝 · ポット ${pot}`, `${streak} in a row · pot ${pot}`])}</small>
      {simulated && <small>{pick(lang, ['（シミュレーション）', '(simulated)'])}</small>}
    </div>
    <span className="streak-badge" data-testid="streak-badge">{pick(lang, [`${streak}連チャン`, `STREAK ${streak}`])}</span>
  </div>;
}

export interface LoseProps { readonly lang: Lang; readonly stake: string; readonly simulated: boolean }
export function LoseOverlay({ lang, stake, simulated }: LoseProps) {
  return <div className="lose-fx" data-testid="result" aria-hidden="true">
    <div className="lose-card">
      <b>{pick(lang, [`🔥 ${stake} バーン`, `🔥 ${stake} burned`])}</b>
      <small>{pick(lang, ['ポットは全額バーンされました', 'The whole pot burned'])}</small>
      {simulated && <small>{pick(lang, ['（シミュレーション）', '(simulated)'])}</small>}
    </div>
  </div>;
}
