import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import { createFriendReader, createGenesisReader } from '@rarefriends/friendsdk/sprites';
import {
  STYLES, RARITY_LABEL, PAGE_CAP, openPack, stickerName, encodeCode, decodeCode, newAlbum, refillPacks, usePack, addSticker,
  serializeAlbum, parseAlbum, premiumSticker, recordRfPack, RF_PACK_OUTCOMES, MAX_ITEMS, setSound, type Album, type Sticker, type Collection,
} from './album.ts';
import { CUES, createSound, revealCue, type CueId } from './sound.ts';
import definition from './game.json' with { type: 'json' };
import { type Sprite } from './art.ts';
import { CardCanvas } from './card-canvas.tsx';
import { BattleTab } from './battle.tsx';
import { ELEMENTS, cardStats } from './cards.ts';
import './style.css';

type Lang = 'ja' | 'en';
type Tab = 'book' | 'pack' | 'battle' | 'trade';
const POCKETS = 9;
type Snapshot = Awaited<ReturnType<GameComponentProps['client']['read']>>;
const RF = 10n ** 18n, PACK_PRICE = BigInt(definition.price);
const rf = (v: bigint) => `${(Number(v / 10n ** 16n) / 100).toLocaleString()} RF`;
const ODDS = definition.outcomes.map(o => o.chanceBps / 100);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const keyOf = (c: Collection, id: bigint) => `${c}:${id}`;
const labelOf = (c: Collection, id: bigint) => `${c === 'genesis' ? 'Genesis' : 'Friend'} #${id}`;
const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

/** Canonical sprites for every Friend in the book, read once per token. */
function useSprites() {
  const [sprites, setSprites] = useState<Record<string, Sprite | 'error'>>({});
  // One reader per collection (shared batching); each token is requested at most once per session,
  // so a trade code for a missing Friend cannot trigger repeated RPC reads.
  const requested = useRef(new Set<string>()), readers = useRef<{ generations?: ReturnType<typeof createFriendReader>; genesis?: ReturnType<typeof createGenesisReader> }>({});
  const load = useCallback((c: Collection, id: bigint) => {
    const key = keyOf(c, id);
    if (requested.current.has(key)) return;
    requested.current.add(key);
    const reader = c === 'genesis' ? (readers.current.genesis ??= createGenesisReader()) : (readers.current.generations ??= createFriendReader());
    reader.read(id)
      .then(art => setSprites(prev => ({ ...prev, [key]: art.clips.idle.down[0].rows })))
      .catch(() => setSprites(prev => ({ ...prev, [key]: 'error' })));
  }, []);
  return { sprites, load };
}

