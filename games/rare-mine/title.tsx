/** The title overlay: the Friend, the real-reward status, and the start / continue choices for real and practice mode. */
import { useEffect, useRef } from 'react';
import { drawFriend, type FriendRows } from './art.ts';
import { fmtRF, type ModeDecision, type Sample } from './feed.ts';
import type { MineState } from './game.ts';
import type { RealLedger } from './real.ts';
import { BET_SIM_NOTE, REAL_NOTE, SIM_NOTE, UNIT, fmt, pick, type Lang } from './panels.tsx';
import { PRACTICE, TitleRewards } from './real-panels.tsx';

export function Portrait({ rows, label }: { rows: FriendRows; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current?.getContext('2d'); if (c) { c.clearRect(0, 0, 18, 18); drawFriend(c, rows, 1, 1, 1); } }, [rows]);
  return <canvas ref={ref} className="portrait" width={18} height={18} role="img" aria-label={label} />;
}

export interface TitleProps {
  readonly lang: Lang;
  readonly label: string;
  readonly rows: FriendRows | null;
  readonly ready: boolean;
  readonly error: boolean;
  readonly loadError: boolean;
  readonly paused: boolean;
  readonly decision: ModeDecision;
  readonly last: Sample | null;
  readonly rate: bigint | null;
  readonly busy: boolean;
  readonly practice: MineState | null;
  readonly real: RealLedger | null;
  readonly onRetryFriend: () => void;
  readonly onRetrySave: () => void;
  readonly onRetryRewards: () => void;
  readonly onStartReal: () => void;
  readonly onStartPractice: () => void;
}

function Choices(p: TitleProps) {
  const { lang, decision, paused } = p;
  if (decision.mode === 'real') return <div className="choices">
    <button data-testid="start-real" onClick={p.onStartReal} disabled={paused}>
      {p.real ? pick(lang, [`つづきから（記録 ${fmtRF(p.real.withdrawn)} RF）`, `Continue (recorded ${fmtRF(p.real.withdrawn)} RF)`])
        : pick(lang, ['本物の報酬で採掘する', 'Mine my real rewards'])}
    </button>
  </div>;
  if (decision.mode !== 'practice') return null;
  return <div className="choices">
    {p.practice
      ? <button data-testid="continue" onClick={p.onStartPractice} disabled={paused}>{pick(lang, [`練習モードのつづき（安全 ${fmt(p.practice.safe)}）`, `Continue practice (safe ${fmt(p.practice.safe)})`])}</button>
      : <button data-testid="start" onClick={p.onStartPractice} disabled={paused}>{pick(lang, ['練習モードで採掘', 'Mine in practice mode'])}</button>}
    {decision.reason !== 'unavailable' && <button className="quiet" data-testid="retry-title" onClick={p.onRetryRewards} disabled={p.busy}>
      {p.busy ? pick(lang, ['よみとり中…', 'Reading…']) : pick(lang, ['本物の報酬をもう一度よむ', 'Read real rewards again'])}</button>}
  </div>;
}

export function Title(p: TitleProps) {
  const { lang, label, rows, ready, error, loadError, decision } = p;
  const real = decision.mode === 'real';
  return <div className="title" data-testid="title">
    <h2>RARE<span>MINE</span></h2>
    {rows && !error && <p className="starring"><Portrait rows={rows} label={label} />{pick(lang, [`採掘係: ${label}`, `Miner: ${label}`])}</p>}
    <p>{real ? pick(lang, ['NFTにたまる本物のRFを、採掘として見る。', 'Watch the real RF your NFT earns, mined.'])
      : pick(lang, ['ほって、ためて、引き出すか 倍かけるか。', 'Dig, stack, then bank it or double it.'])}</p>
    {ready && !error && <TitleRewards lang={lang} decision={decision} last={p.last} rate={p.rate} />}
    {loadError && ready && !error && <p role="alert" className="fine">{pick(lang, ['セーブを よめませんでした。', 'Could not read your save.'])}
      <button className="retry" onClick={p.onRetrySave}>{pick(lang, ['もう一度よむ', 'Try again'])}</button></p>}
    {error ? <><p role="alert">{pick(lang, ['Friendを よみこめませんでした。', 'Could not load your Friend.'])}</p><button onClick={p.onRetryFriend}>{pick(lang, ['もう一度', 'Retry'])}</button></>
      : !ready ? <p>{pick(lang, ['Friendを よみこみ中…', 'Loading Friend…'])}</p> : <Choices {...p} />}
    <p className="fine">{real ? `${pick(lang, REAL_NOTE)} · ${pick(lang, BET_SIM_NOTE)}`
      : decision.mode === 'practice' ? `${pick(lang, PRACTICE)} · ${pick(lang, UNIT)} · ${pick(lang, SIM_NOTE)}` : pick(lang, REAL_NOTE)}</p>
  </div>;
}
