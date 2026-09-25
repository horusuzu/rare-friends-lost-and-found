import { useEffect, useRef, useState } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import { createFriendReader, createGenesisReader } from '@rarefriends/friendsdk/sprites';
import { createGame, step, WIDTH, HEIGHT, TIERS, RADII, type State } from './engine.js';
import { TIER_INFO, drawJar, drawOrb, type Sprite } from './art.js';
import { createDropSound, type DropSound } from './sound.js';
import { cuesBetween, NO_COMBO } from './cues.js';
import { EMPTY_RECORD, parseSave, serializeSave, type SavedRecord } from './save.js';
import './style.css';

type Lang = 'ja' | 'en';

function FriendPixels({ rows, fill, label, size, className }: { rows: Sprite; fill: string; label: string; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={label}>
    {rows.flatMap((row, y) => [...row].map((p, x) => p === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} /> : null))}
  </svg>;
}

/** Canvas backing-store scale: sharp on high-DPR phones, capped so a 3x screen does not triple the fill cost. */
const MAX_PIXEL_RATIO = 2;
const pixelRatio = () => Math.min(MAX_PIXEL_RATIO, Math.max(1, Math.round(window.devicePixelRatio || 1)));
function usePixelRatio() {
  const [ratio, setRatio] = useState(pixelRatio);
  useEffect(() => {
    const update = () => setRatio(pixelRatio());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return ratio;
}

/** NEXT preview drawn with the same orb art as the jar, keeping sizes relative to the largest droppable tier. */
const NEXT_BOX = 64, NEXT_SCALE = (NEXT_BOX / 2 - 3) / RADII[4];
function NextOrb({ tier, label, ratio }: { tier: number; label: string; ratio: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, NEXT_BOX, NEXT_BOX);
    drawOrb(c, tier, NEXT_BOX / 2, NEXT_BOX / 2, null, NEXT_SCALE);
  }, [tier, ratio]);
  return <canvas ref={ref} className="next-orb" width={NEXT_BOX * ratio} height={NEXT_BOX * ratio} data-testid="next-tier" data-tier={tier} role="img" aria-label={label} />;
}

const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

export default function RareDrop(props: GameComponentProps) {
  return <Jar key={`${props.collection ?? 'generations'}:${props.friendId}`} {...props} />;
}

