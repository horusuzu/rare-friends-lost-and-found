import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import { createFriendReader, createGenesisReader, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { newGame, onStairs, press, saveResult, type Button } from './game.ts';
import { loadGame, serialize } from './save.ts';
import { BASE_VIEW, HUD_H, TILE, drawGame, viewFor, type View } from './render.ts';
import { drawFriend, type FriendRows } from './art.ts';
import { createBeeper, type Beeper } from './sound.ts';
import { UNIDENTIFIED, ITEMS, type Dir } from './data.ts';
import type { GameState } from './run.ts';
import { GOLD_NOTE, Hud, Panels, type Lang } from './panels.tsx';
import { BUTTON_KEYS, CHORD_KEYS, CHORD_WINDOW, FIRST_REPEAT, NUMPAD, REPEAT, SOLO_KEYS, combine, roaming, shouldStop, type Move } from './controls.ts';
import './style.css';

const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
const PAD: readonly (readonly [Move, string, string, string])[] = [
  ['nw', '◤', '左上', 'Up-left'], ['n', '▲', '上', 'Up'], ['ne', '◥', '右上', 'Up-right'],
  ['w', '◀', '左', 'Left'], ['wait', '・', '足ぶみ', 'Wait'], ['e', '▶', '右', 'Right'],
  ['sw', '◣', '左下', 'Down-left'], ['s', '▼', '下', 'Down'], ['se', '◢', '右下', 'Down-right'],
];
interface Hold { chord: Dir[]; solo: Move | null; fireAt: number; fired: boolean }
const idleHold = (): Hold => ({ chord: [], solo: null, fireAt: 0, fired: false });
const nowSec = () => performance.now() / 1000;

export default function RareDelve(props: GameComponentProps) {
  return <Delve key={`${props.collection ?? 'generations'}:${props.friendId}`} {...props} />;
}

function Portrait({ rows, label }: { rows: FriendRows; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current?.getContext('2d'); if (c) { c.clearRect(0, 0, 18, 18); drawFriend(c, rows, 1, 1, 1); } }, [rows]);
  return <canvas ref={ref} className="portrait" width={18} height={18} role="img" aria-label={label} />;
}

