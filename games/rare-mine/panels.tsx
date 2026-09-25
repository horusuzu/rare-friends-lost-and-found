/** DOM overlays and panels: odometers, combo meter, Withdraw / Bet bar, odds dialog and stats (the bet show is in fx-panels.tsx). */
import { useEffect, useRef, type ReactNode } from 'react';
import { MAX_STREAK, PAYOUT, WIN_CHANCE } from './economy.ts';
import { multiplier } from './game.ts';

export type Lang = 'ja' | 'en';
export type Text = readonly [ja: string, en: string];
export const pick = (lang: Lang, text: Text): string => text[lang === 'ja' ? 0 : 1];
export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

const WIN_PCT = Math.round(WIN_CHANCE * 100);
const BURN_PCT = Math.round((1 - WIN_CHANCE * PAYOUT) * 100);
export const SIM_NOTE: Text = ['シミュレーション・本物のRFではありません', 'Simulation · not real RF'];
export const UNIT: Text = ['RF（プレビュー）', 'RF (preview)'];
export const ODDS: Text = [`勝率${WIN_PCT}%・勝てば${PAYOUT}倍・負ければ全額バーン`, `${WIN_PCT}% to win · win ×${PAYOUT} · lose = the whole stake burns`];
/** Real mode: the number is real, the bet is not. */
export const REAL_NOTE: Text = ['表示中のRFは本物の報酬（読み取りのみ）', 'The RF shown is your real reward (read-only)'];
export const BET_SIM_NOTE: Text = ['賭け・バーンはシミュレーション。本物のRFは動かず、燃えません', 'The bet and burn are simulated. Your real RF never moves or burns.'];
export const TAP_NOTE: Text = ['タップは演出です', 'Taps are just for show'];

/** A rolling counter: each digit is a strip of 0–9 moved with a transform (compositor-only motion); other characters are static. */
export function Odometer({ text, label, testId, value }: { text: string; label: string; testId: string; value: string }) {
  const chars = text.split('');
  return <div className="odometer" role="img" aria-label={label} data-testid={testId} data-value={value}>
    {chars.map((d, i) => /\d/.test(d)
      ? <span className="digit" key={chars.length - i} aria-hidden="true">
        <span className="strip" style={{ transform: `translateY(-${Number(d) * 10}%)` }}>{'0123456789'.split('').map(n => <i key={n}>{n}</i>)}</span>
      </span>
      : <span className="sep" key={chars.length - i} aria-hidden="true">{d}</span>)}
  </div>;
}
/** The practice pot: six zero-padded digits. */
export const coinText = (value: number): string => String(Math.max(0, Math.floor(value))).padStart(6, '0');