function Jar({ friendId, collection = 'generations', client, paused }: GameComponentProps) {
  const [lang, setLang] = useState<Lang>('ja');
  const [sprite, setSprite] = useState<Sprite | null>(null);
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false), [manualPause, setManualPause] = useState(false);
  const [view, setView] = useState<State>(() => createGame(1));
  const [best, setBest] = useState(0), [bestTier, setBestTier] = useState(0);
  const [saveError, setSaveError] = useState(false), [shareError, setShareError] = useState(false);
  const [sound, setSound] = useState(true), [hidden, setHidden] = useState(() => document.hidden);
  const sfx = useRef<DropSound | null>(null), combo = useRef(NO_COMBO), writing = useRef(false), toggleRef = useRef(() => {});
  const canvas = useRef<HTMLCanvasElement>(null), world = useRef<State>(createGame(1));
  const keys = useRef(new Set<string>()), touch = useRef(new Map<number, string>());
  const dropTap = useRef(false), aim = useRef<number | null>(null), record = useRef<SavedRecord>(EMPTY_RECORD), unsaved = useRef(false), alive = useRef(false);
  const ratio = usePixelRatio();
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const tierName = (tier: number) => tier < 1 ? '—' : lang === 'ja' ? TIER_INFO[tier - 1].ja : TIER_INFO[tier - 1].en;
  const active = started && !paused && !manualPause && ready;
  const label = `${collection === 'genesis' ? 'Genesis' : 'Friend'} #${String(friendId)}`;

  useEffect(() => {
    alive.current = true; setReady(false); setError('');
    let current = true;
    void (async () => {
      await client.read();
      const reader = collection === 'genesis' ? createGenesisReader() : createFriendReader();
      const [art, raw] = await Promise.all([
        reader.read(friendId),
        client.loadLocal?.().catch(() => { if (current) setSaveError(true); return null; }) ?? null,
      ]);
      if (!current) return;
      setSprite(art.clips.idle.down[0].rows);
      try {
        const saved = parseSave(raw, TIERS);
        if (saved) { record.current = saved; setBest(saved.best); setBestTier(saved.bestTier); setSound(saved.sound); sfx.current?.setEnabled(saved.sound); }
      } catch { setSaveError(true); }
      setReady(true);
    })().catch(() => { if (current) setError('load'); });
    return () => { current = false; alive.current = false; };
  }, [client, friendId, collection, attempt]);

  useEffect(() => {
    const clear = () => { keys.current.clear(); touch.current.clear(); dropTap.current = false; aim.current = null; };
    const blur = () => { clear(); setManualPause(true); };
    const visibility = () => { setHidden(document.hidden); if (document.hidden) blur(); };
    // iOS can freeze the page without a visibilitychange; pagehide pauses the jar as well.
    const leave = () => { setHidden(true); blur(); };
    const back = () => setHidden(document.hidden);
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'm' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target as HTMLElement)?.closest('input')) { e.preventDefault(); toggleRef.current(); return; }
      if ((e.target as HTMLElement)?.closest('button,input')) return;
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) { e.preventDefault(); aim.current = null; keys.current.add(key); }
      if ([' ', 'enter', 'arrowdown', 's'].includes(key)) { e.preventDefault(); if (!e.repeat) dropTap.current = true; }
      if (key === 'escape' || key === 'p') { e.preventDefault(); clear(); setManualPause(v => !v); }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', leave); window.addEventListener('pageshow', back);
    return () => {
      clear();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', back);
    };
  }, []);

  // Sound: no AudioContext until a user gesture; released on unmount.
  // iOS Safari only resumes audio from touchend/pointerup, so those gestures unlock (or resume) it too.
  useEffect(() => {
    const board = createDropSound();
    board.setEnabled(record.current.sound); sfx.current = board;
    const gesture = () => { if (record.current.sound) board.unlock(); };
    const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
    for (const type of GESTURES) window.addEventListener(type, gesture, true);
    return () => {
      for (const type of GESTURES) window.removeEventListener(type, gesture, true);
      board.dispose(); if (sfx.current === board) sfx.current = null;
    };
  }, []);
  useEffect(() => { sfx.current?.setSilenced(Boolean(paused) || hidden || manualPause); }, [paused, hidden, manualPause]);

  // Clear on every transition so input pressed while paused never fires on resume.
  useEffect(() => { keys.current.clear(); touch.current.clear(); dropTap.current = false; }, [active]);

  useEffect(() => {
    let frame = 0, last = 0, published = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function tick(now: number) {
      const dt = last ? Math.min(0.03, (now - last) / 1000) : 0; last = now;
      if (active && world.current.status === 'playing') {
        const held = (key: string) => keys.current.has(key) || [...touch.current.values()].includes(key);
        const move = Number(held('arrowright') || held('d')) - Number(held('arrowleft') || held('a'));
        const prev = world.current, next = step(prev, { move, aim: move ? null : aim.current, drop: dropTap.current }, dt);
        dropTap.current = false; world.current = next;
        const heard = cuesBetween(prev, next, combo.current); combo.current = heard.combo;
        for (const cue of heard.cues) sfx.current?.play(cue.id, { pitch: cue.pitch, gain: cue.gain });
        if (next.status === 'over') saveRecord(next);
      }
      const c = canvas.current?.getContext('2d');
      if (c) { c.setTransform(ratio, 0, 0, ratio, 0, 0); drawJar(c, world.current, sprite, reduced, active); }
      if (now - published > 90 || world.current.status !== 'playing') { setView(world.current); published = now; }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, sprite, client, ratio]);

  /**
   * Keep the record dirty until a write succeeds, so a rejected save (for example a host pause) is retried.
   * One write at a time: a change made during a write is written when it finishes.
   */
  function persist() {
    if (!client.saveLocal) return;
    unsaved.current = true;
    if (writing.current) return;
    const snapshot = record.current;
    writing.current = true;
    void client.saveLocal(serializeSave(snapshot))
      .then(() => {
        writing.current = false;
        if (record.current === snapshot) unsaved.current = false;
        else if (alive.current) persist();
      })
      .catch(() => { writing.current = false; if (alive.current) setSaveError(true); });
  }

  function saveRecord(s: State) {
    const prev = record.current;
    const nextBest = Math.max(prev.best, s.score), nextTier = Math.max(prev.bestTier, s.maxTier);
    if (prev.best > 0 && nextBest > prev.best) sfx.current?.play('best', { delay: 0.75 });
    if (nextBest !== prev.best || nextTier !== prev.bestTier) {
      record.current = { ...prev, best: nextBest, bestTier: nextTier }; setBest(nextBest); setBestTier(nextTier);
    } else if (!unsaved.current) return;
    persist();
  }

  /** The on/off setting lives in the same local save as the record. */
  function toggleSound() {
    if (!ready) return;
    const on = !record.current.sound;
    record.current = { ...record.current, sound: on }; setSound(on);
    sfx.current?.setEnabled(on);
    if (on && sfx.current?.unlock()) sfx.current.play('drop');
    persist();
  }
  toggleRef.current = toggleSound;

  const start = () => {
    if (paused || !ready) return;
    if (unsaved.current) persist();
    world.current = createGame(newSeed()); setView(world.current); combo.current = NO_COMBO;
    keys.current.clear(); touch.current.clear(); aim.current = null; dropTap.current = false;
    setStarted(true); setManualPause(false); setShareError(false); canvas.current?.focus();
  };
  const resume = () => { setManualPause(false); canvas.current?.focus(); };

  /** Map a pointer to jar coordinates, honouring object-fit: contain letterboxing. */
  const toWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
    return (e.clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale;
  };
  const pointer = {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => { if (!active) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); aim.current = toWorld(e); },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => { if (active && (e.pointerType === 'mouse' || e.buttons)) aim.current = toWorld(e); },
    onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => { if (!active) return; aim.current = toWorld(e); dropTap.current = true; },
  };
  /** Long-press must not open the browser menu or the iOS callout over the jar and controls. */
  const noMenu = (e: React.SyntheticEvent) => e.preventDefault();
  const hold = (action: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { if (!active) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); aim.current = null; touch.current.set(e.pointerId, action); },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => { touch.current.delete(e.pointerId); },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => { touch.current.delete(e.pointerId); },
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => { touch.current.delete(e.pointerId); },
  });

  const finished = view.status === 'over';
  const madeFriend = view.maxTier === TIERS;
  const share = () => {
    setShareError(false);
    void client.shareScore!(view.score, Math.max(1, view.maxTier), 'over', lang).catch(() => setShareError(true));
  };
  const heading = error ? 'OOPS' : finished ? (madeFriend ? 'FRIEND MADE!' : 'JAR FULL') : started ? 'PAUSED' : <>DROP. MERGE.<br />MEET YOUR FRIEND.</>;
  const body = error ? t('Friendを読み込めませんでした。もう一度お試しください。', 'Could not load your Friend. Please retry.') : (!started
    ? t('同じ玉どうしをくっつけて、大きく育てよう。11段目で、あなたのFriendが生まれます。', 'Match two of a kind to grow them. Reach the 11th orb and your own Friend appears.')
    : finished
      ? t(`スコア ${view.score}・最高「${tierName(view.maxTier)}」`, `Score ${view.score} · best orb: ${tierName(view.maxTier)}`)
      : t('準備ができたら、続きを。', 'Take a breath. The jar will wait.'));

  return <section className="jar-game" lang={lang} aria-label="Rare Drop" onContextMenu={noMenu}>
    <header>
      <div className="brand"><small>RARE FRIENDS / ARCADE 02</small><h1>RARE <span>DROP</span></h1></div>
      <div className="top-actions">
        <button className="sound-toggle" onClick={toggleSound} disabled={!ready} aria-pressed={sound} data-testid="sound"
          aria-label={t('サウンド オン/オフ', 'Sound on/off')} title={t('サウンド オン/オフ（M）', 'Sound on/off (M)')}><span aria-hidden="true">♪</span></button>
        <button onClick={() => { setLang(lang === 'ja' ? 'en' : 'ja'); if (started) canvas.current?.focus(); }}>{lang === 'ja' ? 'English' : '日本語'}</button>
        {started && !finished && <button disabled={paused} aria-label={t('一時停止', 'Pause')} onClick={() => setManualPause(true)}>Ⅱ</button>}
      </div>
    </header>
    <div className="game-layout">
      <div className="cabinet">
        <div className="hud">
          <div><small>SCORE</small><strong data-testid="score">{String(view.score).padStart(5, '0')}</strong></div>
          <div><small>{t('最高', 'TOP ORB')}</small><strong data-testid="top-tier">{view.maxTier ? `${view.maxTier}/11` : '—'}</strong></div>
          <div className="next"><small>NEXT</small><NextOrb tier={view.next} label={tierName(view.next)} ratio={ratio} /></div>
        </div>
        <div className={`screen${view.danger > 0 ? ' warn' : ''}`}>
          <canvas ref={canvas} width={WIDTH * ratio} height={HEIGHT * ratio} tabIndex={0} {...pointer}
            aria-label={t('タップした位置に落とす。矢印キーで移動、スペースで落とす', 'Tap where to drop. Arrow keys move, Space drops')} />
          {(!started || manualPause || finished || error) && <div className="overlay"><div>
            <span className="label">{finished ? 'RESULT' : 'A MERGE PUZZLE FOR YOUR FRIEND'}</span>
            <h2>{heading}</h2>
            {!started && !error && <ol className="ladder-row" aria-label={t('しんかの順番', 'Merge ladder')}>
              {TIER_INFO.map((info, i) => i + 1 < TIERS
                ? <li key={info.en} className={`chip t${i + 1}`} style={{ width: 10 + i * 2.2, height: 10 + i * 2.2 }} title={lang === 'ja' ? info.ja : info.en} />
                : <li key={info.en} className="chip t11 friend-chip">{sprite && <FriendPixels rows={sprite} fill="#142011" label={label} />}</li>)}
            </ol>}
            <p>{body}</p>
            {error
              ? <button className="launch" onClick={() => setAttempt(v => v + 1)}>{t('再読み込み', 'Retry')}</button>
              : <button className="launch" disabled={!ready || paused} onClick={started && !finished ? resume : start}>
                {!ready ? t('Friendを読込中…', 'Loading Friend…') : started && !finished ? t('再開する', 'Resume') : finished ? t('もう一度', 'Play again') : t('はじめる', 'Start')}
              </button>}
            {finished && client.shareScore && <button className="share-score" disabled={paused} onClick={share}>{t('スコアをXでシェア', 'Share score on X')}</button>}
            {shareError && <p role="alert">{t('シェアを開けませんでした。もう一度お試しください。', 'Could not open sharing. Please retry.')}</p>}
            <p className="keys">{t('タップ / クリック：その位置に落とす　← →：移動　SPACE：落とす　M：サウンド', 'Tap / click to drop there · ← → move · SPACE drop · M sound')}</p>
          </div></div>}
        </div>
        <div className="touch-controls">
          <button {...hold('arrowleft')} disabled={!active || finished} aria-label={t('左へ', 'Move left')}>◀</button>
          <button className="drop" disabled={!active || finished} onClick={() => { dropTap.current = true; }} aria-label={t('落とす', 'Drop')}>{t('落とす', 'DROP')} ↓</button>
          <button {...hold('arrowright')} disabled={!active || finished} aria-label={t('右へ', 'Move right')}>▶</button>
        </div>
      </div>
      <aside className="brief">
        <div className="pilot"><span className="label">{t('つくる人', 'YOUR FRIEND')}</span>
          {sprite && <FriendPixels rows={sprite} fill="#d3ff64" label={label} size={72} className="mini-friend" />}
          <b>{label.toUpperCase()}</b>
          <p>{t('11段目の玉は、あなたのNFTそのもの。', 'The 11th orb is your own NFT.')}</p>
        </div>
        <div><span className="label">{t('しんか', 'MERGE LADDER')}</span>
          <ol className="ladder">{TIER_INFO.map((info, i) => <li key={info.en} className={i + 1 <= Math.max(view.maxTier, bestTier) ? 'seen' : ''}>
            <span className={`chip t${i + 1}`} />{lang === 'ja' ? info.ja : info.en}</li>)}</ol>
        </div>
        <div className="record"><span className="label">PERSONAL BEST</span><strong>{String(best).padStart(5, '0')}</strong>
          <span className="note">{t(`最高「${tierName(bestTier)}」・このブラウザー・このFriendの記録`, `Top orb: ${tierName(bestTier)} · this browser · this Friend`)}</span></div>
      </aside>
    </div>
    <footer><span>{t('無料のアーケード · スコアはRFではありません', 'FREE ARCADE · SCORE IS NOT RF')}</span><span>{label.toUpperCase()} · BEST {best}</span></footer>
    {saveError && <p className="error" role="alert">{t('記録を保存できませんでした。このブラウザーの保存設定を確認してください。', 'Could not save your record. Check this browser’s storage settings.')}</p>}
  </section>;
}