function Delve({ friendId, collection = 'generations', client, paused }: GameComponentProps) {
  const token = `${collection}:${friendId}`;
  const label = `${collection === 'genesis' ? 'Genesis' : 'Friend'} #${String(friendId)}`;
  const [lang, setLang] = useState<Lang>('ja');
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<GameState | null>(null), [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<GameState | null>(null);
  const [manualPause, setManualPause] = useState(false), [sound, setSound] = useState(true);
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saves, setSaves] = useState(0), [suspending, setSuspending] = useState(false);
  /** Tiles on screen: the reference 15 × 11, or on a phone's portrait stage 13 columns and enough rows to fill it. */
  const [tiles, setTiles] = useState<View>(BASE_VIEW);
  const stage = useRef<HTMLDivElement>(null);
  const game = useRef<GameState | null>(null), canvas = useRef<HTMLCanvasElement>(null);
  const hold = useRef<Hold>(idleHold());
  const beeper = useRef<Beeper | null>(null), soundOn = useRef(true), handledSave = useRef(0), hurtAt = useRef(-10), reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const tt = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const started = view !== null;
  const active = started && ready && !paused && !manualPause && !suspending;
  const activeRef = useRef(active); activeRef.current = active;

  useEffect(() => {
    let current = true;
    setReady(false); setError(false);
    void (async () => {
      await client.read();
      const reader = collection === 'genesis' ? createGenesisReader() : createFriendReader();
      const [art, raw] = await Promise.all([
        reader.read(friendId),
        client.loadLocal ? client.loadLocal().catch(() => { if (current) setLoadError(true); return null; }) : Promise.resolve(null),
      ]);
      if (!current) return;
      setSprites(art);
      try { setSaved(loadGame(raw, token, newSeed())); } catch { setLoadError(true); }
      setReady(true);
    })().catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [client, friendId, collection, attempt, token]);

  /** Apply a new state: play its cue, flash on damage, and publish to React. */
  function commit(next: GameState) {
    const prev = game.current;
    game.current = next;
    if (prev && next.sfx.n !== prev.sfx.n && soundOn.current) beeper.current?.play(next.sfx.id);
    if (prev && next.run && prev.run && next.hero.hp < prev.hero.hp) hurtAt.current = nowSec();
    setView(next);
  }
  function ensureAudio() { if (!beeper.current) beeper.current = createBeeper(); }
  function pressButton(button: Button): GameState | null {
    const s = game.current;
    if (!activeRef.current || !s) return null;
    ensureAudio();
    const next = press(s, button);
    if (next !== s) commit(next);
    return next;
  }
  /** One held-walk step; the walk stops when anything worth noticing happens. */
  function step(move: Move) {
    const prev = game.current;
    const next = pressButton(move);
    if (!prev || !next || shouldStop(prev, next)) hold.current = idleHold();
  }
  /** Tap a list entry: move the cursor there with ↓ presses, then press A. */
  function choose(index: number, current: number, count: number) {
    if (!activeRef.current || !game.current) return;
    ensureAudio();
    let s = game.current;
    const steps = count > 0 ? (index - current + count) % count : 0;
    for (let i = 0; i < steps; i++) s = press(s, 's');
    commit(press(s, 'a'));
  }

  /** Begin holding a direction (keyboard or pad). Outside free walking it is one single press. */
  function startMove(move: Move, chord: boolean) {
    if (!activeRef.current) return;
    if (!roaming(game.current)) { pressButton(move); return; }
    const h = hold.current;
    if (chord && move !== 'wait') {
      const had = h.solo ?? combine(h.chord);
      hold.current = { ...h, chord: [...h.chord.filter(d => d !== move), move], ...(had ? {} : { fireAt: nowSec() + CHORD_WINDOW, fired: false }) };
      return;
    }
    hold.current = { chord: h.chord, solo: move, fireAt: nowSec() + FIRST_REPEAT, fired: true };
    step(move);
  }
  function endChord(dir: Dir) {
    const h = hold.current;
    if (!h.chord.includes(dir)) return;
    const pending = !h.fired && !h.solo ? combine(h.chord) : null;
    const chord = h.chord.filter(d => d !== dir);
    hold.current = chord.length || h.solo ? { ...h, chord } : idleHold();
    if (pending && activeRef.current) step(pending);
  }
  function endSolo(move: Move) { if (hold.current.solo === move) hold.current = hold.current.chord.length ? { ...hold.current, solo: null } : idleHold(); }

  useEffect(() => {
    const release = () => { hold.current = idleHold(); };
    const blur = () => { release(); if (game.current) setManualPause(true); };
    const visibility = () => { if (document.hidden) blur(); };
    // iOS only starts audio from a touchend / pointerup / click / key press: create and resume the context there.
    const unlock = () => { ensureAudio(); beeper.current?.wake(); };
    const unlockOn = ['touchend', 'pointerup', 'click', 'keydown'] as const;
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const onButton = (e.target as HTMLElement)?.closest?.('button');
      if (onButton && (key === 'enter' || key === ' ')) return;
      if (key === 'p' || key === 'escape') { e.preventDefault(); release(); if (game.current) setManualPause(v => !v); return; }
      const pad = NUMPAD[e.code], chord = CHORD_KEYS[key], solo = SOLO_KEYS[key], button = BUTTON_KEYS[key];
      if (pad || chord || solo || button) e.preventDefault();
      if (e.repeat && (pad || chord || solo)) return;
      if (pad) startMove(pad, false);
      else if (chord) startMove(chord, true);
      else if (solo) startMove(solo, false);
      else if (button && !e.repeat) pressButton(button);
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase(), pad = NUMPAD[e.code], chord = CHORD_KEYS[key], solo = SOLO_KEYS[key];
      if (pad) endSolo(pad); else if (chord) endChord(chord); else if (solo) endSolo(solo);
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    for (const type of unlockOn) window.addEventListener(type, unlock, { passive: true });
    window.addEventListener('blur', blur); window.addEventListener('pagehide', blur); document.addEventListener('visibilitychange', visibility);
    return () => {
      release();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      for (const type of unlockOn) window.removeEventListener(type, unlock);
      window.removeEventListener('blur', blur); window.removeEventListener('pagehide', blur); document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => { if (!active) hold.current = idleHold(); }, [active]);
  // Size the camera to the stage box (phones in portrait get bigger tiles and more rows instead of empty space).
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect(), next = viewFor(width, height);
      setTiles(cur => cur.cols === next.cols && cur.rows === next.rows ? cur : next);
    };
    const observer = new ResizeObserver(fit); observer.observe(el); fit();
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => { beeper.current?.close(); beeper.current = null; }, []);

  useEffect(() => {
    let frame = 0;
    function loop() {
      const now = nowSec(), h = hold.current, move = h.solo ?? combine(h.chord);
      if (move && activeRef.current && roaming(game.current) && now >= h.fireAt) {
        hold.current = { ...h, fired: true, fireAt: now + (h.fired ? REPEAT : FIRST_REPEAT) };
        step(move);
      }
      const s = game.current, c = canvas.current?.getContext('2d');
      if (s && c) drawGame(c, s, sprites, { now, reduced: reducedRef.current, hurtAt: hurtAt.current });
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [sprites]);

  /** Write a save; failures are shown but never block play. */
  function persist(state: GameState): Promise<boolean> {
    if (!client.saveLocal) return Promise.resolve(false);
    return client.saveLocal(serialize(state)).then(() => { setSaves(n => n + 1); return true; }, () => false);
  }
  // Persist whenever the engine asks (dive start, stairs, every 50 turns, shop and chest changes, the end of a dive).
  useEffect(() => {
    if (!view || view.saveTick === 0 || view.saveTick === handledSave.current) return;
    handledSave.current = view.saveTick;
    void persist(view).then(ok => { if (game.current && game.current.saveError === ok) commit(saveResult(game.current, ok)); });
  }, [view?.saveTick]);

  /** Suspend: save the dive exactly as it stands and return to the title, where Continue resumes it. */
  async function suspend() {
    const s = game.current;
    if (!s || suspending) return;
    setSuspending(true);
    const ok = await persist(s);
    setSuspending(false);
    if (!ok) { commit(saveResult(s, false)); return; }
    try { setSaved(loadGame(serialize(s), token, newSeed())); } catch { setSaved(s); }
    game.current = null; hold.current = idleHold(); setView(null); setManualPause(false);
  }

  function begin(state: GameState) {
    ensureAudio();
    game.current = state; handledSave.current = 0; hurtAt.current = -10; hold.current = idleHold();
    setView(state); setManualPause(false);
  }
  const toggleSound = () => { soundOn.current = !soundOn.current; setSound(soundOn.current); };

  const padPress = (move: Move) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!activeRef.current) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      startMove(move, false);
    },
    onPointerUp: () => endSolo(move), onPointerCancel: () => endSolo(move), onLostPointerCapture: () => endSolo(move),
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => { if (e.detail === 0) pressButton(move); },
  });
  const tap = (button: Button) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => { e.preventDefault(); pressButton(button); },
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => { if (e.detail === 0) pressButton(button); },
  });

  const friendRows = sprites?.clips.idle.down[0]?.rows ?? null;
  const s = view, run = s?.run ?? null;
  const unknown = s && run ? s.hero.bag.filter(it => UNIDENTIFIED.includes(ITEMS[it.k].kind) && !run.known.includes(it.k)).length : 0;
  const result = s?.scene.k === 'summary' ? s.scene.result : '';
  const canvasW = tiles.cols * TILE, canvasH = tiles.rows * TILE;
  return <section className={`delve${reduced ? ' calm' : ''}`} lang={lang} aria-label="Rare Delve" onContextMenu={e => e.preventDefault()}>
    <header>
      <div className="brand"><h1>RARE <span>DELVE</span></h1><small>{tt('きみの Friendが もぐる ダンジョン', 'Your Friend goes delving')}</small></div>
      <div className="status" aria-label={tt('じょうたい', 'Status')}>
        {friendRows && <Portrait rows={friendRows} label={label} />}<b>{label}</b>
      </div>
      <div className="top-actions">
        <button onClick={toggleSound} aria-pressed={sound} aria-label={tt('効果音', 'Sound')} data-testid="mute">{sound ? '♪' : '×'}</button>
        <button onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>{lang === 'ja' ? 'English' : '日本語'}</button>
        {started && <button disabled={paused} aria-label={tt('一時停止', 'Pause')} onClick={() => { hold.current = idleHold(); setManualPause(true); }}>Ⅱ</button>}
      </div>
    </header>
    <div className="stage" ref={stage}>
      <div className="screen" data-testid="screen" data-scene={s?.scene.k ?? 'title'} data-floor={run?.floor ?? 0} data-x={s?.hero.x ?? ''} data-y={s?.hero.y ?? ''}
        data-seed={run?.seed ?? ''} data-turn={run?.turn ?? 0} data-hp={s?.hero.hp ?? ''} data-maxhp={s?.hero.maxHp ?? ''} data-level={s?.hero.level ?? ''}
        data-full={s?.hero.full ?? ''} data-gold={s?.hero.gold ?? ''} data-purse={s?.meta.purse ?? ''} data-bag={s?.hero.bag.length ?? 0} data-unknown={unknown}
        data-showmap={String(!!s?.showMap)} data-turnmode={String(!!s?.turnMode)} data-onstairs={String(!!s && onStairs(s))} data-result={result}
        data-paused={String(!active)} data-saves={saves} data-save-error={String(!!s?.saveError)} data-lang={lang} data-reduced={String(reduced)}
        data-cols={tiles.cols} data-rows={tiles.rows}
        style={{ ['--hud' as string]: `${HUD_H / canvasW * 100}cqw`, ['--cols' as string]: tiles.cols, ['--rows' as string]: tiles.rows }}>
        <canvas ref={canvas} width={canvasW} height={canvasH} aria-label={tt('ゲーム画面', 'Game screen')} role="img" />
        {s && s.scene.k !== 'summary' && <Hud s={s} lang={lang} />}
        {s && <Panels s={s} lang={lang} active={active} choose={choose} press={b => { pressButton(b); }} />}
        {(!started || error) && <div className="title">
          <h2>RARE<br /><span>DELVE</span></h2>
          {friendRows && !error && <p className="starring"><Portrait rows={friendRows} label={label} />{tt(`主人公: ${label}`, `Starring ${label}`)}</p>}
          {error ? <><p role="alert">{tt('Friendを よみこめませんでした。', 'Could not load your Friend.')}</p><button onClick={() => setAttempt(v => v + 1)}>{tt('もう一度', 'Retry')}</button></>
            : !ready ? <p>{tt('Friendを よみこみ中…', 'Loading Friend…')}</p>
              : <div className="choices">
                {saved && <button onClick={() => begin(saved)} disabled={paused}>{tt('つづきから', 'Continue')}{saved.run ? tt(`（${saved.run.floor}階）`, ` (F${saved.run.floor})`) : ''}</button>}
                <button onClick={() => begin(newGame(token, newSeed()))} disabled={paused}>{tt('はじめから', 'New game')}</button>
              </div>}
          <p className="fine">{tt('オリジナルの ダンジョン探索RPG。', 'An original dungeon-delving roguelike. ')}<span>{GOLD_NOTE[lang === 'ja' ? 0 : 1]}</span></p>
        </div>}
        {started && manualPause && <div className="paused">
          <h2>PAUSED</h2><p>{tt('P / Esc で再開', 'Press P / Esc to resume')}</p>
          <div className="choices">
            <button onClick={() => setManualPause(false)} disabled={paused || suspending}>{tt('再開する', 'Resume')}</button>
            <button onClick={() => { void suspend(); }} disabled={paused || suspending} data-testid="suspend">{tt('中断して セーブ', 'Suspend & save')}</button>
            <button onClick={() => setReduced(v => !v)} aria-pressed={reduced} data-testid="motion">{reduced ? tt('動き: ひかえめ', 'Motion: reduced') : tt('動き: ふつう', 'Motion: full')}</button>
          </div>
        </div>}
      </div>
    </div>
    <div className="pad" aria-label={tt('コントローラー', 'Controller')}>
      <div className="dpad" role="group" aria-label={tt('8方向', '8 directions')}>
        {PAD.map(([move, glyph, ja, en]) => <button key={move} data-testid={`pad-${move}`} aria-label={tt(ja, en)} className={move === 'wait' ? 'wait' : 'dir'} {...padPress(move)}>{glyph}</button>)}
      </div>
      <div className="acts">
        <div className="ab">
          <button className="b" data-testid="pad-b" aria-label={tt('B もどる', 'B back')} {...tap('b')}>B</button>
          <button className="a" data-testid="pad-a" aria-label={tt('A こうげき・けってい', 'A attack / OK')} {...tap('a')}>A</button>
        </div>
        <div className="pills">
          <button data-testid="pad-menu" {...tap('menu')}>{tt('道具', 'Bag')}</button>
          <button data-testid="pad-map" {...tap('map')}>{tt('地図', 'Map')}</button>
          <button data-testid="pad-turn" aria-pressed={!!s?.turnMode} {...tap('turn')}>{tt('向き', 'Turn')}</button>
        </div>
      </div>
    </div>
    <footer>
      <span>{tt('移動: 十字/WASD/QEZC/テンキー · A: Enter/F · B: X · 道具: I · 地図: M · 向き: T · 足ぶみ: . / 5 · 一時停止: P',
        'Move: pad/WASD/QEZC/numpad · A: Enter/F · B: X · Bag: I · Map: M · Turn: T · Wait: . / 5 · Pause: P')}</span>
      <span>{tt('ゴールドは むりょう・シミュレーション · RFでは ありません', 'GOLD IS FREE & SIMULATED · NOT RF')}</span>
    </footer>
    {(s?.saveError || loadError) && <p className="error" role="alert">{loadError && !s?.saveError
      ? tt('セーブデータを よめませんでした。はじめから あそべます。', 'Could not read your save. You can start a new game.')
      : tt('セーブできませんでした。このまま あそべます。', 'Could not save. You can keep playing.')}</p>}
  </section>;
}
