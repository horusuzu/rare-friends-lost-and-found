import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import { createFriendReader, createGenesisReader } from '@rarefriends/friendsdk/sprites';
import {
  STYLES, RARITY_LABEL, PAGE_CAP, openPack, stickerName, encodeCode, decodeCode, newAlbum, refillPacks, usePack, addSticker,
  moveSticker, serializeAlbum, parseAlbum, type Album, type Sticker, type Collection,
} from './album.js';
import { drawSticker, type Sprite, type Tilt } from './art.js';
import './style.css';

type Lang = 'ja' | 'en';
type Tab = 'book' | 'pack' | 'trade';
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

interface CanvasProps { sticker: Sticker; rows: Sprite | null; size: number; lang: Lang; live?: boolean; reduced?: boolean; label?: string }
function StickerCanvas({ sticker, rows, size, lang, live = false, reduced = false, label }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null), tilt = useRef<Tilt>({ x: 0, y: 0 });
  useEffect(() => {
    const canvas = ref.current, c = canvas?.getContext('2d');
    if (!canvas || !c) return;
    const scale = Math.min(2, globalThis.devicePixelRatio || 1), S = Math.round(size * scale);
    canvas.width = S; canvas.height = S;
    if (!live || reduced) { drawSticker(c, sticker, rows, S, lang, tilt.current); return; }
    let frame = 0;
    const tick = (now: number) => { drawSticker(c, sticker, rows, S, lang, tilt.current, now / 1000); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sticker, rows, size, lang, live, reduced]);
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    tilt.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
  };
  const hidden = label === '';
  return <canvas ref={ref} className="sticker-canvas" style={{ width: size, height: size }} role={hidden ? undefined : 'img'}
    aria-hidden={hidden || undefined} aria-label={hidden ? undefined : label ?? stickerName(sticker, lang)} onPointerMove={live ? move : undefined} />;
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
  const saving = useRef(false), dirty = useRef(false), latest = useRef<Album | null>(null), modalClose = useRef<HTMLButtonElement>(null), alive = useRef(true), pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; id: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [dragPos, setDragPos] = useState<{ index: number; x: number; y: number } | null>(null);
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const owner = collection as Collection, me = labelOf(owner, friendId);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const samples = useMemo(() => STYLES.map((_, i) => ({ ...openPack({ collection: owner, tokenId: friendId }, 7 + i), style: i, backdrop: i, hue: (i * 3) % 12 })), [owner, friendId]);
  const rowsFor = (s: Sticker) => { const v = sprites[keyOf(s.collection, s.tokenId)]; return v && v !== 'error' ? v : null; };

  useEffect(() => {
    alive.current = true; setError(false); setAlbum(null);
    let current = true;
    void (async () => {
      await client.read();
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

  useEffect(() => { if (selected !== null) modalClose.current?.focus(); }, [selected]);
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
  const pages = album ? Math.max(1, ...album.items.map(it => it.page + 1)) : 1;

  function openOne() {
    if (!album || paused || phase !== 'idle') return;
    try {
      const sticker = openPack({ collection: owner, tokenId: friendId }, newSeed());
      const next = addSticker(usePack(album), sticker, 'pack', newSeed());
      commit(next); setOpening(sticker); setPage(next.items[next.items.length - 1].page);
      if (reduced) { setPhase('reveal'); return; }
      setPhase('tear'); setTimeout(() => { if (alive.current) setPhase('reveal'); }, 900);
    } catch (e) { setTradeMsg((e as Error).message); }
  }

  function checkCode() {
    setTradeMsg(''); setIncoming(null);
    try {
      const s = decodeCode(codeInput);
      if (s.collection === owner && s.tokenId === friendId) { setTradeMsg(t('自分のFriendのシールはパックから出ます。友だちのFriendのコードを貼ってね。', 'Stickers of your own Friend come from packs. Paste a code for someone else\'s Friend.')); return; }
      load(s.collection, s.tokenId); setIncoming(s);
    }
    catch (e) {
      const m = (e as Error).message;
      setTradeMsg(lang === 'ja' ? (/typo/.test(m) ? 'コードに打ち間違いがあります。もう一度確かめてください。' : /newer/.test(m) ? '新しい版のコードです。' : 'シールのコードではありません。') : m);
    }
  }
  function acceptTrade() {
    if (!album || !incoming || paused) return;
    try {
      const next = addSticker(album, incoming, 'trade', newSeed());
      commit(next); setIncoming(null); setCodeInput(''); setTab('book'); setPage(next.items[next.items.length - 1].page);
    } catch (e) {
      const m = (e as Error).message;
      setTradeMsg(lang === 'ja' ? (/already/.test(m) ? 'このシールはもうシール帳にあります。' : /full/.test(m) ? 'シール帳がいっぱいです。' : m) : m);
    }
  }
  async function copyCode(code: string) {
    try { await navigator.clipboard.writeText(code); setCopyMsg(t('コピーしました', 'Copied')); }
    catch { setCopyMsg(t('自動コピーできませんでした。コードを長押し/選択してコピーしてください。', 'Automatic copy is blocked here. Select the code and copy it.')); }
  }

  // Drag stickers around the page; a press without movement opens the sticker.
  const openDetail = (index: number) => { setSelected(index); setShownCode(null); setCopyMsg(''); };
  const onDown = (index: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (paused) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { index, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current, rect = pageRef.current?.getBoundingClientRect();
    if (!d || d.id !== e.pointerId || !rect) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
    if (d.moved) setDragPos({ index: d.index, x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };
  const onUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current; drag.current = null;
    if (!d || d.id !== e.pointerId || !album) return;
    if (!d.moved) { openDetail(d.index); setDragPos(null); return; }
    const rect = pageRef.current!.getBoundingClientRect();
    commit(moveSticker(album, d.index, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height));
    setDragPos(null);
  };

  if (error) return <section className="stickers"><div className="center"><h2>OOPS</h2><p>{error === 'save'
    ? t('保存したシール帳を読み込めませんでした。元のデータは上書きせずにそのまま残しています。', 'Could not read your saved sticker book. Your saved data has been left untouched.')
    : t('読み込めませんでした。', 'Could not load.')}</p>
    <button className="primary" onClick={() => setAttempt(v => v + 1)}>{t('再読み込み', 'Retry')}</button></div></section>;
  if (!album) return <section className="stickers"><div className="center"><p role="status">{t('シール帳を開いています…', 'Opening your sticker book…')}</p></div></section>;

  const counts = STYLES.map((_, i) => album.items.filter(it => it.sticker.style === i).length);
  const friendsCollected = new Set(album.items.map(it => keyOf(it.sticker.collection, it.sticker.tokenId))).size;
  const sel = selected !== null ? album.items[selected] : null;

  return <section className="stickers" lang={lang} aria-label="Rare Stickers">
    <header>
      <div className="brand"><small>RARE FRIENDS / STICKER BOOK</small><h1>{t('レアシール帳', 'RARE STICKERS')}</h1></div>
      <button className="lang" onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>{lang === 'ja' ? 'English' : '日本語'}</button>
    </header>
    <nav className="tabs" aria-label={t('メニュー', 'Menu')}>
      {([['book', t('シール帳', 'Book')], ['pack', t('パック', 'Packs')], ['trade', t('交換', 'Trade')]] as [Tab, string][]).map(([id, text]) =>
        <button key={id} className={tab === id ? 'on' : ''} aria-pressed={tab === id} onClick={() => { setTab(id); setSelected(null); setTradeMsg(''); }}>{text}{id === 'pack' ? ` ${album.packs}` : ''}</button>)}
    </nav>

    {tab === 'book' && <div className="book">
      <div className="page" ref={pageRef} aria-label={t(`${page + 1}ページ目`, `Page ${page + 1}`)}>
        {album.items.filter(it => it.page === page).length === 0 && <p className="empty">{t('パックを開けて、シールを貼ろう！', 'Open a pack and stick your first sticker!')}</p>}
        {album.items.map((it, i) => it.page !== page ? null : (() => {
          const pos = dragPos?.index === i ? dragPos : it;
          return <button key={i} className={`placed${dragPos?.index === i ? ' dragging' : ''}`} disabled={paused}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: `translate(-50%,-50%) rotate(${it.rot}rad)` }}
            onClick={e => { if (e.detail === 0) openDetail(i); }} onPointerDown={onDown(i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; setDragPos(null); }}
            aria-label={`${stickerName(it.sticker, lang)} · ${STYLES[it.sticker.style][lang]} · ${labelOf(it.sticker.collection, it.sticker.tokenId)}`}>
            <StickerCanvas sticker={it.sticker} rows={rowsFor(it.sticker)} size={128} lang={lang} label="" />
          </button>;
        })())}
      </div>
      <div className="pager">
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label={t('前のページ', 'Previous page')}>◀</button>
        <span>{page + 1} / {pages}</span>
        <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} aria-label={t('次のページ', 'Next page')}>▶</button>
      </div>
      <p className="stats">{t(`${album.items.length}枚 · ${friendsCollected}体のFriend · 1ページ${PAGE_CAP}枚まで · ドラッグで貼りなおし、タップで拡大`,
        `${album.items.length} stickers · ${friendsCollected} Friends · ${PAGE_CAP} per page · drag to move, tap to view`)}</p>
      <ul className="collection" aria-label={t('種類', 'Finishes')}>{STYLES.map((st, i) => <li key={st.id} className={counts[i] ? 'got' : ''}>{st[lang]} <b>{counts[i]}</b></li>)}</ul>
    </div>}

    {tab === 'pack' && <div className="packs">
      <p className="lead">{t(`あなたの ${me} のシールパック。1日${3}パック（最大9）もらえます。`, `Sticker packs of your ${me}. Three new packs a day (up to nine).`)}</p>
      <button className={`pack ${phase}`} disabled={paused || phase === 'tear' || (phase === 'idle' && album.packs === 0)} onClick={phase === 'reveal' ? () => { setPhase('idle'); setOpening(null); } : openOne}
        aria-label={phase === 'reveal' ? t('次へ', 'Next') : t(`パックを開ける（のこり${album.packs}）`, `Open a pack (${album.packs} left)`)}>
        {phase === 'reveal' && opening
          ? <span className="reveal"><StickerCanvas sticker={opening} rows={rowsFor(opening)} size={220} lang={lang} live reduced={reduced} />
            <b className={`rarity r${STYLES[opening.style].rarity}`}>{STYLES[opening.style][lang]} · {RARITY_LABEL[STYLES[opening.style].rarity][lang === 'ja' ? 0 : 1]}</b>
            <small>{t('シール帳に貼りました · タップで次へ', 'Stuck in your book · tap to continue')}</small></span>
          : <span className="wrapper"><em>RARE<br />STICKERS</em><small>{phase === 'tear' ? t('ビリビリ…', 'Tearing…') : album.packs ? t(`タップで開ける（のこり${album.packs}）`, `Tap to open (${album.packs} left)`) : t('今日のパックはおしまい。また明日！', 'No packs left today. Come back tomorrow!')}</small></span>}
      </button>
      <h2 className="samples-title">{t('シールの種類（見本）', 'Sticker finishes (samples)')}</h2>
      <ul className="samples">{STYLES.map((st, i) => {
        const sample = samples[i];
        return <li key={st.id}><StickerCanvas sticker={sample} rows={rowsFor(sample)} size={84} lang={lang} label="" />
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
        <StickerCanvas sticker={incoming} rows={rowsFor(incoming)} size={180} lang={lang} live reduced={reduced} />
        <p>{stickerName(incoming, lang)} · {STYLES[incoming.style][lang]} · {labelOf(incoming.collection, incoming.tokenId)}
          {sprites[keyOf(incoming.collection, incoming.tokenId)] === 'error' && <><br /><span className="error">{t('このFriendの絵を読み込めませんでした。', "Could not load this Friend's art.")}</span></>}</p>
        <button className="primary" onClick={acceptTrade} disabled={paused}>{t('シール帳に貼る', 'Add to my book')}</button>
      </div>}
      <p className="note">{t('交換コードはシールの「デザイン」を渡すだけです。持ち主の証明にはならず、お金の価値もありません。Friendの絵は毎回ブロックチェーンから読み込みます。',
        'A trade code hands over a sticker design only. It proves nothing about ownership and has no monetary value. Friend art is always read from the chain.')}</p>
    </div>}

    {sel && <div className="modal" role="dialog" aria-modal="true" aria-label={stickerName(sel.sticker, lang)}
      onKeyDown={e => { if (e.key === 'Escape') setSelected(null); }} onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}>
      <div className="card">
        <StickerCanvas sticker={sel.sticker} rows={rowsFor(sel.sticker)} size={240} lang={lang} live reduced={reduced} />
        <h2>{stickerName(sel.sticker, lang)}</h2>
        <p>{'★'.repeat(STYLES[sel.sticker.style].rarity)} {STYLES[sel.sticker.style][lang]} · No.{String(sel.sticker.serial).padStart(4, '0')}<br />
          {labelOf(sel.sticker.collection, sel.sticker.tokenId)} · {sel.source === 'pack' ? t('パックから', 'From a pack') : t('交換でもらった', 'Received in a trade')}</p>
        {shownCode ? <div className="code-out">
          <input readOnly value={shownCode} aria-label={t('交換コード', 'Trade code')} onFocus={e => e.currentTarget.select()} data-testid="trade-code" />
          <button onClick={() => void copyCode(shownCode)}>{t('コピー', 'Copy')}</button>
          {copyMsg && <small role="status">{copyMsg}</small>}
        </div> : <button className="primary" onClick={() => setShownCode(encodeCode(sel.sticker))} disabled={paused}>{t('交換コードを出す', 'Show trade code')}</button>}
        <button ref={modalClose} onClick={() => setSelected(null)}>{t('とじる', 'Close')}</button>
      </div>
    </div>}
    <footer>{(() => { const own = sprites[keyOf(owner, friendId)]; return own && own !== 'error' ? <FriendPixels rows={own} label={me} /> : null; })()}{me} · {t('無料 · シールはRFではありません', 'FREE · STICKERS ARE NOT RF')}</footer>
    {saveError && <p className="error" role="alert">{t('シール帳を保存できませんでした。次の変更でもう一度保存します。', 'Could not save your book. It will retry with the next change.')}</p>}
  </section>;
}