export function ComboMeter({ level, max, lang }: { level: number; max: number; lang: Lang }) {
  return <div className={`combo${level > 0 ? ' on' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={level}
    aria-label={pick(lang, ['コンボ', 'Combo'])} data-testid="combo">
    <b>{pick(lang, ['コンボ', 'COMBO'])} ×{level}</b><i><em style={{ transform: `scaleX(${level / max})` }} /></i>
  </div>;
}

export interface ActionProps {
  readonly lang: Lang;
  readonly real: boolean;
  /** The pot, formatted. */
  readonly pot: string;
  readonly canWithdraw: boolean;
  readonly canBet: boolean;
  readonly streak: number;
  readonly hint: boolean;
  readonly onWithdraw: () => void;
  readonly onBet: () => void;
}
/** Two equal buttons, always on screen. Withdraw is never hidden; Bet explains why it is unavailable. */
export function ActionBar({ lang, real, pot, canWithdraw, canBet, streak, hint, onWithdraw, onBet }: ActionProps) {
  const capped = streak >= MAX_STREAK;
  return <div className={`actions${hint ? ' hint' : ''}`} role="group" aria-label={pick(lang, ['ポットの使い道', 'What to do with the pot'])}>
    <button className="withdraw" data-testid="withdraw" disabled={!canWithdraw} onClick={onWithdraw}>
      <b>{pick(lang, ['引き出す', 'Withdraw'])}</b>
      <small>{real ? pick(lang, [`${pot} RF を記録`, `Record ${pot} RF`]) : pick(lang, [`${pot} を安全な残高へ`, `Bank ${pot} safely`])}</small>
    </button>
    <button className="bet" data-testid="bet" disabled={!canBet} onClick={onBet} aria-describedby="odds-line">
      <b>{pick(lang, ['倍かけ', 'Double or burn'])}{streak > 0 ? ` ×${multiplier(streak)}` : ''}</b>
      <small id="odds-line">{capped ? pick(lang, [`${MAX_STREAK}連勝で上限・引き出そう`, `Cap of ${MAX_STREAK} wins: withdraw`])
        : real ? pick(lang, [`勝率${WIN_PCT}%・2倍（シミュ）`, `${WIN_PCT}% to double (simulated)`]) : pick(lang, [`勝率${WIN_PCT}%・勝てば${PAYOUT}倍`, `${WIN_PCT}% to double`])}</small>
    </button>
  </div>;
}

export interface ConfirmProps {
  readonly lang: Lang;
  readonly stake: string;
  readonly win: string;
  /** Real mode: the stake keeps growing while the odds are shown. */
  readonly live?: boolean;
  readonly note?: Text;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
export function ConfirmPanel({ lang, stake, win, live = false, note, onConfirm, onCancel }: ConfirmProps) {
  // Focus the heading, not a button: a player still mashing Space or Enter to mine must never confirm a bet by accident.
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  return <div className="dialog confirm" role="dialog" aria-modal="false" aria-labelledby="confirm-title" aria-describedby="confirm-odds" data-testid="confirm">
    <h2 id="confirm-title" ref={title} tabIndex={-1}>{pick(lang, ['倍かけ？', 'Double or burn?'])}</h2>
    <p className="odds" id="confirm-odds" data-testid="odds">{pick(lang, ODDS)}</p>
    <dl>
      <div><dt>{pick(lang, ['賭け金', 'Stake'])}</dt><dd data-testid="stake">{stake}</dd></div>
      <div className="good"><dt>{pick(lang, ['勝ち', 'Win'])}</dt><dd>{win}</dd></div>
      <div className="bad"><dt>{pick(lang, ['負け', 'Lose'])}</dt><dd>🔥 {stake}</dd></div>
    </dl>
    <p className="fine">{pick(lang, [`平均すると賭け金の${BURN_PCT}%が燃えます（期待値 ${WIN_CHANCE * PAYOUT}倍）。`, `On average ${BURN_PCT}% of every stake burns (EV ${WIN_CHANCE * PAYOUT}×).`])}
      {live && pick(lang, [' 賭け金は決定の瞬間のポットです。', ' The stake is the pot when you confirm.'])}</p>
    {note && <p className="sim-bet" data-testid="bet-sim-note">{pick(lang, note)}</p>}
    <div className="row">
      <button className="go" data-testid="confirm-bet" onClick={onConfirm}>{pick(lang, ['かける', 'Bet it all'])} <kbd>Y</kbd></button>
      <button className="stop" data-testid="cancel-bet" onClick={onCancel}>{pick(lang, ['やめる', 'Not now'])} <kbd>N</kbd></button>
    </div>
  </div>;
}

export type StatRow = readonly [label: Text, value: string, id: string, tone?: string];
/** The rows the phone strip keeps on screen; the others, the mode notice and sharing live in the sheet. */
const STRIP_ROWS = new Set(['safe', 'burned', 'record']);
export interface StatsProps {
  readonly lang: Lang;
  readonly rows: readonly StatRow[];
  readonly note: Text;
  readonly canShare: boolean;
  readonly sharing: boolean;
  readonly onShare: () => void;
  /** Phone strip only (CSS shows the toggle on short portrait screens): whether the sheet is open. */
  readonly open?: boolean;
  readonly onToggle?: () => void;
  /** Something in the sheet wants attention (real rewards became readable): the toggle shows a dot. */
  readonly alert?: boolean;
  readonly children?: ReactNode;
}
export function StatsPanel({ lang, rows, note, canShare, sharing, onShare, open = false, onToggle, alert = false, children }: StatsProps) {
  const label = pick(lang, ['記録', 'Stats']);
  return <div className="stats-slot"><section className={`stats${open ? ' open' : ''}`} aria-label={label}>
    <dl>{rows.map(([label, value, id, tone]) => <div key={id} className={`${tone ?? ''}${STRIP_ROWS.has(id) ? '' : ' more'}`}><dt>{pick(lang, label)}</dt><dd data-testid={`stat-${id}`}>{value}</dd></div>)}</dl>
    <p className="unit" data-testid="stats-note">{pick(lang, note)}</p>
    {onToggle && <button className={`stats-toggle${alert ? ' alert' : ''}`} onClick={onToggle} aria-expanded={open} aria-controls="stats-sheet" data-testid="stats-toggle"
      aria-label={open ? pick(lang, ['記録を閉じる', 'Close stats']) : alert ? pick(lang, ['記録を開く（お知らせあり）', 'Open stats (new notice)']) : pick(lang, ['記録を開く', 'Open stats'])}>
      <span aria-hidden="true">{open ? '▾' : '▴'}</span><small aria-hidden="true">{label}</small></button>}
    <div className="stats-sheet" id="stats-sheet">
      {children}
      {canShare && <button className="share" onClick={onShare} disabled={sharing} data-testid="share">{pick(lang, ['記録をXでシェア', 'Share on X'])}</button>}
    </div>
  </section></div>;
}
