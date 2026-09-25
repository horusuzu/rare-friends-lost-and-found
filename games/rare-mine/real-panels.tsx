/** Real-mode overlays: the real pot odometer with its rate badge and WETH line, the mode notices, and the title's reward status. */
import type { ReactNode } from 'react';
import { fmtRF, fmtRate, fmtWETH, type ModeDecision, type ModeReason, type Sample } from './feed.ts';
import { Odometer, pick, REAL_NOTE, SIM_NOTE, TAP_NOTE, type Lang, type Text } from './panels.tsx';

export const MEASURING: Text = ['計測中…', 'Measuring…'];
export const CLAIM_ELSEWHERE: Text = ['本物の受け取りは公式サイト rarefriends.com/portfolio で', 'Claim real RF on the official site: rarefriends.com/portfolio'];
export const PRACTICE: Text = ['練習モード', 'Practice mode'];
const REASONS: Readonly<Record<ModeReason, Text>> = {
  inactive: ['このFriendには報酬がたまっていません。アクティベートは公式サイトで。', 'This Friend is not earning rewards. Activate it on the official site.'],
  failed: ['本物の報酬を読み取れませんでした（残高0という意味ではありません）。', 'Could not read your real rewards (that does not mean they are zero).'],
  unavailable: ['ここでは本物の報酬を読み取れません。', 'Real rewards cannot be read here.'],
};
export const reasonText = (reason: ModeReason): Text => REASONS[reason];

export const rateText = (lang: Lang, rate: bigint | null): string =>
  rate === null ? pick(lang, MEASURING) : pick(lang, [`+${fmtRate(rate)} RF/分`, `+${fmtRate(rate)} RF/min`]);

export interface RealHudProps {
  readonly lang: Lang;
  readonly pot: bigint;
  readonly streak: number;
  readonly rate: bigint | null;
  readonly claimable: bigint;
  readonly weth: bigint;
  readonly stale: boolean;
}
/** Top-left of the mine: the pot (real accrual + simulated winnings), the accrual rate and the unclaimed WETH. */
export function RealHud({ lang, pot, streak, rate, claimable, weth, stale }: RealHudProps) {
  const text = fmtRF(pot);
  return <div className="pot real">
    <small>{pick(lang, ['ポット', 'POT'])}{streak > 0 && <em> ×{2 ** streak}</em>} <span className="rf">RF</span></small>
    <Odometer text={text} value={pot.toString()} label={pick(lang, [`ポット ${text} RF`, `Pot ${text} RF`])} testId="pot" />
    <p className={`rate${rate === null ? ' wait' : ''}`} data-testid="rate">{rateText(lang, rate)}</p>
    <p className="claim" data-testid="claimable">{pick(lang, [`NFTの未受取 ${fmtRF(claimable)} RF`, `Unclaimed on your NFT ${fmtRF(claimable)} RF`])}</p>
    <p className="weth" data-testid="weth">{pick(lang, [`＋ ${fmtWETH(weth)} WETH（未受取）`, `+ ${fmtWETH(weth)} WETH (unclaimed)`])}</p>
    {stale && <p className="stale" data-testid="stale">{pick(lang, ['更新できませんでした・推定表示中', 'Update failed · estimating'])}</p>}
  </div>;
}

/** The stage note: in real mode the number is real (read-only) and taps are cosmetic; in practice mode it is a simulation. */
export function StageNote({ lang, real }: { lang: Lang; real: boolean }) {
  return <p className={`sim${real ? ' real' : ''}`} data-testid="sim-note">
    {real ? <><span>{pick(lang, REAL_NOTE)}</span><span className="tap">{pick(lang, TAP_NOTE)}</span></> : pick(lang, SIM_NOTE)}
  </p>;
}

export interface ModeBarProps {
  readonly lang: Lang;
  readonly real: boolean;
  readonly decision: ModeDecision;
  readonly failures: number;
  readonly busy: boolean;
  readonly onRetry: () => void;
  readonly onGoReal: () => void;
}
/** Under the stats: where real RF is claimed (plain text), or why this is practice mode, with a way back to the real rewards. */
export function ModeBar({ lang, real, decision, failures, busy, onRetry, onGoReal }: ModeBarProps) {
  const retry = <button className="mini" onClick={onRetry} disabled={busy} data-testid="retry-rewards">{busy ? pick(lang, ['よみとり中…', 'Reading…']) : pick(lang, ['もう一度よみとる', 'Read again'])}</button>;
  let body: ReactNode;
  if (real) body = <><span>{pick(lang, CLAIM_ELSEWHERE)}</span>{failures > 0 && retry}</>;
  else if (decision.mode === 'real') body = <><span>{pick(lang, ['本物の報酬が読めました。', 'Your real rewards are readable now.'])}</span>
    <button className="mini go" onClick={onGoReal} data-testid="go-real">{pick(lang, ['本物の報酬で採掘', 'Mine real rewards'])}</button></>;
  else body = <><span>{decision.mode === 'practice' ? `${pick(lang, PRACTICE)}: ${pick(lang, reasonText(decision.reason))}` : pick(lang, ['本物の報酬を よみとり中…', 'Reading your real rewards…'])}</span>
    {decision.mode === 'practice' && decision.reason !== 'unavailable' && retry}</>;
  return <div className={`mode-bar${real ? ' real' : ''}`} data-testid="mode-bar">{body}</div>;
}

export interface TitleRewardsProps {
  readonly lang: Lang;
  readonly decision: ModeDecision;
  readonly last: Sample | null;
  readonly rate: bigint | null;
}
/** The title's reward line: reading, the real unclaimed amount, or the practice-mode reason. */
export function TitleRewards({ lang, decision, last, rate }: TitleRewardsProps) {
  if (decision.mode === 'reading') return <p className="reward-line" data-testid="title-rewards">{pick(lang, ['本物の報酬を よみとり中…', 'Reading your real rewards…'])}</p>;
  if (decision.mode === 'practice') return <p className="reward-line notice" role="status" data-testid="title-rewards">{pick(lang, reasonText(decision.reason))}</p>;
  return <p className="reward-line real" data-testid="title-rewards">
    {pick(lang, ['NFTの未受取（本物）', 'Unclaimed on your NFT (real)'])} <b>{fmtRF(last?.rf ?? 0n)} RF</b> <span>{rateText(lang, rate)}</span>
  </p>;
}
