import { useEffect, useRef, useState } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import { createFriendReader, createGenesisReader } from '@rarefriends/friendsdk/sprites';
import { createGame, step, kmh, trackSlope, type State, type EventKind } from './engine.js';
import { VIEW_H, viewWidth, drawRush, followCamera, newCamera, type Camera, type Sprite, type Trail } from './art.js';
import { createRushSound, type RushSound } from './sound.js';
import { cuesBetween } from './cues.js';
import { EMPTY_RECORD, parseSave, serializeSave, type SavedRecord } from './save.js';
import './style.css';

type Lang = 'ja' | 'en';
const EVENT_TEXT: Record<EventKind, [string, string]> = {
  'launch': ['発射！', 'LAUNCH!'], 'perfect-launch': ['PERFECT LAUNCH!! ドドン！', 'PERFECT LAUNCH!!'],
  'perfect': ['ナイス着地！ 加速！', 'PERFECT LANDING!'], 'bad': ['ドスン… 減速', 'ROUGH LANDING'],
  'boost': ['BOOST GATE！', 'BOOST GATE!'], 'checkpoint': ['CHECKPOINT +15秒', 'CHECKPOINT +15s'],
  'scream': ['絶叫モード ×2！！', 'SCREAM MODE ×2!!'],
  'item': ['ターボ ゲット！', 'TURBO GET!'], 'turbo': ['ターボ！ ギュイーン!!', 'TURBO!!'],
};
const TURBO_KEYS = ['shift', 'arrowup', 't'];

function FriendPixels({ rows, size, label, fill = '#fff4e8' }: { rows: Sprite; size: number; label?: string; fill?: string }) {
  return <svg className="friend-pixels" width={size} height={size} viewBox="0 0 16 16" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {rows.flatMap((row, y) => [...row].map((p, x) => p === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} /> : null))}
  </svg>;
}

const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

export default function RareRush(props: GameComponentProps) {
  return <Ride key={`${props.collection ?? 'generations'}:${props.friendId}`} {...props} />;
}

