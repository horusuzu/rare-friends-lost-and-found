import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import { createFriendReader, createGenesisReader, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { BAG, BATTLE_MENU, MAIN_MENU, SHOP, battleView, newGame, press, saveResult, tick, type Button, type GameState, type Scene } from './game.ts';
import { loadGame, serialize } from './save.ts';
import { drawGame } from './render.ts';
import { SCREEN_H, SCREEN_W, drawFriend, paintIcon, type FriendRows } from './art.ts';
import { createBeeper, type Beeper } from './sound.ts';
import { ITEMS, MOVES, TYPE_NAMES, type Text } from './data.ts';
import { MAPS, type Dir } from './world.ts';
import { isFainted, monText, speciesOf, statsOf, type Mon } from './mon.ts';
import './style.css';

type Lang = 'ja' | 'en';
const DIR_KEYS: Readonly<Record<string, Dir>> = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
const BUTTON_KEYS: Readonly<Record<string, Button>> = { z: 'a', enter: 'a', x: 'b', backspace: 'b', m: 'menu', ' ': 'menu' };
const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

export default function RareQuest(props: GameComponentProps) {
  return <Quest key={`${props.collection ?? 'generations'}:${props.friendId}`} {...props} />;
}

function HpBar({ hp, max }: { hp: number; max: number }) {
  const ratio = max > 0 ? hp / max : 0;
  return <span className={`hp${ratio <= 0.2 ? ' low' : ratio <= 0.5 ? ' mid' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} aria-label="HP">
    <i style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} /></span>;
}
function Icon({ species, friend }: { species: string; friend: FriendRows | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) paintIcon(ref.current, species, friend); }, [species, friend]);
  return <canvas ref={ref} className="icon" width={18} height={18} aria-hidden="true" />;
}
function Portrait({ rows, label }: { rows: FriendRows; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current?.getContext('2d'); if (c) { c.clearRect(0, 0, 18, 18); drawFriend(c, rows, 1, 1, 1); } }, [rows]);
  return <canvas ref={ref} className="portrait" width={18} height={18} role="img" aria-label={label} />;
}

function Quest({ friendId, collection = 'generations', client, paused }: GameComponentProps) {
  const token = `${collection}:${friendId}`;
  const label = `${collection === 'genesis' ? 'Genesis' : 'Friend'} #${String(friendId)}`;
  const [lang, setLang] = useState<Lang>('ja');
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<GameState | null>(null), [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<GameState | null>(null);
  const [manualPause, setManualPause] = useState(false), [sound, setSound] = useState(true);
  const game = useRef<GameState | null>(null), canvas = useRef<HTMLCanvasElement>(null);
  const keyDirs = useRef<Dir[]>([]), padDir = useRef<Dir | null>(null);
  const beeper = useRef<Beeper | null>(null), soundOn = useRef(true), lastPublish = useRef(0), handledSave = useRef(0);
  const marks = useRef({ battleAt: 0, lineAt: 0, key: '', wasBattle: false });
  const t = (text: Text) => text[lang === 'ja' ? 0 : 1];
  const tt = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const started = view !== null;
  const active = started && ready && !paused && !manualPause;
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

  /** Apply a new state: play its cue, and publish to React (immediately, or throttled while walking). */
  function commit(next: GameState, immediate = true) {
    const prev = game.current;
    game.current = next;
    if (prev && next.sfx.n !== prev.sfx.n && soundOn.current) beeper.current?.play(next.sfx.id);
    const now = performance.now();
    if (immediate || !prev || next.scene !== prev.scene || next.map !== prev.map || now - lastPublish.current > 120) { lastPublish.current = now; setView(next); }
  }
  function ensureAudio() { if (!beeper.current) beeper.current = createBeeper(); }
  function pressButton(button: Button) {
    if (!activeRef.current || !game.current) return;
    ensureAudio();
    commit(press(game.current, button));
  }
  /** Tap a list entry: move the cursor there, then press A. */
  function choose(index: number, current: number, count: number, horizontalGrid = false) {
    if (!activeRef.current || !game.current) return;
    ensureAudio();
    let s = game.current;
    if (horizontalGrid) {
      s = press(s, index % 2 ? 'right' : 'left'); s = press(s, index >= 2 ? 'down' : 'up');
    } else {
      const steps = (index - current + count) % count;
      for (let i = 0; i < steps; i++) s = press(s, 'down');
    }
    commit(press(s, 'a'));
  }

  useEffect(() => {
    const release = () => { keyDirs.current = []; padDir.current = null; };
    const blur = () => { release(); if (game.current) setManualPause(true); };
    const visibility = () => { if (document.hidden) blur(); };
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const onButton = (e.target as HTMLElement)?.closest?.('button');
      if (onButton && (key === 'enter' || key === ' ')) return;
      if (key === 'p' || key === 'escape') { e.preventDefault(); release(); if (game.current) setManualPause(v => !v); return; }
      const dir = DIR_KEYS[key];
      if (dir) {
        e.preventDefault();
        if (!keyDirs.current.includes(dir)) keyDirs.current = [...keyDirs.current, dir];
        if (game.current?.scene.k !== 'world') pressButton(dir);
        return;
      }
      const button = BUTTON_KEYS[key];
      if (button) { e.preventDefault(); if (!e.repeat) pressButton(button); }
    };
    const up = (e: KeyboardEvent) => { const dir = DIR_KEYS[e.key.toLowerCase()]; if (dir) keyDirs.current = keyDirs.current.filter(d => d !== dir); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => {
      release();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => { if (!active) { keyDirs.current = []; padDir.current = null; } }, [active]);
  useEffect(() => () => { beeper.current?.close(); beeper.current = null; }, []);

  useEffect(() => {
    let frame = 0, last = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function loop(nowMs: number) {
      const now = nowMs / 1000, dt = last ? Math.min(0.05, now - last) : 0; last = now;
      const s0 = game.current;
      if (s0 && activeRef.current && dt > 0) {
        const dir = padDir.current ?? keyDirs.current.at(-1) ?? null;
        const next = tick(s0, dir, dt);
        if (next !== s0) commit(next, false);
      }
      const s = game.current, c = canvas.current?.getContext('2d');
      if (s && c) {
        const sc = s.scene, m = marks.current, isBattle = sc.k === 'battle';
        const key = sc.k === 'battle' ? `${sc.ui}:${sc.li}:${sc.lines.length}:${sc.b.foe}` : sc.k;
        marks.current = { battleAt: isBattle && !m.wasBattle ? now : m.battleAt, lineAt: key !== m.key ? now : m.lineAt, key, wasBattle: isBattle };
        drawGame(c, s, sprites, { now, reduced, battleAt: marks.current.battleAt, lineAt: marks.current.lineAt });
      }
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [sprites]);

  // Persist whenever the engine asks (manual save, healing, badge). Failures never block play.
  useEffect(() => {
    if (!view || view.saveTick === 0 || view.saveTick === handledSave.current) return;
    handledSave.current = view.saveTick;
    const raw = serialize(view);
    const done = (ok: boolean) => { if (game.current) commit(saveResult(game.current, ok)); };
    if (!client.saveLocal) { done(false); return; }
    client.saveLocal(raw).then(() => done(true), () => done(false));
  }, [view?.saveTick]);

  function begin(state: GameState) {
    ensureAudio();
    game.current = state; handledSave.current = 0; marks.current = { battleAt: 0, lineAt: 0, key: '', wasBattle: false };
    setView(state); setManualPause(false);
  }
  const toggleSound = () => { soundOn.current = !soundOn.current; setSound(soundOn.current); };

  const padPress = (dir: Dir) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!activeRef.current) return;
      e.currentTarget.setPointerCapture?.(e.pointerId); padDir.current = dir;
      if (game.current?.scene.k !== 'world') pressButton(dir);
    },
    onPointerUp: () => { if (padDir.current === dir) padDir.current = null; },
    onPointerCancel: () => { if (padDir.current === dir) padDir.current = null; },
    onLostPointerCapture: () => { if (padDir.current === dir) padDir.current = null; },
  });
  const tap = (button: Button) => ({ onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => { e.preventDefault(); pressButton(button); } });

  const friendRows = sprites?.clips.idle.down[0]?.rows ?? null;
  const s = view;
  const scene: Scene | null = s?.scene ?? null;
  const battle = s ? battleView(s) : null;
  const partyRow = (mon: Mon, i: number, current: number, onPick: () => void, extra?: string) => {
    const max = statsOf(mon).hp;
    return <li key={i}><button className={i === current ? 'cur' : ''} aria-current={i === current} onClick={onPick} disabled={!active}>
      <Icon species={mon.species} friend={friendRows} /><span className="nm">{t(monText(mon))}{extra ? <em>{extra}</em> : null}</span>
      <span className="lv">Lv{mon.level}</span><HpBar hp={mon.hp} max={max} /><span className="num">{isFainted(mon) ? tt('ダウン', 'DOWN') : `${mon.hp}/${max}`}</span>
    </button></li>;
  };
  const textBox = (text: string, more: boolean) => <button className="textbox" onClick={() => pressButton('a')} disabled={!active} data-testid="textbox">
    <span role="status">{text}</span>{more && <i aria-hidden="true">▼</i>}</button>;

  function renderOverlay() {
    if (!s || !scene) return null;
    switch (scene.k) {
      case 'world': return <p key={s.map} className="banner" aria-live="polite">{t(MAPS[s.map].name)}</p>;
      case 'talk': return textBox(t(scene.lines[scene.i]), scene.i + 1 < scene.lines.length || !!scene.then);
      case 'menu': return <nav className="box menu" aria-label={tt('メニュー', 'Menu')}><ul>{MAIN_MENU.map((m, i) =>
        <li key={i}><button className={i === scene.cur ? 'cur' : ''} aria-current={i === scene.cur} disabled={!active} onClick={() => choose(i, scene.cur, MAIN_MENU.length)}>{t(m)}</button></li>)}</ul></nav>;
      case 'party': return <section className="box full" aria-label={tt('なかま', 'Party')}>
        <h2>{scene.mode === 'herb' ? tt('だれに つかう？', 'Use on whom?') : tt('なかま（Aで せんとうへ）', 'Party (A: make lead)')}</h2>
        <ul className="party">{s.party.map((m, i) => partyRow(m, i, scene.cur, () => choose(i, scene.cur, s.party.length)))}</ul></section>;
      case 'bag': return <section className="box full" aria-label={tt('どうぐ', 'Items')}><h2>{tt('どうぐ', 'ITEMS')}</h2><ul>{BAG.map((id, i) =>
        <li key={id}><button className={i === scene.cur ? 'cur' : ''} aria-current={i === scene.cur} disabled={!active} onClick={() => choose(i, scene.cur, BAG.length)}>
          <span className="nm">{t(ITEMS[id].name)}</span><span className="num">×{s.items[id]}</span></button></li>)}</ul>
        <p className="note">{t(ITEMS[BAG[scene.cur]].note)}</p></section>;
      case 'shop': return <section className="box full" aria-label={tt('おみせ', 'Shop')}><h2>{tt('おみせ', 'SHOP')} <small>{tt('どんぐり', 'Acorns')} {s.coins}</small></h2><ul>{SHOP.map((id, i) =>
        <li key={id}><button className={i === scene.cur ? 'cur' : ''} aria-current={i === scene.cur} disabled={!active} onClick={() => choose(i, scene.cur, SHOP.length)}>
          {id === 'leave' ? <span className="nm">{tt('やめる', 'LEAVE')}</span> : <><span className="nm">{t(ITEMS[id].name)} <em>×{s.items[id]}</em></span><span className="num">{ITEMS[id].price}</span></>}</button></li>)}</ul>
        <p className="note">{tt('どんぐりは ゲーム内の シミュレーション通貨です（RFでは ありません）。', 'Acorns are a simulated in-game currency (not RF).')}</p></section>;
      case 'battle': {
        if (!battle) return null;
        const me = s.party[scene.b.active];
        return <>
          <div className="hud foe" data-testid="foe-hud"><b>{t(battle.foe.label)}</b><span className="lv">Lv{battle.foe.level}</span><HpBar hp={battle.foe.hp} max={battle.foe.max} />
            {battle.foeCount > 1 && <span className="pips" aria-label={tt(`のこり ${battle.foeCount - battle.foeIndex}`, `${battle.foeCount - battle.foeIndex} left`)}>{Array.from({ length: battle.foeCount }, (_, i) => <i key={i} className={i < battle.foeIndex ? 'down' : ''} />)}</span>}</div>
          <div className="hud me" data-testid="me-hud"><b>{t(battle.me.label)}</b><span className="lv">Lv{battle.me.level}</span><HpBar hp={battle.me.hp} max={battle.me.max} /><span className="num" data-testid="my-hp">{battle.me.hp}/{battle.me.max}</span></div>
          {scene.ui === 'lines' && scene.lines[scene.li] && textBox(t(scene.lines[scene.li].text), true)}
          {scene.ui === 'main' && <div className="command"><p>{tt('つぎの こうどうは？', 'Your move:')}</p><div className="grid" role="group" aria-label={tt('コマンド', 'Commands')}>{BATTLE_MENU.map((m, i) =>
            <button key={i} className={i === scene.cur ? 'cur' : ''} aria-current={i === scene.cur} disabled={!active} onClick={() => choose(i, scene.cur, 4, true)}>{t(m)}</button>)}</div></div>}
          {scene.ui === 'fight' && <div className="command moves"><ul>{me.moves.map((m, i) =>
            <li key={m.id}><button className={i === scene.cur ? 'cur' : ''} aria-current={i === scene.cur} disabled={!active} onClick={() => choose(i, scene.cur, me.moves.length)}>
              <span className="nm">{t(MOVES[m.id].name)}</span><span className="num">{t(TYPE_NAMES[MOVES[m.id].type])} {m.pp}/{MOVES[m.id].pp}</span></button></li>)}</ul></div>}
          {scene.ui === 'bag' && <div className="command moves"><ul>{BAG.map((id, i) =>
            <li key={id}><button className={i === scene.cur ? 'cur' : ''} aria-current={i === scene.cur} disabled={!active} onClick={() => choose(i, scene.cur, BAG.length)}>
              <span className="nm">{t(ITEMS[id].name)}</span><span className="num">×{s.items[id]}</span></button></li>)}</ul></div>}
          {scene.ui === 'party' && <section className="box full" aria-label={tt('なかま', 'Party')}><h2>{scene.forced ? tt('つぎに だす なかまは？', 'Who goes out next?') : tt('だれと こうたい？', 'Switch to whom?')}</h2>
            <ul className="party">{s.party.map((m, i) => partyRow(m, i, scene.cur, () => choose(i, scene.cur, s.party.length), i === scene.b.active ? tt('せんとう', 'OUT') : undefined))}</ul></section>}
        </>;
      }
    }
  }

  const battleUi = scene?.k === 'battle' ? scene.ui : '';
  const partyTypes = s ? s.party.map(m => speciesOf(m).type) : [];
  return <section className="quest" lang={lang} aria-label="Rare Quest">
    <header>
      <div className="brand"><h1>RARE <span>QUEST</span></h1><small>{tt('あいぼうは きみの Friend', 'Starring your own Friend')}</small></div>
      <div className="status" aria-label={tt('じょうたい', 'Status')}>
        {friendRows && <Portrait rows={friendRows} label={label} />}<b>{label}</b>
        {s && <><span data-testid="acorns">{tt('どんぐり', 'Acorns')} {s.coins}</span>{s.flags.badge && <span className="badge" title={tt('ヒスイバッジ', 'Jade Badge')}>◆</span>}</>}
      </div>
      <div className="top-actions">
        <button onClick={toggleSound} aria-pressed={sound} aria-label={tt('効果音', 'Sound')}>{sound ? '♪' : '×'}</button>
        <button onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}>{lang === 'ja' ? 'English' : '日本語'}</button>
        {started && <button disabled={paused} aria-label={tt('一時停止', 'Pause')} onClick={() => setManualPause(true)}>Ⅱ</button>}
      </div>
    </header>
    <div className="stage">
      <div className="screen" data-testid="screen" data-scene={scene?.k ?? 'title'} data-ui={battleUi} data-map={s?.map ?? ''} data-x={s?.x ?? ''} data-y={s?.y ?? ''}
        data-last={s?.last ?? ''} data-paused={String(!active)} data-party={s?.party.length ?? 0} data-types={partyTypes.join(',')}>
        <canvas ref={canvas} width={SCREEN_W} height={SCREEN_H} aria-label={tt('ゲーム画面', 'Game screen')} role="img" />
        {started && renderOverlay()}
        {(!started || error) && <div className="title">
          <h2>RARE<br /><span>QUEST</span></h2>
          {friendRows && !error && <p className="starring"><Portrait rows={friendRows} label={label} />{tt(`主人公: ${label}`, `Starring ${label}`)}</p>}
          {error ? <><p role="alert">{tt('Friendを よみこめませんでした。', 'Could not load your Friend.')}</p><button onClick={() => setAttempt(v => v + 1)}>{tt('もう一度', 'Retry')}</button></>
            : !ready ? <p>{tt('Friendを よみこみ中…', 'Loading Friend…')}</p>
              : <div className="choices">
                {saved && <button onClick={() => begin(saved)} disabled={paused}>{tt('つづきから', 'Continue')}</button>}
                <button onClick={() => begin(newGame(token, newSeed()))} disabled={paused}>{tt('はじめから', 'New game')}</button>
              </div>}
          <p className="fine">{tt('オリジナルの モンスター収集RPG。すべて むりょう・シミュレーションで、RFの やりとりは ありません。', 'An original monster-collecting RPG. Everything is free and simulated; no RF changes hands.')}</p>
        </div>}
        {started && manualPause && <div className="paused"><h2>PAUSED</h2><p>{tt('P / Esc で再開', 'Press P / Esc to resume')}</p>
          <button onClick={() => setManualPause(false)} disabled={paused}>{tt('再開する', 'Resume')}</button></div>}
      </div>
    </div>
    <div className="pad" aria-label={tt('コントローラー', 'Controller')}>
      <div className="dpad">
        <button data-testid="pad-up" aria-label={tt('上', 'Up')} className="up" {...padPress('up')}>▲</button>
        <button data-testid="pad-left" aria-label={tt('左', 'Left')} className="left" {...padPress('left')}>◀</button>
        <button data-testid="pad-right" aria-label={tt('右', 'Right')} className="right" {...padPress('right')}>▶</button>
        <button data-testid="pad-down" aria-label={tt('下', 'Down')} className="down" {...padPress('down')}>▼</button>
      </div>
      <div className="mid"><button className="menu-btn" data-testid="pad-menu" {...tap('menu')}>{tt('メニュー', 'MENU')}</button></div>
      <div className="ab">
        <button className="b" data-testid="pad-b" aria-label="B" {...tap('b')}>B</button>
        <button className="a" data-testid="pad-a" aria-label="A" {...tap('a')}>A</button>
      </div>
    </div>
    <footer>
      <span>{tt('移動: 十字/WASD · A: Z/Enter · B: X · メニュー: M/Space · 一時停止: P', 'Move: D-pad/WASD · A: Z/Enter · B: X · Menu: M/Space · Pause: P')}</span>
      <span>{tt('むりょう・シミュレーション · RFでは ありません', 'FREE & SIMULATED · NOT RF')}</span>
    </footer>
    {(s?.saveError || loadError) && <p className="error" role="alert">{loadError && !s?.saveError
      ? tt('セーブデータを よめませんでした。はじめから あそべます。', 'Could not read your save. You can start a new game.')
      : tt('セーブできませんでした。このまま あそべます。', 'Could not save. You can keep playing.')}</p>}
  </section>;
}
