/** Presentation helpers shared by both modes: stats rows, result banners and the live-region text. */
import { fmtRF, fmtRate } from './feed.ts';
import { multiplier, type MineState } from './game.ts';
import type { RealLedger } from './real.ts';
import { BET_SIM_NOTE, SIM_NOTE, UNIT, fmt, pick, type Lang, type StatRow, type Text } from './panels.tsx';
import { MEASURING } from './real-panels.tsx';

export interface BannerInfo {
  readonly id: number;
  readonly win: boolean;
  readonly stake: string;
  readonly pot: string;
  readonly streak: number;
  readonly simulated: boolean;
}
export interface Toast { readonly id: number; readonly text: Text }

const best = (streak: number): string => streak > 0 ? `×${multiplier(streak)}（${streak}）` : '—';

export const PRACTICE_NOTE: Text = [`${UNIT[0]} · ${SIM_NOTE[0]}`, `${UNIT[1]} · ${SIM_NOTE[1]}`];
export const REAL_STATS_NOTE: Text = BET_SIM_NOTE;

export function practiceRows(s: MineState): readonly StatRow[] {
  const t = s.stats;
  return [
    [['安全な残高', 'Safe balance'], fmt(s.safe), 'safe', 'safe'],
    [['採掘合計', 'Total mined'], fmt(t.mined), 'mined'],
    [['引き出し合計', 'Withdrawn'], fmt(t.withdrawn), 'withdrawn'],
    [['バーン合計', 'Burned'], `🔥 ${fmt(t.burned)}`, 'burned', 'burn'],
    [['最高連勝', 'Best streak'], best(t.bestStreak), 'best'],
    [['勝ち・負け', 'Won · lost'], `${t.betsWon} · ${t.betsLost}`, 'record'],
  ];
}

export function realRows(l: RealLedger, claimable: bigint, rate: bigint | null, lang: Lang): readonly StatRow[] {
  return [
    [['NFTの未受取（本物）', 'Unclaimed (real)'], fmtRF(claimable), 'safe', 'safe'],
    [['加算ペース（本物）', 'Accrual (real)'], rate === null ? pick(lang, MEASURING) : pick(lang, [`${fmtRate(rate)} RF/分`, `${fmtRate(rate)} RF/min`]), 'mined'],
    [['記録した引き出し', 'Recorded withdrawals'], fmtRF(l.withdrawn), 'withdrawn'],
    [['バーン合計（シミュ）', 'Burned (simulated)'], `🔥 ${fmtRF(l.burned)}`, 'burned', 'burn'],
    [['最高連勝', 'Best streak'], best(l.bestStreak), 'best'],
    [['勝ち・負け', 'Won · lost'], `${l.betsWon} · ${l.betsLost}`, 'record'],
  ];
}

/** Text for the persistent live region: the latest bet result, else the latest notice. */
export function announcement(lang: Lang, banner: BannerInfo | null, toast: Toast | null): string {
  if (banner) return banner.win
    ? pick(lang, [`勝ち。ポット ${banner.pot}、${banner.streak}連勝。`, `Win. Pot ${banner.pot}, ${banner.streak} in a row.`])
    : pick(lang, [`負け。${banner.stake} がバーンされました。`, `Lost. ${banner.stake} burned.`]) + (banner.simulated ? pick(lang, ['（シミュレーション）', ' (simulated)']) : '');
  return toast ? pick(lang, toast.text) : '';
}