function FriendPixels({ rows, label }: { rows: Sprite; label: string }) {
  return <svg className="friend-pixels" width={18} height={18} viewBox="0 0 16 16" role="img" aria-label={label}>
    {rows.flatMap((row, y) => [...row].map((p, x) => p === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#ff7eb6" /> : null))}
  </svg>;
}

export default function RareStickers(props: GameComponentProps) {
  return <Book key={`${props.collection ?? 'generations'}:${props.friendId}`} {...props} />;
}

function Book({ friendId, collection = 'generations', client, paused }: GameComponentProps) {
  const [lang, setLang] = useState<Lang>('ja'), [tab, setTab] = useState<Tab>('book');
  const [album, setAlbum] = useState<Album | null>(null), [error, setError] = useState<false | 'load' | 'save'>(false), [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState(false), [page, setPage] = useState(0), [selected, setSelected] = useState<number | null>(null);
  const [opening, setOpening] = useState<Sticker | null>(null), [phase, setPhase] = useState<'idle' | 'tear' | 'reveal'>('idle');
  const [codeInput, setCodeInput] = useState(''), [incoming, setIncoming] = useState<Sticker | null>(null), [tradeMsg, setTradeMsg] = useState('');
  const [shownCode, setShownCode] = useState<string | null>(null), [copyMsg, setCopyMsg] = useState('');
  const { sprites, load } = useSprites();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [busy, setBusy] = useState(false), [rfMsg, setRfMsg] = useState('');
  const saving = useRef(false), dirty = useRef(false), latest = useRef<Album | null>(null), modalClose = useRef<HTMLButtonElement>(null), alive = useRef(true);
  const [sfx] = useState(() => createSound(CUES)), toggleSoundRef = useRef<() => void>(() => undefined);
  const play = (id: CueId) => { sfx.play(id); };
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const owner = collection as Collection, me = labelOf(owner, friendId);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const samples = useMemo(() => STYLES.map((_, i) => ({ ...openPack({ collection: owner, tokenId: friendId }, 7 + i), style: i, backdrop: i, hue: (i * 3) % 12 })), [owner, friendId]);
  const rowsFor = (s: Sticker) => { const v = sprites[keyOf(s.collection, s.tokenId)]; return v && v !== 'error' ? v : null; };

  useEffect(() => {
    alive.current = true; setError(false); setAlbum(null);
    let current = true;
    void (async () => {
      const snap = await client.read();
      if (current) setSnapshot(snap);
      // If the saved book cannot be read, stop instead of starting a new book that would overwrite it.
      let book: Album;
      try { book = parseAlbum(await (client.loadLocal?.() ?? Promise.resolve(null))) ?? newAlbum(today()); }
      catch { if (current) setError('save'); return; }
      if (!current) return;
      const refilled = refillPacks(book, today());
      latest.current = refilled; setAlbum(refilled);
      load(owner, friendId);
      if (refilled !== book) persist(refilled);
    })().catch(() => { if (current) setError('load'); });
    return () => { current = false; alive.current = false; };
  }, [client, friendId, owner, attempt]);

  useEffect(() => {
    if (selected === null) return;
    modalClose.current?.focus();
    // Escape closes the card view wherever focus is (the code button disappears after use).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);
  // Sound: the AudioContext is created on the first gesture; silent while muted, paused or hidden.
  useEffect(() => { sfx.setEnabled(album?.sound ?? true); }, [sfx, album?.sound]);
  useEffect(() => {
    const sync = () => sfx.setSuspended(paused || document.hidden);
    // pagehide covers iOS app switching and back-forward cache, where visibilitychange can be skipped.
    const hide = () => sfx.setSuspended(true);
    sync(); document.addEventListener('visibilitychange', sync); window.addEventListener('pagehide', hide); window.addEventListener('pageshow', sync);
    return () => { document.removeEventListener('visibilitychange', sync); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', sync); };
  }, [sfx, paused]);
  useEffect(() => {
    const unlock = () => { sfx.unlock(); };
    const gestures = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
    gestures.forEach(g => window.addEventListener(g, unlock, true));
    // M toggles sound, except while typing a code.
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (e.key.toLowerCase() === 'm' && !typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) toggleSoundRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => { gestures.forEach(g => window.removeEventListener(g, unlock, true)); window.removeEventListener('keydown', onKey); };
  }, [sfx]);
  useEffect(() => () => sfx.close(), [sfx]);
  // Load art for every Friend that appears in the book.
  useEffect(() => { album?.items.forEach(it => load(it.sticker.collection, it.sticker.tokenId)); }, [album, load]);

  /** One save at a time; changes made meanwhile are written right after, so the latest book always lands. */
  function persist(next: Album) {
    latest.current = next; dirty.current = true;
    if (!client.saveLocal || saving.current) return;
    saving.current = true; dirty.current = false;
    const done = (ok: boolean) => {
      saving.current = false;
      if (alive.current) setSaveError(!ok);
      if (dirty.current && latest.current) persist(latest.current);
    };
    void client.saveLocal(serializeAlbum(next)).then(() => done(true), () => { dirty.current = true; done(false); });
  }
  const commit = (next: Album) => { setAlbum(next); persist(next); };
  toggleSoundRef.current = () => {
    const current = latest.current ?? album;
    // The host refuses saves while paused or during an RF action, so the switch waits for those to finish.
    if (!current || paused || busy) return;
    const next = setSound(current, !current.sound);
    commit(next); sfx.setEnabled(next.sound);
    if (next.sound && sfx.unlock()) sfx.play('tap');
  };
  const pages = album ? Math.max(1, Math.ceil(album.items.length / POCKETS)) : 1;

  function openOne() {
    if (!album || paused || busy || phase !== 'idle') return;
    try {
      const sticker = openPack({ collection: owner, tokenId: friendId }, newSeed());
      const next = addSticker(usePack(album), sticker, 'pack', newSeed());
      commit(next); reveal(sticker, next);
    } catch (e) { setTradeMsg((e as Error).message); play('error'); }
  }

  const refresh = () => client.read().then(s => { if (alive.current) setSnapshot(s); }, () => undefined);
  const reveal = (sticker: Sticker, next: Album) => {
    setOpening(sticker); setPage(Math.floor((next.items.length - 1) / POCKETS));
    const shine = revealCue(STYLES[sticker.style].rarity);
    if (reduced) { setPhase('reveal'); play(shine); return; }
    setPhase('tear'); play('tear');
    setTimeout(() => { if (alive.current) { setPhase('reveal'); play(shine); } }, 900);
  };

  /**
   * Spend one RF ticket through the SDK: buy if none is held → play → settle. A pending play is
   * resumed by its id instead of consuming another ticket. Returns the outcome, or null.
   */
  async function spendTicket(forBattle = false): Promise<{ outcome: number; playId: bigint } | null> {
    setBusy(true); setRfMsg('');
    try {
      const snap = await client.read();
      let play = snap.plays.find(p => p.outcomeId === null);
      // A half-opened RF pack keeps its promised card: never spend it as a battle entry.
      if (play && forBattle) { setRfMsg(t('開けかけのRFパックがあります。先にパックの画面で開けてね。', 'You have a half-opened RF pack. Open it on the Packs tab first.')); return null; }
      if (!play) {
        if (snap.consumables === 0n) await client.buy(1n);
        [play] = await client.play(1n);
      }
      const outcome = play.outcomeId ?? (await client.settle(play.id)).outcomeId;
      if (outcome === null) { setRfMsg(t('結果がまだ確定していません。少し待ってからもう一度押してください。', 'The result is not final yet. Wait a moment and try again.')); return null; }
      return { outcome, playId: play.id };
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setRfMsg(/cancel/i.test(m) ? t('キャンセルしました。', 'Cancelled.') : t(`RFチケットを使えませんでした。${m}`, `Could not use an RF ticket. ${m}`));
      return null;
    } finally { await refresh(); if (alive.current) setBusy(false); }
  }

  /** RF pack: the SDK outcome picks the finish. */
  async function openRfPack() {
    if (!album || paused || busy || phase !== 'idle') return;
    if (album.items.length >= MAX_ITEMS) { setRfMsg(t('カード帳がいっぱいです。', 'Your binder is full.')); return; }
    const spent = await spendTicket();
    if (!spent) return;
    {
      const sticker = premiumSticker({ collection: owner, tokenId: friendId }, spent.outcome, Number(spent.playId % 0x7fffffffn) ^ newSeed());
      const next = addSticker(recordRfPack(latest.current ?? album), sticker, 'pack', newSeed());
      commit(next); reveal(sticker, next);
    }
  }
  async function claimGold(count: bigint) {
    if (paused || busy || count === 0n) return;
    setBusy(true); setRfMsg('');
    try { await client.redeem(RF_PACK_OUTCOMES.length, count); setRfMsg(t(`金箔ボーナス ${rf(count * BigInt(definition.outcomes[3].reward))} を受け取りました。`, `Claimed ${rf(count * BigInt(definition.outcomes[3].reward))} gold bonus.`)); }
    catch (e) { setRfMsg(/cancel/i.test(e instanceof Error ? e.message : '') ? t('キャンセルしました。', 'Cancelled.') : t('受け取れませんでした。', 'Could not claim the bonus.')); }
    finally { await refresh(); if (alive.current) setBusy(false); }
  }

  function checkCode() {
    setTradeMsg(''); setIncoming(null);
    try {
      const s = decodeCode(codeInput);
      if (s.collection === owner && s.tokenId === friendId) { setTradeMsg(t('自分のFriendのシールはパックから出ます。友だちのFriendのコードを貼ってね。', 'Stickers of your own Friend come from packs. Paste a code for someone else\'s Friend.')); return; }
      load(s.collection, s.tokenId); setIncoming(s); play('flip');
    }
    catch (e) {
      const m = (e as Error).message; play('error');
      setTradeMsg(lang === 'ja' ? (/typo/.test(m) ? 'コードに打ち間違いがあります。もう一度確かめてください。' : /newer/.test(m) ? '新しい版のコードです。' : 'シールのコードではありません。') : m);
    }
  }
  function acceptTrade() {
    if (!album || !incoming || paused || busy) return;
    try {
      const next = addSticker(album, incoming, 'trade', newSeed());
      commit(next); setIncoming(null); setCodeInput(''); setTab('book'); setPage(Math.floor((next.items.length - 1) / POCKETS)); play('accept');
    } catch (e) {
      const m = (e as Error).message; play('error');
      setTradeMsg(lang === 'ja' ? (/already/.test(m) ? 'このシールはもうシール帳にあります。' : /full/.test(m) ? 'シール帳がいっぱいです。' : m) : m);
    }
  }
  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); setCopyMsg(t('コピーしました', 'Copied')); play('copy'); }
    catch { play('error'); setCopyMsg(t('自動コピーできませんでした。コードを長押し/選択してコピーしてください。', 'Automatic copy is blocked here. Select the code and copy it.')); }
  }

  const openDetail = (index: number) => { setSelected(index); setShownCode(null); setCopyMsg(''); play('flip'); };
  const turnPage = (delta: number) => { setPage(p => p + delta); play('page'); };

  if (error) return <section className="stickers"><div className="center"><h2>OOPS</h2><p>{error === 'save'
    ? t('保存したシール帳を読み込めませんでした。元のデータは上書きせずにそのまま残しています。', 'Could not read your saved sticker book. Your saved data has been left untouched.')
    : t('読み込めませんでした。', 'Could not load.')}</p>
    <button className="primary" onClick={() => setAttempt(v => v + 1)}>{t('再読み込み', 'Retry')}</button></div></section>;
  if (!album) return <section className="stickers"><div className="center"><p role="status">{t('シール帳を開いています…', 'Opening your sticker book…')}</p></div></section>;

  const counts = STYLES.map((_, i) => album.items.filter(it => it.sticker.style === i).length);
  const friendsCollected = new Set(album.items.map(it => keyOf(it.sticker.collection, it.sticker.tokenId))).size;
  const sel = selected !== null ? album.items[selected] : null;

  // Long-press on cards and buttons should not open the browser menu; code fields keep theirs for copy/paste.
  const noMenu = (e: React.MouseEvent) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); };
  return <section className="stickers" lang={lang} aria-label="Rare Stickers" onContextMenu={noMenu}>
    <header>
      <div className="brand"><small>RARE FRIENDS / TRADING CARDS</small><h1>{t('レアトレカ', 'RARE CARDS')}</h1></div>
      <div className="header-tools">
        <button className={`sound-toggle${album.sound ? '' : ' off'}`} onClick={() => toggleSoundRef.current()} aria-pressed={album.sound} disabled={paused || busy}
          aria-label={t('効果音', 'Sound effects')} title={t('効果音 オン/オフ（M）', 'Sound effects on/off (M)')} aria-keyshortcuts="M" data-testid="sound"><span aria-hidden="true">♪</span></button>
        <button className="lang" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>{lang === 'ja' ? 'English' : '日本語'}</button>
      </div>
    </header>
    <nav className="tabs" aria-label={t('メニュー', 'Menu')}>
      {([['book', t('カード帳', 'Binder')], ['pack', t('パック', 'Packs')], ['battle', t('バトル', 'Battle')], ['trade', t('交換', 'Trade')]] as [Tab, string][]).map(([id, text]) =>
        <button key={id} className={tab === id ? 'on' : ''} aria-pressed={tab === id} disabled={busy} onClick={() => { setTab(id); setSelected(null); setTradeMsg(''); play('tap'); }}>{text}{id === 'pack' ? ` ${album.packs}` : ''}</button>)}
    </nav>

    {tab === 'book' && <div className="book">
      <div className="binder" aria-label={t(`${page + 1}ページ目`, `Page ${page + 1}`)}>
        {Array.from({ length: POCKETS }, (_, slot) => {
          const i = page * POCKETS + slot, it = album.items[i];
          if (!it) return <div key={slot} className="pocket empty-pocket" aria-hidden="true" />;
          const st = cardStats(it.sticker);
          return <button key={slot} className="pocket" disabled={paused} onClick={() => openDetail(i)}
            aria-label={`${stickerName(it.sticker, lang)} · ${STYLES[it.sticker.style][lang]} · ${ELEMENTS[st.element][lang === 'ja' ? 0 : 1]} HP ${st.hp} · ${labelOf(it.sticker.collection, it.sticker.tokenId)}`}>
            <CardCanvas sticker={it.sticker} rows={rowsFor(it.sticker)} width={112} lang={lang} label="" />
          </button>;
        })}
        {album.items.length === 0 && <p className="empty">{t('パックを開けて、カードを集めよう！', 'Open a pack to collect your first card!')}</p>}
      </div>
      <div className="pager">
        <button disabled={page === 0} onClick={() => turnPage(-1)} aria-label={t('前のページ', 'Previous page')}>◀</button>
        <span>{page + 1} / {pages}</span>
        <button disabled={page >= pages - 1} onClick={() => turnPage(1)} aria-label={t('次のページ', 'Next page')}>▶</button>
      </div>
      <p className="stats">{t(`${album.items.length}枚 · ${friendsCollected}体のFriend · ${album.record.wins}勝${album.record.losses}敗 · 使ったRF ${rf(BigInt(album.rfPacks + album.rfBurned) * PACK_PRICE)}（うち燃やした ${rf(BigInt(album.rfBurned) * PACK_PRICE)}）`,
        `${album.items.length} cards · ${friendsCollected} Friends · ${album.record.wins}W ${album.record.losses}L · ${rf(BigInt(album.rfPacks + album.rfBurned) * PACK_PRICE)} spent (${rf(BigInt(album.rfBurned) * PACK_PRICE)} burned)`)}</p>
      <ul className="collection" aria-label={t('種類', 'Finishes')}>{STYLES.map((st, i) => <li key={st.id} className={counts[i] ? 'got' : ''}>{st[lang]} <b>{counts[i]}</b></li>)}</ul>
    </div>}

    {tab === 'battle' && <BattleTab album={album} commit={commit} current={() => latest.current ?? album} me={{ collection: owner, tokenId: friendId }} lang={lang} paused={paused} busy={busy} reduced={reduced}
      rowsFor={rowsFor} loadArt={s => load(s.collection, s.tokenId)} burnTicket={async () => { if (busy || paused) return false; return (await spendTicket(true)) !== null; }}
      ticketLabel={rf(PACK_PRICE)} burnedLabel={rf(BigInt(album.rfBurned) * PACK_PRICE)} copy={code => void copyCode(code)} copyMsg={copyMsg} play={play} />}
    {tab === 'battle' && rfMsg && <p className="rf-msg" role="status">{rfMsg}</p>}

    {tab === 'pack' && <div className="packs">
      <p className="lead">{t(`あなたの ${me} のシールパック。1日${3}パック（最大9）もらえます。`, `Sticker packs of your ${me}. Three new packs a day (up to nine).`)}</p>
      <button className={`pack ${phase}`} disabled={paused || busy || phase === 'tear' || (phase === 'idle' && album.packs === 0)} onClick={phase === 'reveal' ? () => { setPhase('idle'); setOpening(null); play('pocket'); } : openOne}
        aria-label={phase === 'reveal' ? t('次へ', 'Next') : t(`パックを開ける（のこり${album.packs}）`, `Open a pack (${album.packs} left)`)}>
        {phase === 'reveal' && opening
          ? <span className="reveal"><CardCanvas sticker={opening} rows={rowsFor(opening)} width={190} lang={lang} live reduced={reduced} />
            <b className={`rarity r${STYLES[opening.style].rarity}`}>{STYLES[opening.style][lang]} · {RARITY_LABEL[STYLES[opening.style].rarity][lang === 'ja' ? 0 : 1]}</b>
            <small>{t('シール帳に貼りました · タップで次へ', 'Stuck in your book · tap to continue')}</small></span>
          : <span className="wrapper"><em>RARE<br />STICKERS</em><small>{phase === 'tear' ? t('ビリビリ…', 'Tearing…') : album.packs ? t(`タップで開ける（のこり${album.packs}）`, `Tap to open (${album.packs} left)`) : t('今日のパックはおしまい。また明日！', 'No packs left today. Come back tomorrow!')}</small></span>}
      </button>
      {(() => {
        const pending = snapshot?.plays.some(p => p.outcomeId === null) ?? false, gold = snapshot?.inventory[3] ?? 0n;
        const preview = client.mode === 'preview', canAfford = !!snapshot && (snapshot.consumables > 0n || snapshot.rfBalance >= PACK_PRICE);
        return <section className="rf-pack" aria-label={t('RFパック', 'RF packs')}>
          <h2>{t('RFパック', 'RF pack')} <b>{rf(PACK_PRICE)}</b></h2>
          <p>{t(`ノーマルなし！ ${RF_PACK_OUTCOMES.map((o, i) => `${o[0]} ${ODDS[i]}%`).join(' / ')}（金箔は ${rf(BigInt(definition.outcomes[3].reward))} のおまけ付き）`,
            `No commons! ${RF_PACK_OUTCOMES.map((o, i) => `${o[1]} ${ODDS[i]}%`).join(' / ')} (gold foil includes a ${rf(BigInt(definition.outcomes[3].reward))} bonus)`)}</p>
          <button className="rf-open" onClick={() => void openRfPack()} disabled={paused || busy || phase !== 'idle' || !snapshot || (!pending && !canAfford)}>
            {busy ? t('処理中…', 'Working…') : pending ? t('開けかけのRFパックを開ける', 'Open your pending RF pack') : t(`RFパックを開ける（${rf(PACK_PRICE)}）`, `Open an RF pack (${rf(PACK_PRICE)})`)}
          </button>
          <dl className="rf-stats">
            <div><dt>{preview ? t('残高（模擬RF）', 'Balance (simulated RF)') : t('Friendウォレットの残高', 'Friend wallet RF')}</dt><dd data-testid="rf-balance">{snapshot ? rf(snapshot.rfBalance) : '—'}</dd></div>
            <div><dt>{t('これまでに使ったRF', 'RF spent so far')}</dt><dd data-testid="rf-spent">{rf(BigInt(album.rfPacks) * PACK_PRICE)}</dd></div>
          </dl>
          {gold > 0n && <button className="gold-claim" onClick={() => void claimGold(gold)} disabled={paused || busy}>{t(`金箔ボーナス ${rf(gold * BigInt(definition.outcomes[3].reward))} を受け取る`, `Claim ${rf(gold * BigInt(definition.outcomes[3].reward))} gold bonus`)}</button>}
          {rfMsg && <p className="rf-msg" role="status">{rfMsg}</p>}
          <p className="note">{preview
            ? t('お試し版では残高と抽選結果は模擬です（実際のRFは動きません）。本番ではRFの支払いと抽選がブロックチェーン上で行われ、購入ごとにウォレットの確認があります。', 'Preview: balances and draws are simulated; no real RF moves. Live, the RF payment and draw happen on-chain with a wallet confirmation for each purchase.')
            : t('RFの支払いと抽選はブロックチェーン上で行われます。', 'RF payments and draws happen on-chain.')}</p>
        </section>;
      })()}
      <h2 className="samples-title">{t('シールの種類（見本）', 'Sticker finishes (samples)')}</h2>
      <ul className="samples">{STYLES.map((st, i) => {
        const sample = samples[i];
        return <li key={st.id}><CardCanvas sticker={sample} rows={rowsFor(sample)} width={84} lang={lang} label="" />
          <span>{'★'.repeat(st.rarity)} {st[lang]}</span><b>{Math.round(st.weight / STYLES.reduce((a, s) => a + s.weight, 0) * 100)}%</b></li>;
      })}</ul>
      {tradeMsg && <p className="error" role="alert">{tradeMsg}</p>}
      <p className="note">{t('パックは無料・シミュレーションです。シールにお金の価値はありません。', 'Packs are free and simulated. Stickers have no monetary value.')}</p>
    </div>}

    {tab === 'trade' && <div className="trade">
      <h2>{t('シールを交換しよう', 'Trade stickers')}</h2>
      <ol className="steps">
        <li>{t('シール帳で渡したいシールをタップ →「交換コードを出す」', 'In your book, tap a sticker → "Show trade code"')}</li>
        <li>{t('コードを LINE などで友だちに送る', 'Send the code to a friend (chat, DM…)')}</li>
        <li>{t('友だちのコードを下に貼って受け取る', 'Paste their code below and add it to your book')}</li>
      </ol>
      <label className="code-in">{t('友だちの交換コード', "Friend's trade code")}
        <input value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="RF-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} disabled={paused} /></label>
      <button className="primary" onClick={checkCode} disabled={paused || !codeInput.trim()}>{t('コードを確かめる', 'Check code')}</button>
      {tradeMsg && <p className="error" role="alert">{tradeMsg}</p>}
      {incoming && <div className="incoming">
        <CardCanvas sticker={incoming} rows={rowsFor(incoming)} width={170} lang={lang} live reduced={reduced} />
        <p>{stickerName(incoming, lang)} · {STYLES[incoming.style][lang]} · {labelOf(incoming.collection, incoming.tokenId)}
          {sprites[keyOf(incoming.collection, incoming.tokenId)] === 'error' && <><br /><span className="error">{t('このFriendの絵を読み込めませんでした。', "Could not load this Friend's art.")}</span></>}</p>
        <button className="primary" onClick={acceptTrade} disabled={paused}>{t('シール帳に貼る', 'Add to my book')}</button>
      </div>}
      <p className="note">{t('交換コードはシールの「デザイン」を渡すだけです。持ち主の証明にはならず、お金の価値もありません。Friendの絵は毎回ブロックチェーンから読み込みます。',
        'A trade code hands over a sticker design only. It proves nothing about ownership and has no monetary value. Friend art is always read from the chain.')}</p>
    </div>}

    {sel && <div className="modal" role="dialog" aria-modal="true" aria-label={stickerName(sel.sticker, lang)}
      onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
      <div className="card">
        <CardCanvas sticker={sel.sticker} rows={rowsFor(sel.sticker)} width={220} lang={lang} live reduced={reduced} />
        <h2>{stickerName(sel.sticker, lang)}</h2>
        <p>{'★'.repeat(STYLES[sel.sticker.style].rarity)} {STYLES[sel.sticker.style][lang]} · {ELEMENTS[cardStats(sel.sticker).element][lang === 'ja' ? 0 : 1]} · HP {cardStats(sel.sticker).hp} / {t('攻', 'ATK')} {cardStats(sel.sticker).atk} / {t('防', 'DEF')} {cardStats(sel.sticker).def} · No.{String(sel.sticker.serial).padStart(4, '0')}<br />
          {labelOf(sel.sticker.collection, sel.sticker.tokenId)} · {sel.source === 'pack' ? t('パックから', 'From a pack') : t('交換でもらった', 'Received in a trade')}</p>
        {shownCode ? <div className="code-out">
          <input readOnly value={shownCode} aria-label={t('交換コード', 'Trade code')} onFocus={e => e.currentTarget.select()} data-testid="trade-code" />
          <button onClick={() => void copyCode(shownCode)}>{t('コピー', 'Copy')}</button>
          {copyMsg && <small role="status">{copyMsg}</small>}
        </div> : <button className="primary" onClick={() => { setShownCode(encodeCode(sel.sticker)); play('tap'); }} disabled={paused}>{t('交換コードを出す', 'Show trade code')}</button>}
        <button ref={modalClose} onClick={() => setSelected(null)}>{t('とじる', 'Close')}</button>
      </div>
    </div>}
    <footer>{(() => { const own = sprites[keyOf(owner, friendId)]; return own && own !== 'error' ? <FriendPixels rows={own} label={me} /> : null; })()}{me} · {t('カードにお金の価値はありません · RFは模擬（お試し版）', 'Cards have no monetary value · RF is simulated in this preview')}</footer>
    {saveError && <p className="error" role="alert">{t('シール帳を保存できませんでした。次の変更でもう一度保存します。', 'Could not save your book. It will retry with the next change.')}</p>}
  </section>;
}