function Ride({ friendId, collection = 'generations', client, paused }: GameComponentProps) {
  const [lang, setLang] = useState<Lang>('ja');
  const [sprite, setSprite] = useState<Sprite | null>(null);
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0), [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false), [manualPause, setManualPause] = useState(false);
  const [view, setView] = useState<State>(() => createGame(1));
  const [record, setRecord] = useState<SavedRecord>(EMPTY_RECORD), [sound, setSound] = useState(true), [hidden, setHidden] = useState(() => document.hidden);
  const [saveError, setSaveError] = useState(false), [shareError, setShareError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), world = useRef<State>(createGame(1)), camera = useRef<Camera>(newCamera(world.current));
  const trail = useRef<Trail[]>([]), holds = useRef(new Set<string>()), turboKeys = useRef(new Set<string>()), sfx = useRef<RushSound | null>(null);
  const saved = useRef<SavedRecord>(EMPTY_RECORD), unsaved = useRef(false), alive = useRef(false), writing = useRef(false), toggleRef = useRef(() => {});
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const active = started && !paused && !manualPause && ready;
  const label = `${collection === 'genesis' ? 'Genesis' : 'Friend'} #${String(friendId)}`;

  useEffect(() => {
    alive.current = true; setReady(false); setError(false);
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
      try { const v = parseSave(raw); if (v) { saved.current = v; setRecord(v); setSound(v.sound); sfx.current?.setEnabled(v.sound); } } catch { setSaveError(true); }
      setReady(true);
    })().catch(() => { if (current) setError(true); });
    return () => { current = false; alive.current = false; };
  }, [client, friendId, collection, attempt]);

  useEffect(() => {
    const release = () => { holds.current.clear(); turboKeys.current.clear(); };
    const blur = () => { release(); setManualPause(true); };
    const visibility = () => { setHidden(document.hidden); if (document.hidden) blur(); };
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'm' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target as HTMLElement)?.closest('input')) { e.preventDefault(); toggleRef.current(); return; }
      if ((e.target as HTMLElement)?.closest('button,input')) return;
      if ([' ', 'arrowdown', 'enter', 's'].includes(key)) { e.preventDefault(); holds.current.add(`key:${key}`); }
      if (TURBO_KEYS.includes(key)) { e.preventDefault(); turboKeys.current.add(`key:${key}`); }
      if (key === 'escape' || key === 'p') { e.preventDefault(); release(); setManualPause(v => !v); }
    };
    const up = (e: KeyboardEvent) => { holds.current.delete(`key:${e.key.toLowerCase()}`); turboKeys.current.delete(`key:${e.key.toLowerCase()}`); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => {
      release();
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  // Input pressed while paused never carries into play.
  useEffect(() => { holds.current.clear(); turboKeys.current.clear(); }, [active]);
  // Sound: no AudioContext until a user gesture; everything, including the wind, is released on unmount.
  useEffect(() => {
    const board = createRushSound();
    board.setEnabled(saved.current.sound); sfx.current = board;
    const gesture = () => { if (saved.current.sound) board.unlock(); };
    window.addEventListener('pointerdown', gesture, true); window.addEventListener('keydown', gesture, true);
    return () => {
      window.removeEventListener('pointerdown', gesture, true); window.removeEventListener('keydown', gesture, true);
      board.dispose(); if (sfx.current === board) sfx.current = null;
    };
  }, []);
  useEffect(() => { sfx.current?.setSilenced(Boolean(paused) || hidden || manualPause); }, [paused, hidden, manualPause]);
  // Match the canvas to the stage so portrait phones use the full height.
  useEffect(() => {
    const el = canvas.current, stage = el?.parentElement;
    if (!el || !stage || typeof ResizeObserver === 'undefined') return;
    const fit = () => { const { width, height } = stage.getBoundingClientRect(); if (width > 0 && height > 0) el.width = viewWidth(width / height); };
    const observer = new ResizeObserver(fit); observer.observe(stage); fit();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0, last = 0, published = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function tick(now: number) {
      const dt = last ? Math.min(0.034, (now - last) / 1000) : 0; last = now;
      const before = world.current;
      if (active && before.status !== 'over') {
        const next = step(before, { hold: holds.current.size > 0, turbo: turboKeys.current.size > 0 }, dt);
        world.current = next;
        if (next.event && next.event !== before.event && next.event.at === next.time) {
          if (['bad', 'boost', 'perfect-launch', 'turbo'].includes(next.event.kind)) camera.current = { ...camera.current, shake: 1 };
        }
        for (const cue of cuesBetween(before, next)) sfx.current?.play(cue.id, { pitch: cue.pitch });
        trail.current = [...trail.current.slice(-9), { x: next.x, y: next.y }];
        if (next.status === 'over') saveRecord(next);
      }
      const s = world.current;
      camera.current = followCamera(camera.current, s, dt);
      const speed = s.grounded ? s.speed : Math.hypot(s.vx, s.vy);
      sfx.current?.setWind(active && s.status === 'running' ? speed : 0);
      const diving = s.status === 'running' && speed > 42 && (s.grounded ? trackSlope(s.x, s.seed) < -0.7 : s.vy < -22);
      const shout = s.screamTime > 0 || diving ? (lang === 'ja' ? 'キャーーッ!!' : 'AAAAAH!!') : null;
      const c = canvas.current?.getContext('2d');
      if (c) drawRush(c, s, camera.current, sprite, trail.current, reduced, active ? shout : null);
      if (now - published > 80 || s.status === 'over') { setView(s); published = now; }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, sprite, client, lang]);

  /**
   * The record stays dirty until a write succeeds, so a rejected save is retried later.
   * One write at a time: a change made during a write is written when it finishes.
   */
  function persist() {
    if (!client.saveLocal) return;
    unsaved.current = true;
    if (writing.current) return;
    const snapshot = saved.current;
    writing.current = true;
    void client.saveLocal(serializeSave(snapshot))
      .then(() => {
        writing.current = false;
        if (saved.current === snapshot) unsaved.current = false;
        else if (alive.current) persist();
      })
      .catch(() => { writing.current = false; if (alive.current) setSaveError(true); });
  }
  function saveRecord(s: State) {
    const prev = saved.current;
    const next = { ...prev, best: Math.max(prev.best, Math.round(s.score)), bestDistance: Math.max(prev.bestDistance, Math.round(s.distance)), topSpeed: Math.max(prev.topSpeed, kmh(s.maxSpeed)) };
    if (prev.best > 0 && next.best > prev.best) sfx.current?.play('best', { delay: 0.8 });
    if (next.best !== prev.best || next.bestDistance !== prev.bestDistance || next.topSpeed !== prev.topSpeed) { saved.current = next; setRecord(next); }
    else if (!unsaved.current) return;
    persist();
  }

  const start = () => {
    if (paused || !ready) return;
    if (unsaved.current) persist();
    sfx.current?.unlock();
    world.current = createGame(newSeed()); camera.current = newCamera(world.current); trail.current = [];
    setView(world.current); holds.current.clear(); turboKeys.current.clear();
    setStarted(true); setManualPause(false); setShareError(false); canvas.current?.focus();
  };
  const resume = () => { setManualPause(false); canvas.current?.focus(); };
  /** The on/off setting lives in the same local save as the record. */
  function toggleSound() {
    if (!ready) return;
    const on = !saved.current.sound;
    saved.current = { ...saved.current, sound: on }; setSound(on); setRecord(saved.current);
    sfx.current?.setEnabled(on);
    if (on && sfx.current?.unlock()) sfx.current.play('item');
    persist();
  }
  toggleRef.current = toggleSound;

  const turboPress = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => { if (!active || world.current.status !== 'running') return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); turboKeys.current.add(`pointer:${e.pointerId}`); },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => { turboKeys.current.delete(`pointer:${e.pointerId}`); },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => { turboKeys.current.delete(`pointer:${e.pointerId}`); },
    onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => { turboKeys.current.delete(`pointer:${e.pointerId}`); },
  };
  const press = (id: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      // Overlay buttons (share, ride again) sit inside the stage: never capture their presses.
      if (!active || world.current.status === 'over' || (id === 'stage' && (e.target as HTMLElement).closest('button'))) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); holds.current.add(`${id}:${e.pointerId}`); },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => { holds.current.delete(`${id}:${e.pointerId}`); },
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => { holds.current.delete(`${id}:${e.pointerId}`); },
    onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => { holds.current.delete(`${id}:${e.pointerId}`); },
  });

  const s = view, finished = s.status === 'over', launching = s.status === 'launch';
  const speed = kmh(s.grounded ? s.speed : Math.hypot(s.vx, s.vy));
  const toast = s.event && s.time - s.event.at < 1.4 ? EVENT_TEXT[s.event.kind][lang === 'ja' ? 0 : 1] : null;
  const share = () => {
    setShareError(false);
    void client.shareScore!(Math.round(s.score), Math.min(450, Math.max(1, kmh(s.maxSpeed))), 'over', lang).catch(() => setShareError(true));
  };

  return <section className="rush" lang={lang} aria-label="Rare Rush">
    <header>
      <div className="brand"><small>RARE FRIENDS / ARCADE 03</small><h1>RARE <span>RUSH</span></h1></div>
      <div className="top-actions">
        <button className="sound-toggle" onClick={toggleSound} disabled={!ready} aria-pressed={sound} data-testid="sound"
          aria-label={t('サウンド オン/オフ', 'Sound on/off')} title={t('サウンド オン/オフ（M）', 'Sound on/off (M)')}><span aria-hidden="true">♪</span></button>
        <button onClick={() => { setLang(lang === 'ja' ? 'en' : 'ja'); if (started) canvas.current?.focus(); }}>{lang === 'ja' ? 'English' : '日本語'}</button>
        {started && !finished && <button disabled={paused} aria-label={t('一時停止', 'Pause')} onClick={() => setManualPause(true)}>Ⅱ</button>}
      </div>
    </header>
    <div className="hud">
      <div className="speed"><strong data-testid="speed">{speed}</strong><small>km/h</small></div>
      <div><small>{t('距離', 'DIST')}</small><b data-testid="distance">{Math.round(s.distance)}m</b></div>
      <div className={s.timeLeft < 10 && !launching ? 'low' : ''}><small>TIME</small><b data-testid="time">{Math.ceil(s.timeLeft)}</b></div>
      <div><small>SCORE</small><b data-testid="score">{Math.round(s.score)}</b></div>
      <div className="scream" aria-label={t('絶叫メーター', 'Scream meter')}><small>{s.screamTime > 0 ? t('絶叫中 ×2', 'SCREAM ×2') : t('絶叫', 'SCREAM')}</small>
        <i><em style={{ width: `${(s.screamTime > 0 ? s.screamTime / 6 : s.scream) * 100}%` }} className={s.screamTime > 0 ? 'on' : ''} /></i></div>
    </div>
    <div className="stage" {...press('stage')}>
      <canvas ref={canvas} width={viewWidth(4 / 3)} height={VIEW_H} tabIndex={0}
        aria-label={t('長押しで加速、離してジャンプ', 'Hold to dive, release to fly')} />
      {toast && active && <p className={`toast ${s.event!.kind}`} role="status">{toast}</p>}
      {launching && active && <div className="gauge" aria-label={t('空気圧', 'Air pressure')}>
        <span>{t('空気圧', 'PRESSURE')}</span><i><em data-testid="pressure" style={{ height: `${s.pressure * 100}%` }} className={s.pressure >= 0.9 ? 'max' : ''} /></i>
        <p>{s.heldFor > 0 ? t('ピークで離せ！', 'Release at the peak!') : t('長押しでチャージ', 'Hold to charge')}</p>
      </div>}
      {(!started || manualPause || finished || error) && <div className="overlay"><div>
        {!started && !error && sprite && <div className="rider"><FriendPixels rows={sprite} size={64} fill="#ffd36b" /><span>{t('本日の乗客', "TODAY'S RIDER")}<b>{label}</b></span></div>}
        <span className="label">{finished ? 'RESULT' : 'LAUNCH COASTER × FUJI DROP'}</span>
        <h2>{error ? 'OOPS' : finished ? t('おつかれさま！', 'WHAT A RIDE!') : started ? 'PAUSED' : <>0→200KM/H.<br />{t('叫べ。', 'SCREAM.')}</>}</h2>
        {error ? <p>{t('Friendを読み込めませんでした。もう一度お試しください。', 'Could not load your Friend. Please retry.')}</p>
          : finished ? <dl className="result">
            <div><dt>SCORE</dt><dd data-testid="final-score">{Math.round(s.score)}</dd></div>
            <div><dt>{t('距離', 'DISTANCE')}</dt><dd>{Math.round(s.distance)}m</dd></div>
            <div><dt>{t('最高速', 'TOP SPEED')}</dt><dd>{kmh(s.maxSpeed)}km/h</dd></div>
            <div><dt>{t('ナイス着地', 'PERFECTS')}</dt><dd>{s.perfects}</dd></div>
          </dl>
          : !started && <ol className="howto">
            <li>{t('長押しで空気圧チャージ。ピークで離して発射。', 'Hold to build air pressure. Release at the peak to launch.')}</li>
            <li>{t('下り坂で長押し＝加速。頂上で離す＝大ジャンプ。', 'Hold on downhills to dive. Let go at the crest to fly.')}</li>
            <li>{t('坂の向きに合わせて着地すると、さらに加速。', 'Land along the slope for a speed boost.')}</li>
          </ol>}
        {error
          ? <button className="launch" onClick={() => setAttempt(v => v + 1)}>{t('再読み込み', 'Retry')}</button>
          : <button className="launch" disabled={!ready || paused} onClick={started && !finished ? resume : start}>
            {!ready ? t('Friendを読込中…', 'Loading Friend…') : started && !finished ? t('再開する', 'Resume') : finished ? t('もう一度乗る', 'Ride again') : t('乗車する', 'Board')}
          </button>}
        {finished && client.shareScore && <button className="share-score" disabled={paused} onClick={share}>{t('スコアをXでシェア', 'Share score on X')}</button>}
        {shareError && <p role="alert">{t('シェアを開けませんでした。もう一度お試しください。', 'Could not open sharing. Please retry.')}</p>}
      </div></div>}
    </div>
    <div className="controls">
      <button className={`turbo${s.turboTime > 0 ? ' firing' : ''}`} disabled={!active || finished || launching || s.turbos === 0} {...turboPress}
        aria-label={t(`ターボ 残り${s.turbos}`, `Turbo, ${s.turbos} left`)} data-testid="turbo">
        <span className="bolt" aria-hidden="true">⚡</span>{t('ターボ', 'TURBO')}
        <span className="pips" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} className={i < s.turbos ? 'on' : ''} />)}</span>
      </button>
      <button className="hold" disabled={!active || finished} {...press('button')} aria-label={t('長押し', 'Hold')}>
        {launching ? t('長押しでチャージ → 離して発射', 'HOLD to charge → RELEASE to launch') : t('長押し：加速 / 離す：ジャンプ', 'HOLD: dive / RELEASE: fly')}
      </button>
    </div>
    <footer>
      <span className="who">{sprite && <FriendPixels rows={sprite} size={16} label={label} />}{label.toUpperCase()} · {t('ベスト', 'BEST')} {record.best} · {record.bestDistance}m · {record.topSpeed}km/h</span>
      <span>{t('無料のアーケード · スコアはRFではありません', 'FREE ARCADE · SCORE IS NOT RF')}</span>
    </footer>
    {saveError && <p className="error" role="alert">{t('記録を保存できませんでした。このブラウザーの保存設定を確認してください。', 'Could not save your record. Check this browser’s storage settings.')}</p>}
  </section>;
}
