import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import { createFriendReader, createGenesisReader, spriteFrame, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { CHOICE_HINT, COMBO_MAX, MAX_STREAK, ROLL_TIME, ROLL_TIME_REDUCED } from './economy.ts';
import { askBet, cancelBet, comboLevel, confirmBet, newGame, setSound, skipRoll, tap, tick, withdraw, type MineState, type Outcome } from './game.ts';
import { loadGame, serialize } from './save.ts';
import { SCENE_H, SCENE_W, createScene, sceneHeight } from './render.ts';
import { drawFriend, type FriendRows } from './art.ts';
import { createMineAudio, type MineAudio } from './sound.ts';
import type { Cue } from './particles.ts';
import { ActionBar, ComboMeter, ConfirmPanel, Odometer, ResultBanner, RollPanel, SIM_NOTE, StatsPanel, UNIT, fmt, pick, type Lang, type Text } from './panels.tsx';
import './style.css';

const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
const nowSec = () => performance.now() / 1000;
const BANNER_MS = 2600, TOAST_MS = 1400;
/** Re-render React only when something visible changed (the canvas draws every frame on its own). */
const signature = (s: MineState) => `${s.fxId}|${s.phase}|${comboLevel(s)}|${s.saveTick}|${s.sound}`;
interface Toast { readonly id: number; readonly text: Text }

export default function RareMine(props: GameComponentProps) {
  return <Mine key={`${props.collection ?? 'generations'}:${props.friendId}`} {...props} />;
}

function Portrait({ rows, label }: { rows: FriendRows; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current?.getContext('2d'); if (c) { c.clearRect(0, 0, 18, 18); drawFriend(c, rows, 1, 1, 1); } }, [rows]);
  return <canvas ref={ref} className="portrait" width={18} height={18} role="img" aria-label={label} />;
}

