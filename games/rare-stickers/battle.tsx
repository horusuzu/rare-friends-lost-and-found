import { useEffect, useMemo, useRef, useState } from 'react';
import { DECK_SIZE, ELEMENTS, battle, battleSeed, cardStats, decodeBattle, encodeBattle, type BattleResult } from './cards.ts';
import { addChallenge, hasFought, markFought, recordBattle, recordBurn, stickerName, takeChallenge, type Album, type Owner, type Sticker } from './album.ts';
import { CardCanvas } from './card-canvas.tsx';
import type { Sprite } from './art.ts';
import { hitCue, roundCue, verdictCue, type CueId } from './sound.ts';

type Lang = 'ja' | 'en';
export interface BattleTabProps {
  album: Album; commit: (next: Album) => void; current: () => Album; me: Owner; lang: Lang; paused: boolean; busy: boolean; reduced: boolean;
  rowsFor: (s: Sticker) => Sprite | null; loadArt: (s: Sticker) => void;
  /** Spends one RF ticket through the SDK (buy if needed → play → settle). Resolves false if cancelled or failed. */
  burnTicket: () => Promise<boolean>; ticketLabel: string; burnedLabel: string;
  copy: (code: string) => void; copyMsg: string;
  /** Plays a sound effect (silent when sound is off, paused or hidden). */
  play: (id: CueId) => void;
}
interface Replay { result: BattleResult; side: 'a' | 'b'; reply?: string }
const label = (o: Owner) => `${o.collection === 'genesis' ? 'Genesis' : 'Friend'} #${o.tokenId}`;
const MAX_OPEN = 10;
const randomNonce = () => (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;

export function BattleTab(p: BattleTabProps) {
  const { album, lang, me } = p;
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const [deck, setDeck] = useState<number[]>([]), [code, setCode] = useState(''), [msg, setMsg] = useState('');
  const [challengeCode, setChallengeCode] = useState<string | null>(null), [replay, setReplay] = useState<Replay | null>(null);
  const cards = album.items.map(it => it.sticker);
  const chosen = deck.map(i => cards[i]).filter(Boolean);
  const full = album.challenges.length >= MAX_OPEN;
  const ready = chosen.length === DECK_SIZE && !p.paused && !p.busy && !full;
  const toggle = (i: number) => { p.play('tap'); setDeck(d => d.includes(i) ? d.filter(x => x !== i) : d.length < DECK_SIZE ? [...d, i] : d); };
  const fail = (text: string) => { setMsg(text); p.play('error'); };
  const outcome = (winner: BattleResult['winner'], side: 'a' | 'b') => winner === 'draw' ? 'draw' : winner === side ? 'win' : 'loss';

  async function challenge() {
    if (!ready) return;
    setMsg(''); setChallengeCode(null);
    if (!(await p.burnTicket())) return;
    p.play('burn');
    const nonce = randomNonce();
    // Re-read the book after the wallet confirmations: other changes may have landed meanwhile.
    p.commit(addChallenge(recordBurn(p.current()), nonce, chosen));
    setChallengeCode(encodeBattle({ owner: me, nonce, deck: chosen }));
  }

  /** A pasted code is a reply if it answers one of my open challenges, otherwise a new challenge to accept. */
  async function useCode() {
    setMsg(''); setReplay(null);
    let parsed;
    try { parsed = decodeBattle(code); } catch (e) {
      fail(/typo/.test((e as Error).message) ? t('コードに打ち間違いがあります。', 'This code has a typo.') : t('バトルコードではありません。', 'This is not a battle code.')); return;
    }
    parsed.deck.forEach(p.loadArt);
    const mine = parsed.owner.collection === me.collection && parsed.owner.tokenId === me.tokenId;
    const [open, rest] = takeChallenge(album, parsed.nonce);
    if (open && !mine) {
      const key = `reply:${parsed.owner.collection}:${parsed.owner.tokenId}:${parsed.nonce}`;
      if (hasFought(album, key)) { fail(t('この返信はもう結果に反映されています。', 'This reply has already been counted.')); return; }
      const result = battle(open.deck, parsed.deck, battleSeed(open.deck, parsed.deck, parsed.nonce));
      p.commit(markFought(recordBattle(rest, outcome(result.winner, 'a')), key));
      setReplay({ result, side: 'a' }); setCode(''); return;
    }
    if (mine) { fail(t('自分の挑戦には自分では答えられません。友だちに送ってね。', 'You cannot answer your own challenge. Send it to a friend.')); return; }
    const key = `${parsed.owner.collection}:${parsed.owner.tokenId}:${parsed.nonce}`;
    if (hasFought(album, key)) { fail(t('この挑戦にはもう答えています。', 'You have already answered this challenge.')); return; }
    if (chosen.length !== DECK_SIZE) { fail(t(`先に下でデッキを${DECK_SIZE}枚えらんでね。`, `Pick a ${DECK_SIZE}-card deck below first.`)); return; }
    if (!(await p.burnTicket())) return;
    p.play('burn');
    const result = battle(parsed.deck, chosen, battleSeed(parsed.deck, chosen, parsed.nonce));
    p.commit(markFought(recordBattle(recordBurn(p.current()), outcome(result.winner, 'b')), key));
    setReplay({ result, side: 'b', reply: encodeBattle({ owner: me, nonce: parsed.nonce, deck: chosen }) }); setCode('');
  }

  return <div className="battle">
    <section className="record" aria-label={t('せいせき', 'Record')}>
      <div><b data-testid="wins">{album.record.wins}</b><small>{t('勝ち', 'Wins')}</small></div>
      <div><b>{album.record.losses}</b><small>{t('負け', 'Losses')}</small></div>
      <div><b>{album.record.draws}</b><small>{t('引き分け', 'Draws')}</small></div>
      <div className="burn"><b data-testid="rf-burned">{p.burnedLabel}</b><small>{t('燃やしたRF', 'RF burned')}</small></div>
    </section>

    {replay && <BattleReplay key={`${replay.side}-${replay.reply ?? ''}-${replay.result.rounds.map(r => r.hits.length).join('.')}`} replay={replay} lang={lang} reduced={p.reduced} rowsFor={p.rowsFor} copy={p.copy} copyMsg={p.copyMsg} play={p.play} onClose={() => setReplay(null)} />}

    <section className="panel">
      <h2>{t('対戦する', 'Battle')}</h2>
      <p className="note">{t(`どちらも参加費として RFチケット1枚（${p.ticketLabel}）を燃やします。勝っても負けてもRFは誰にも渡りません。勝敗は記録に残るだけです。※SDKの抽選の仕組み上、チケットには3%の確率で1 RFのおまけ（金箔ボーナス）が付きます。`,
        `Each player burns one RF ticket (${p.ticketLabel}) to enter. No RF changes hands — the winner gets only the win in their record. Note: through the SDK draw, a ticket has a 3% chance of a 1 RF gold bonus.`)}</p>
      {full && <p className="error" role="alert">{t(`返信待ちの挑戦が${MAX_OPEN}件あります。返信を受け取ってから新しい挑戦を出してね。`, `You have ${MAX_OPEN} challenges waiting for replies. Settle some before issuing another.`)}</p>}
      <button className="primary" onClick={() => void challenge()} disabled={!ready}>{t(`挑戦状を出す（${p.ticketLabel}を燃やす）`, `Issue a challenge (burn ${p.ticketLabel})`)}</button>
      {challengeCode && <div className="code-out">
        <input readOnly value={challengeCode} aria-label={t('挑戦コード', 'Challenge code')} onFocus={e => e.currentTarget.select()} data-testid="challenge-code" />
        <button onClick={() => p.copy(challengeCode)}>{t('コピー', 'Copy')}</button>
        <small>{t('友だちに送って、返ってきた返信コードを下に貼ると結果が出ます。', 'Send it to a friend, then paste their reply code below to see the result.')}{p.copyMsg && ` · ${p.copyMsg}`}</small>
      </div>}
      <label className="code-in">{t('友だちの挑戦コード／返信コード', "Friend's challenge or reply code")}
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="RFB-XXXXX-XXXXX-…" autoComplete="off" spellCheck={false} disabled={p.paused} /></label>
      <button className="primary" onClick={() => void useCode()} disabled={p.paused || p.busy || !code.trim()}>{t('コードで対戦する', 'Battle with this code')}</button>
      {msg && <p className="error" role="alert">{msg}</p>}
      {album.challenges.length > 0 && <p className="note">{t(`返信待ちの挑戦：${album.challenges.length}件`, `Challenges waiting for a reply: ${album.challenges.length}`)}</p>}
    </section>

    <section className="panel">
      <h2>{t(`デッキ（${chosen.length}/${DECK_SIZE}）`, `Deck (${chosen.length}/${DECK_SIZE})`)}</h2>
      <p className="note">{t('えらんだ順に1戦目から出ます。太陽は月に、月は星に、星は太陽に強い。', 'Cards fight in the order picked. Sun beats Moon, Moon beats Star, Star beats Sun.')}</p>
      {cards.length === 0 ? <p className="note">{t('まずパックを開けてカードを集めよう。', 'Open packs to collect cards first.')}</p>
        : <ul className="deck-pick">{cards.map((s, i) => {
          const at = deck.indexOf(i);
          return <li key={i}><button className={at >= 0 ? 'on' : ''} aria-pressed={at >= 0} onClick={() => toggle(i)} disabled={p.paused}
            aria-label={`${at >= 0 ? t(`${at + 1}番目 · `, `#${at + 1} · `) : ''}${stickerName(s, lang)} · ${ELEMENTS[cardStats(s).element][lang === 'ja' ? 0 : 1]} · HP ${cardStats(s).hp}`}>
            <CardCanvas sticker={s} rows={p.rowsFor(s)} width={84} lang={lang} label="" />
            {at >= 0 && <span className="order">{at + 1}</span>}
          </button></li>;
        })}</ul>}
    </section>
  </div>;
}

function BattleReplay({ replay, lang, reduced, rowsFor, copy, copyMsg, play, onClose }: {
  replay: Replay; lang: Lang; reduced: boolean; rowsFor: (s: Sticker) => Sprite | null; copy: (c: string) => void; copyMsg: string; play: (id: CueId) => void; onClose: () => void;
}) {
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const steps = useMemo(() => replay.result.rounds.flatMap((r, ri) => r.hits.map((h, hi) => ({ ri, hi }))), [replay]);
  const [at, setAt] = useState(reduced ? steps.length : 0), node = useRef<HTMLElement>(null);
  // The code field is below the replay; on a phone bring the fight into view when it starts.
  useEffect(() => { node.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); }, []);
  useEffect(() => {
    if (at >= steps.length) return;
    const timer = setTimeout(() => setAt(a => a + 1), 140);
    return () => clearTimeout(timer);
  }, [at, steps.length]);
  const done = at >= steps.length;
  // Each shown hit sounds by the attacker's element (or critical); a finished round and the match get their own cues.
  useEffect(() => {
    const rounds = replay.result.rounds, prev = at > 0 ? steps[at - 1] : null;
    if (at >= steps.length) { play(verdictCue(replay.result.winner, replay.side)); return; }
    if (prev && steps[at].ri !== prev.ri) play(roundCue(rounds[prev.ri].winner, replay.side));
    const { ri, hi } = steps[at], h = rounds[ri].hits[hi], r = rounds[ri];
    play(hitCue(cardStats(h.by === 'a' ? r.a : r.b).element, h.crit));
  }, [at]); // once per step; the replay is fixed for this component (keyed by battle)
  const cur = done ? { ri: replay.result.rounds.length - 1, hi: -1 } : steps[at];
  const round = replay.result.rounds[cur.ri], hit = cur.hi >= 0 ? round.hits[cur.hi] : null;
  const my = replay.side, their: 'a' | 'b' = my === 'a' ? 'b' : 'a';
  const hp = (side: 'a' | 'b') => hit ? (side === 'a' ? hit.hpA : hit.hpB) : side === 'a' ? round.hpA : round.hpB;
  const card = (side: 'a' | 'b') => side === 'a' ? round.a : round.b;
  const verdict = replay.result.winner === 'draw' ? t('引き分け', 'DRAW') : replay.result.winner === my ? t('勝利！', 'YOU WIN!') : t('敗北…', 'YOU LOSE');
  const roundWins = (side: 'a' | 'b') => replay.result.rounds.slice(0, done ? undefined : cur.ri).filter(r => r.winner === side).length;
  return <section ref={node} className="replay" aria-label={t('バトル', 'Battle')}>
    <div className="score"><span>{t('あなた', 'You')} {roundWins(my)}</span><b>{t(`${cur.ri + 1}戦目`, `Round ${cur.ri + 1}`)}</b><span>{roundWins(their)} {t('相手', 'Them')}</span></div>
    <div className="arena">
      {([my, their] as const).map(side => {
        const s = card(side), max = cardStats(s).hp;
        return <div key={side} className={`fighter ${hit?.by === side ? 'attacking' : ''} ${hit && hit.by !== side ? 'hurt' : ''}`}>
          <CardCanvas sticker={s} rows={rowsFor(s)} width={112} lang={lang} label="" />
          <i className="hp"><em style={{ width: `${(hp(side) / max) * 100}%` }} /></i><small>HP {hp(side)} / {max}</small>
        </div>;
      })}
    </div>
    <p className="log">{hit ? `${hit.by === my ? t('あなたの', 'Your ') : t('相手の', "Their ")}${stickerName(card(hit.by), lang)}${t(' の攻撃！ ', ' attacks! ')}${hit.damage}${t(' ダメージ', ' damage')}${hit.crit ? t('（会心！）', ' (critical!)') : ''}` : ''}</p>
    {done ? <div className="verdict" aria-live="polite"><h2 data-testid="verdict">{verdict}</h2>
      {replay.reply && <div className="code-out">
        <input readOnly value={replay.reply} aria-label={t('返信コード', 'Reply code')} onFocus={e => e.currentTarget.select()} data-testid="reply-code" />
        <button onClick={() => copy(replay.reply!)}>{t('コピー', 'Copy')}</button>
        <small>{t('この返信コードを相手に送ると、相手も同じバトルを見られます。', 'Send this reply code back so they can watch the same battle.')}{copyMsg && ` · ${copyMsg}`}</small>
      </div>}
      <button onClick={onClose}>{t('とじる', 'Close')}</button></div>
      : <button onClick={() => setAt(steps.length)}>{t('スキップ', 'Skip')}</button>}
  </section>;
}

export const ownerLabel = label;
