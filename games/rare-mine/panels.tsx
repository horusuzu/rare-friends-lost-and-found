/** DOM overlays and panels: odometer, combo meter, Withdraw / Bet bar, odds dialog, suspense, result banner and stats. */
import { useEffect, useRef } from 'react';
import { MAX_STREAK, PAYOUT, WIN_CHANCE } from './economy.ts';
import { canBet, multiplier, type MineState, type Outcome } from './game.ts';

export type Lang = 'ja' | 'en';
export type Text = readonly [ja: string, en: string];
export const pick = (lang: Lang, text: Text): string => text[lang === 'ja' ? 0 : 1];
export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

const WIN_PCT = Math.round(WIN_CHANCE * 100);
const BURN_PCT = Math.round((1 - WIN_CHANCE * PAYOUT) * 100);
export const SIM_NOTE: Text = ['シミュレーション・本物のRFではありません', 'Simulation · not real RF'];
export const UNIT: Text = ['RF（プレビュー）', 'RF (preview)'];
export const ODDS: Text = [`勝率${WIN_PCT}%・勝てば${PAYOUT}倍・負ければ全額バーン`, `${WIN_PCT}% to win · win ×${PAYOUT} · lose = the whole stake burns`];

/** A rolling-digit counter: each digit is a strip of 0–9 moved with a transform (compositor-only motion). */
export function Odometer({ value, label, testId }: { value: number; label: string; testId: string }) {
  const digits = String(Math.max(0, Math.floor(value))).padStart(6, '0').split('');
  return <div className="odometer" role="img" aria-label={label} data-testid={testId} data-value={Math.floor(value)}>
    {digits.map((d, i) => <span className="digit" key={digits.length - i} aria-hidden="true">
      <span className="strip" style={{ transform: `translateY(-${Number(d) * 10}%)` }}>{'0123456789'.split('').map(n => <i key={n}>{n}</i>)}</span>
    </span>)}
  </div>;
}