function Mine({ friendId, collection = 'generations', client, paused }: GameComponentProps) {
  const token = `${collection}:${friendId}`;
  const label = `${collection === 'genesis' ? 'Genesis' : 'Friend'} #${String(friendId)}`;
  const [lang, setLang] = useState<Lang>('ja');
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<MineState | null>(null), [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<MineState | null>(null);
  const [manualPause, setManualPause] = useState(false);
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saves, setSaves] = useState(0), [saveError, setSaveError] = useState(false);
  const [banner, setBanner] = useState<Outcome | null>(null), [toast, setToast] = useState<Toast | null>(null);
  const [sharing, setSharing] = useState(false), [shareError, setShareError] = useState(false);
  const game = useRef<MineState | null>(null), canvas = useRef<HTMLCanvasElement>(null), scene = useRef(createScene());
  const audio = useRef<MineAudio | null>(null), stopRoll = useRef<(() => void) | null>(null), sig = useRef(''), handledSave = useRef(0);
  const reducedRef = useRef(reduced); reducedRef.current = reduced;
  const wrap = useRef<HTMLDivElement>(null), [sceneH, setSceneH] = useState(SCENE_H);
  const sceneHRef = useRef(sceneH); sceneHRef.current = sceneH;
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
      try { setSaved(loadGame(raw, token)); } catch { setLoadError(true); }
      setReady(true);
    })().catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [client, friendId, collection, attempt, token]);

  function commit(next: MineState) {
    game.current = next;
    const key = signature(next);
    if (key !== sig.current) { sig.current = key; setView(next); }
  }
  function ensureAudio() { if (!audio.current) audio.current = createMineAudio(); }
  /** Run an engine action from input; ignored while paused or before the mine opens. */
  function act(fn: (s: MineState) => MineState) {
    const s = game.current;
    if (!activeRef.current || !s) return;
    ensureAudio();
    const next = fn(s);
    if (next !== s) commit(next);
  }

  function play(cues: readonly Cue[], s: MineState) {
    for (const q of cues) {
      if (q.k === 'vein' || q.k === 'gem') setToast({ id: Date.now(), text: q.k === 'gem' ? [`宝石！ +${q.n}`, `GEM! +${q.n}`] : [`金の鉱脈！ +${q.n}`, `Gold vein! +${q.n}`] });
      if (q.k === 'win' || q.k === 'burn') { stopRoll.current?.(); stopRoll.current = null; }
    }
    const a = audio.current;
    if (!a || !s.sound) return;
    const richness = Math.min(1, Math.sqrt(s.pot) / 40);
    for (const q of cues) {
      switch (q.k) {
        case 'tock': a.tock(q.n === 1); break;
        case 'crumble': a.crumble(); break;
        case 'land': a.clink(q.n, richness); break;
        case 'jar': a.jar(q.n); break;
        case 'vein': a.vein(); break;
        case 'gem': a.gem(); break;
        case 'chaching': a.chaChing(); break;
        case 'roll': stopRoll.current = a.drumRoll(q.n); break;
        case 'win': a.fanfare(); break;
        case 'burn': a.burn(); break;
      }
    }
  }

  useEffect(() => {
    let frame = 0, last = nowSec();
    function loop() {
      const now = nowSec(), dt = Math.min(0.1, now - last); last = now;
      if (activeRef.current && game.current) commit(tick(game.current, dt));
      const s = game.current, c = canvas.current?.getContext('2d');
      if (s && c) {
        const rows = sprites ? friendRowsOf(sprites) : null;
        play(scene.current.draw(c, s, rows, now, reducedRef.current, sceneHRef.current), s);
      }
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [sprites]);

  function persist(state: MineState): Promise<boolean> {
    if (!client.saveLocal) return Promise.resolve(false);
    return client.saveLocal(serialize(state)).then(() => { setSaves(n => n + 1); setSaveError(false); return true; }, () => { setSaveError(true); return false; });
  }
  useEffect(() => {
    if (!view || view.saveTick === 0 || view.saveTick === handledSave.current) return;
    handledSave.current = view.saveTick;
    void persist(view);
  }, [view?.saveTick]);

  const lastId = view?.last?.id ?? 0;
  useEffect(() => {
    if (!view?.last) return;
    setBanner(view.last);
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [lastId]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), TOAST_MS); return () => clearTimeout(t); }, [toast?.id]);

  function pauseNow() { if (game.current) { setManualPause(true); void persist(game.current); } }
  const strike = () => act(tap);
  const doWithdraw = () => act(withdraw);
  const doBet = () => act(s => s.phase === 'confirm' ? cancelBet(s) : askBet(s));
  const doConfirm = () => act(s => confirmBet(s, reducedRef.current ? ROLL_TIME_REDUCED : ROLL_TIME));
  const doCancel = () => act(cancelBet);
  const toggleSound = () => {
    const s = game.current;
    if (s) { ensureAudio(); commit(setSound(s, !s.sound)); }
  };

  useEffect(() => {
    const blur = () => pauseNow();
    const visibility = () => { if (document.hidden) blur(); };
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase(), s = game.current;
      const onButton = (e.target as HTMLElement)?.closest?.('button');
      if (key === 'm') { e.preventDefault(); toggleSound(); return; }
      if (key === 'p' || (key === 'escape' && s?.phase !== 'confirm')) { e.preventDefault(); if (s) setManualPause(v => { if (!v) void persist(s); return !v; }); return; }
      if (!s) return;
      if (s.phase === 'confirm' && (key === 'y')) { e.preventDefault(); doConfirm(); return; }
      if (s.phase === 'confirm' && (key === 'n' || key === 'escape')) { e.preventDefault(); doCancel(); return; }
      if ((key === ' ' || key === 'enter') && !onButton) { e.preventDefault(); if (!e.repeat) strike(); return; }
      if (key === 'w' && !e.repeat) { e.preventDefault(); doWithdraw(); return; }
      if (key === 'b' && !e.repeat) { e.preventDefault(); act(askBet); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => () => { stopRoll.current?.(); audio.current?.close(); audio.current = null; }, []);
  // Portrait screens get a taller canvas (more rock ceiling) instead of empty space around a letterboxed stage.
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const fit = () => { const { width, height } = el.getBoundingClientRect(); if (width > 0 && height > 0) setSceneH(sceneHeight(width / height)); };
    const observer = new ResizeObserver(fit); observer.observe(el); fit();
    return () => observer.disconnect();
  }, []);

  function begin(state: MineState) {
    ensureAudio();
    scene.current.reset(state);
    game.current = state; handledSave.current = state.saveTick; sig.current = '';
    commit(state); setManualPause(false); setBanner(null);
  }
  const stagePress = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || !activeRef.current) return;
    e.preventDefault(); strike();
  };
  const share = () => {
    const s = game.current;
    if (!s || !client.shareScore) return;
    setSharing(true); setShareError(false);
    const best = s.stats.bestStreak;
    void client.shareScore(Math.min(999_999_999, s.stats.burned), Math.max(1, Math.min(MAX_STREAK, best)), best > 0 ? 'won' : 'over', lang)
      .catch(() => setShareError(true)).finally(() => setSharing(false));
  };

  const s = view;
  const friendRows = sprites?.clips.idle.down[0]?.rows ?? null;
  const hint = !!s && s.phase === 'mine' && s.pot >= CHOICE_HINT && s.stats.withdrawn === 0 && s.stats.staked === 0;
  const combo = s ? comboLevel(s) : 0;
  return <section className={`mine${reduced ? ' calm' : ''}`} lang={lang} aria-label="Rare Mine">
    <header>
      <div className="brand"><h1>RARE <span>MINE</span></h1><small>{tt('きみの Friendが ほる コイン鉱山', 'Your Friend digs for coins')}</small></div>
      <div className="status">{friendRows && <Portrait rows={friendRows} label={label} />}<b>{label}</b></div>
      <div className="top-actions">
        <button onClick={toggleSound} disabled={!s} aria-pressed={(s ?? saved)?.sound ?? true} aria-label={tt('サウンド', 'Sound')} data-testid="sound">♪ {((s ?? saved)?.sound ?? true) ? 'on' : 'off'}</button>
        <button onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')} data-testid="lang">{lang === 'ja' ? 'English' : '日本語'}</button>
        {started && <button disabled={paused} aria-label={tt('一時停止', 'Pause')} onClick={pauseNow} data-testid="pause">Ⅱ</button>}
      </div>
    </header>
    <div className="stage-wrap" ref={wrap}><div className="stage" style={{ ['--ar' as string]: SCENE_W / sceneH }} data-testid="screen" data-started={String(started)} data-phase={s?.phase ?? 'title'} data-pot={s?.pot ?? 0} data-safe={s?.safe ?? 0}
      data-streak={s?.streak ?? 0} data-mined={s?.stats.mined ?? 0} data-withdrawn={s?.stats.withdrawn ?? 0} data-burned={s?.stats.burned ?? 0}
      data-best={s?.stats.bestStreak ?? 0} data-won={s?.stats.betsWon ?? 0} data-lost={s?.stats.betsLost ?? 0} data-strikes={s?.stats.strikes ?? 0}
      data-combo={combo} data-depth={s?.depth ?? 0} data-betseed={s?.betSeed ?? ''} data-last={s?.last ? (s.last.win ? 'win' : 'lose') : ''} data-lastid={s?.last?.id ?? 0}
      data-sound={String(s?.sound ?? true)} data-paused={String(!active)} data-saves={saves} data-lang={lang} data-reduced={String(reduced)}
      onPointerDown={stagePress}>
      <canvas ref={canvas} width={SCENE_W} height={sceneH} role="img"
        aria-label={tt(`${label}が岩をほっている。タップで追加の一撃。`, `${label} is mining. Tap the rock to strike.`)} />
      {s && <div className="hud">
        <div className="pot"><small>{tt('ポット', 'POT')}{s.streak > 0 && <em> ×{2 ** s.streak}</em>}</small>
          <Odometer value={s.pot} label={tt(`ポット ${fmt(s.pot)}`, `Pot ${fmt(s.pot)}`)} testId="pot" /></div>
        <ComboMeter level={combo} max={COMBO_MAX} lang={lang} />
      </div>}
      {s && <p className="sim" data-testid="sim-note">{pick(lang, SIM_NOTE)}</p>}
      {hint && active && <p className="nudge">{tt('ポットがたまった！ 引き出す？ 倍かけ？', 'Nice pile! Bank it, or double it?')}</p>}
      {toast && active && <p className="toast" role="status">{pick(lang, toast.text)}</p>}
      {banner && s?.phase === 'mine' && <ResultBanner last={banner} lang={lang} />}
      {s?.phase === 'confirm' && <ConfirmPanel s={s} lang={lang} onConfirm={doConfirm} onCancel={doCancel} />}
      {s?.phase === 'roll' && <RollPanel s={s} lang={lang} reduced={reduced} onSkip={() => act(skipRoll)} />}
      {(!started || error) && <div className="title">
        <h2>RARE<span>MINE</span></h2>
        {friendRows && !error && <p className="starring"><Portrait rows={friendRows} label={label} />{tt(`採掘係: ${label}`, `Miner: ${label}`)}</p>}
        <p>{tt('ほって、ためて、引き出すか 倍かけるか。', 'Dig, stack, then bank it or double it.')}</p>
        {error ? <><p role="alert">{tt('Friendを よみこめませんでした。', 'Could not load your Friend.')}</p><button onClick={() => setAttempt(v => v + 1)}>{tt('もう一度', 'Retry')}</button></>
          : !ready ? <p>{tt('Friendを よみこみ中…', 'Loading Friend…')}</p>
            : <div className="choices">
              {saved && <button data-testid="continue" onClick={() => begin(saved)} disabled={paused}>{tt(`つづきから（安全 ${fmt(saved.safe)}）`, `Continue (safe ${fmt(saved.safe)})`)}</button>}
              {!saved && <button data-testid="start" onClick={() => begin(newGame(token, newSeed()))} disabled={paused}>{tt('採掘をはじめる', 'Start mining')}</button>}
            </div>}
        <p className="fine">{pick(lang, UNIT)} · {pick(lang, SIM_NOTE)}</p>
      </div>}
      {started && manualPause && <div className="paused">
        <h2>PAUSED</h2><p>{tt('P / Esc で再開', 'Press P / Esc to resume')}</p>
        <div className="choices">
          <button onClick={() => setManualPause(false)} disabled={paused}>{tt('再開する', 'Resume')}</button>
          <button onClick={() => setReduced(v => !v)} aria-pressed={reduced} data-testid="motion">{reduced ? tt('動き: ひかえめ', 'Motion: reduced') : tt('動き: ふつう', 'Motion: full')}</button>
        </div>
      </div>}
    </div></div>
    {s && <ActionBar s={s} lang={lang} active={active} hint={hint} onWithdraw={doWithdraw} onBet={doBet} />}
    {s && <StatsPanel s={s} lang={lang} canShare={!!client.shareScore && s.stats.betsWon + s.stats.betsLost > 0} sharing={sharing || paused} onShare={share} />}
    <footer>
      <span>{tt('タップ/Space: ほる · W: 引き出す · B: 倍かけ · Y/N: 決定/やめる · M: 音 · P: 一時停止', 'Tap/Space: strike · W: withdraw · B: bet · Y/N: confirm/cancel · M: sound · P: pause')}</span>
      <span>{pick(lang, SIM_NOTE)}</span>
    </footer>
    {(saveError || loadError || shareError) && <p className="error" role="alert">{shareError ? tt('シェアを開けませんでした。もう一度お試しください。', 'Could not open sharing. Please retry.')
      : loadError && !saveError ? tt('セーブデータを よめませんでした。はじめから あそべます。', 'Could not read your save. You can start fresh.')
        : tt('セーブできませんでした。このまま あそべます。', 'Could not save. You can keep playing.')}</p>}
  </section>;
}

/** The Friend facing the rock (right), cycling its idle frames slowly. */
function friendRowsOf(sprites: GenerationSprites): FriendRows | null {
  const frame = Math.floor(nowSec() * 4) % 8;
  try { return spriteFrame(sprites, 'right', false, frame).frame.rows; } catch { return sprites.clips.idle.down[0]?.rows ?? null; }
}