export function ComboMeter({ level, max, lang }: { level: number; max: number; lang: Lang }) {
  return <div className={`combo${level > 0 ? ' on' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={level}
    aria-label={pick(lang, ['コンボ', 'Combo'])} data-testid="combo">
    <b>{pick(lang, ['コンボ', 'COMBO'])} ×{level}</b><i><em style={{ transform: `scaleX(${level / max})` }} /></i>
  </div>;
}

export interface ActionProps {
  readonly s: MineState;
  readonly lang: Lang;
  readonly active: boolean;
  readonly hint: boolean;
  readonly onWithdraw: () => void;
  readonly onBet: () => void;
}
/** Two equal buttons, always on screen. Withdraw is never hidden; Bet explains why it is unavailable. */
export function ActionBar({ s, lang, active, hint, onWithdraw, onBet }: ActionProps) {
  const betReady = canBet(s) || s.phase === 'confirm';
  const capped = s.streak >= MAX_STREAK;
  return <div className={`actions${hint ? ' hint' : ''}`} role="group" aria-label={pick(lang, ['ポットの使い道', 'What to do with the pot'])}>
    <button className="withdraw" data-testid="withdraw" disabled={!active || s.pot <= 0 || s.phase === 'roll'} onClick={onWithdraw}>
      <b>{pick(lang, ['引き出す', 'Withdraw'])}</b><small>{pick(lang, [`${fmt(s.pot)} を安全な残高へ`, `Bank ${fmt(s.pot)} safely`])}</small>
    </button>
    <button className="bet" data-testid="bet" disabled={!active || !betReady} onClick={onBet} aria-describedby="odds-line">
      <b>{pick(lang, ['倍かけ', 'Double or burn'])}{s.streak > 0 ? ` ×${multiplier(s.streak)}` : ''}</b>
      <small id="odds-line">{capped ? pick(lang, [`${MAX_STREAK}連勝で上限・引き出そう`, `Cap of ${MAX_STREAK} wins: withdraw`]) : pick(lang, [`勝率${WIN_PCT}%・勝てば${PAYOUT}倍`, `${WIN_PCT}% to double`])}</small>
    </button>
  </div>;
}

export function ConfirmPanel({ s, lang, onConfirm, onCancel }: { s: MineState; lang: Lang; onConfirm: () => void; onCancel: () => void }) {
  // Focus the heading, not a button: a player still mashing Space or Enter to mine must never confirm a bet by accident.
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  return <div className="dialog confirm" role="dialog" aria-modal="false" aria-labelledby="confirm-title" aria-describedby="confirm-odds" data-testid="confirm">
    <h2 id="confirm-title" ref={title} tabIndex={-1}>{pick(lang, ['倍かけ？', 'Double or burn?'])}</h2>
    <p className="odds" id="confirm-odds" data-testid="odds">{pick(lang, ODDS)}</p>
    <dl>
      <div><dt>{pick(lang, ['賭け金', 'Stake'])}</dt><dd>{fmt(s.pot)}</dd></div>
      <div className="good"><dt>{pick(lang, ['勝ち', 'Win'])}</dt><dd>{fmt(s.pot * PAYOUT)}</dd></div>
      <div className="bad"><dt>{pick(lang, ['負け', 'Lose'])}</dt><dd>🔥 {fmt(s.pot)}</dd></div>
    </dl>
    <p className="fine">{pick(lang, [`平均すると賭け金の${BURN_PCT}%が燃えます（期待値 ${WIN_CHANCE * PAYOUT}倍）。`, `On average ${BURN_PCT}% of every stake burns (EV ${WIN_CHANCE * PAYOUT}×).`])}</p>
    <div className="row">
      <button className="go" data-testid="confirm-bet" onClick={onConfirm}>{pick(lang, ['かける', 'Bet it all'])} <kbd>Y</kbd></button>
      <button className="stop" data-testid="cancel-bet" onClick={onCancel}>{pick(lang, ['やめる', 'Not now'])} <kbd>N</kbd></button>
    </div>
  </div>;
}

export function RollPanel({ s, lang, reduced, onSkip }: { s: MineState; lang: Lang; reduced: boolean; onSkip: () => void }) {
  return <button className="dialog roll" data-testid="roll" onClick={onSkip} aria-label={pick(lang, ['結果を見る', 'Reveal the result'])}>
    <span className={`flip${reduced ? ' still' : ''}`} aria-hidden="true"><i>RF</i><i>🔥</i></span>
    <b>{pick(lang, [`勝率${WIN_PCT}%…`, `${WIN_PCT}% to win…`])}</b>
    <small>{pick(lang, [`賭け金 ${fmt(s.roll?.stake ?? 0)} · タップで結果へ`, `Stake ${fmt(s.roll?.stake ?? 0)} · tap to reveal`])}</small>
  </button>;
}

export function ResultBanner({ last, lang }: { last: Outcome; lang: Lang }) {
  return <div className={`banner ${last.win ? 'win' : 'lose'}`} aria-hidden="true" data-testid="result">
    {last.win
      ? <><b>{pick(lang, [`×${PAYOUT} 勝ち！`, `×${PAYOUT} WIN!`])}</b><small>{pick(lang, [`ポット ${fmt(last.pot)} · ${last.streak}連勝（×${multiplier(last.streak)}）`, `Pot ${fmt(last.pot)} · ${last.streak} in a row (×${multiplier(last.streak)})`])}</small></>
      : <><b>🔥 {fmt(last.stake)} burned</b><small>{pick(lang, ['ポットは全額バーンされました', 'The whole pot burned'])}</small></>}
  </div>;
}

export interface StatsProps { readonly s: MineState; readonly lang: Lang; readonly canShare: boolean; readonly sharing: boolean; readonly onShare: () => void }
export function StatsPanel({ s, lang, canShare, sharing, onShare }: StatsProps) {
  const t = s.stats;
  const rows: readonly [Text, string, string, string?][] = [
    [['安全な残高', 'Safe balance'], fmt(s.safe), 'safe', 'safe'],
    [['採掘合計', 'Total mined'], fmt(t.mined), 'mined'],
    [['引き出し合計', 'Withdrawn'], fmt(t.withdrawn), 'withdrawn'],
    [['バーン合計', 'Burned'], `🔥 ${fmt(t.burned)}`, 'burned', 'burn'],
    [['最高連勝', 'Best streak'], t.bestStreak > 0 ? `×${multiplier(t.bestStreak)}（${t.bestStreak}）` : '—', 'best'],
    [['勝ち・負け', 'Won · lost'], `${t.betsWon} · ${t.betsLost}`, 'record'],
  ];
  return <section className="stats" aria-label={pick(lang, ['記録', 'Stats'])}>
    <dl>{rows.map(([label, value, id, tone]) => <div key={id} className={tone ?? ''}><dt>{pick(lang, label)}</dt><dd data-testid={`stat-${id}`}>{value}</dd></div>)}</dl>
    <p className="unit">{pick(lang, UNIT)} · {pick(lang, SIM_NOTE)}</p>
    {canShare && <button className="share" onClick={onShare} disabled={sharing} data-testid="share">{pick(lang, ['記録をXでシェア', 'Share on X'])}</button>}
  </section>;
}
