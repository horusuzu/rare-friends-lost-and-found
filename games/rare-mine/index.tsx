import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import { createFriendReader, createGenesisReader, spriteFrame, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { CHOICE_HINT, COMBO_MAX, MAX_STREAK, ROLL_TIME, ROLL_TIME_REDUCED } from './economy.ts';
import { askBet, cancelBet, comboLevel, confirmBet, newGame, setSound, skipRoll, tap, tick, withdraw, type MineState } from './game.ts';
import { loadSave, serializeSave, type SaveData } from './save.ts';
import { RF, decideMode, fmtRF } from './feed.ts';
import { canRealBet, newLedger, realPot } from './real.ts';
import { useRewards } from './use-rewards.ts';
import { useRealMine } from './use-real-mine.ts';
import { SCENE_H, SCENE_W, createScene, sceneHeight } from './render.ts';
import type { FriendRows } from './art.ts';
import { createMineAudio, type MineAudio } from './sound.ts';
import type { Cue } from './particles.ts';
import { ActionBar, BET_SIM_NOTE, ComboMeter, ConfirmPanel, Odometer, ResultBanner, RollPanel, SIM_NOTE, StatsPanel, coinText, fmt, pick, type Lang } from './panels.tsx';
import { ModeBar, RealHud, StageNote } from './real-panels.tsx';
import { Portrait, Title } from './title.tsx';
import { PRACTICE_NOTE, REAL_STATS_NOTE, announcement, practiceRows, realRows, type BannerInfo, type Toast } from './view.ts';
import './style.css';

const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
const nowSec = () => performance.now() / 1000;
const BANNER_MS = 2600, TOAST_MS = 1400;
/** Real mode re-renders the HUD (odometer, stats) at most this often; the canvas draws every frame on its own. */
const HUD_S = 0.125;
const EMPTY_SAVE: SaveData = Object.freeze({ practice: null, real: null, sound: true });
/** Re-render React only when something visible changed. */
const signature = (s: MineState) => `${s.mode}|${s.fxId}|${s.phase}|${comboLevel(s)}|${s.saveTick}|${s.sound}|${s.streak}`;
const rfText = (wei: bigint) => `${fmtRF(wei)} RF`;

export default function RareMine(props: GameComponentProps) {
  return <Mine key={`${props.collection ?? 'generations'}:${props.friendId}`} {...props} />;
}

function Mine({ friendId, collection = 'generations', client, paused }: GameComponentProps) {
  const token = `${collection}:${friendId}`;
  const label = `${collection === 'genesis' ? 'Genesis' : 'Friend'} #${String(friendId)}`;
  const [lang, setLang] = useState<Lang>('ja');
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<SaveData>(EMPTY_SAVE), [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<MineState | null>(null);
  const [manualPause, setManualPause] = useState(false);
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [saves, setSaves] = useState(0), [saveError, setSaveError] = useState(false);
  const [banner, setBanner] = useState<BannerInfo | null>(null), [toast, setToast] = useState<Toast | null>(null);
  const [sharing, setSharing] = useState(false), [shareError, setShareError] = useState(false);
  const [, setHud] = useState(0);
  const game = useRef<MineState | null>(null), canvas = useRef<HTMLCanvasElement>(null), scene = useRef(createScene());
  const keep = useRef<SaveData>(EMPTY_SAVE);
  const audio = useRef<MineAudio | null>(null), stopRoll = useRef<(() => void) | null>(null), sig = useRef(''), handledSave = useRef(0);
  const reducedRef = useRef(reduced); reducedRef.current = reduced;
  const wrap = useRef<HTMLDivElement>(null), [sceneH, setSceneH] = useState(SCENE_H);
  const sceneHRef = useRef(sceneH); sceneHRef.current = sceneH;
  const tt = (ja: string, en: string) => lang === 'ja' ? ja : en;
  const started = view !== null;
  const active = started && ready && !paused && !manualPause;
  const activeRef = useRef(active); activeRef.current = active;
  const pausedNow = useRef(manualPause); pausedNow.current = manualPause;

  const rewards = useRewards(client, friendId, collection, ready && !paused && !manualPause);
  const { reader } = rewards;
  const decision = decideMode({ available: rewards.available, failures: reader.failures, last: reader.last, rate: reader.feed.rate });
  const realMine = useRealMine(reader, () => {
    setToast({ id: Date.now(), text: ['公式サイトでの受け取りを反映しました', 'Your claim on the official site is reflected'] });
    void persist();
  });
  const realRef = useRef(realMine); realRef.current = realMine;

  useEffect(() => {
    let current = true;
    setReady(false); setError(false);
    void (async () => {
      await client.read();
      const art = collection === 'genesis' ? createGenesisReader() : createFriendReader();
      const [sprite, raw] = await Promise.all([
        art.read(friendId),
        client.loadLocal ? client.loadLocal().catch(() => { if (current) setLoadError(true); return null; }) : Promise.resolve(null),
      ]);
      if (!current) return;
      setSprites(sprite);
      try { const data = loadSave(raw, token) ?? EMPTY_SAVE; keep.current = data; setSaved(data); } catch { setLoadError(true); }
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
      if (s.mode === 'practice' && (q.k === 'vein' || q.k === 'gem')) setToast({ id: Date.now(), text: q.k === 'gem' ? [`宝石！ +${q.n}`, `GEM! +${q.n}`] : [`金の鉱脈！ +${q.n}`, `Gold vein! +${q.n}`] });
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
      }
    }
  }

  useEffect(() => {
    let frame = 0, last = nowSec(), hudAt = 0, hudKey = '';
    function loop() {
      const now = nowSec(), dt = Math.min(0.1, now - last); last = now;
      const cur = game.current;
      if (activeRef.current && cur) {
        const ticked = tick(cur, dt);
        const next = ticked.mode === 'real' ? realRef.current.step(ticked, now, dt) : ticked;
        commit(next);
        const key = next.mode === 'real' ? `${realRef.current.shown.current}|${next.phase}` : '';
        if (key !== hudKey && now - hudAt >= HUD_S) { hudKey = key; hudAt = now; setHud(n => n + 1); }
      }
      const s = game.current, c = canvas.current?.getContext('2d');
      if (s && c) play(scene.current.draw(c, s, sprites ? friendRowsOf(sprites) : null, now, reducedRef.current, sceneHRef.current), s);
      frame = requestAnimationFrame(loop);
    }
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [sprites]);

  function saveData(): SaveData {
    const s = game.current, k = keep.current;
    return { practice: s?.mode === 'practice' ? s : k.practice, real: realRef.current.ledger.current ?? k.real, sound: s?.sound ?? k.sound };
  }
  function persist(): Promise<boolean> {
    if (!client.saveLocal || !game.current) return Promise.resolve(false);
    return client.saveLocal(serializeSave(token, saveData()))
      .then(() => { setSaves(n => n + 1); setSaveError(false); return true; }, () => { setSaveError(true); return false; });
  }
  useEffect(() => {
    if (!view || view.saveTick === 0 || view.saveTick === handledSave.current) return;
    handledSave.current = view.saveTick;
    void persist();
  }, [view?.saveTick]);

  const lastId = view?.last?.id ?? 0;
  useEffect(() => {
    const last = view?.last;
    if (!last) return;
    const roll = realRef.current.rolling.current;
    setBanner(view.mode === 'real' && roll
      ? { id: last.id, win: roll.win, stake: rfText(roll.stake), pot: rfText(roll.pot), streak: roll.ledger.streak, simulated: true }
      : { id: last.id, win: last.win, stake: fmt(last.stake), pot: fmt(last.pot), streak: last.streak, simulated: false });
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [lastId]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), TOAST_MS); return () => clearTimeout(t); }, [toast?.id]);

  function pauseNow() { if (game.current) { setManualPause(true); void persist(); } }
  const isReal = () => game.current?.mode === 'real';
  const strike = () => act(tap);
  function doWithdraw() {
    if (!isReal()) { act(withdraw); return; }
    const s = game.current;
    if (!activeRef.current || !s) return;
    ensureAudio();
    const done = realRef.current.withdraw(s);
    if (!done) return;
    commit(done.state); void persist();
    setToast({ id: Date.now(), text: [`${rfText(done.pot)} を記録`, `Recorded ${rfText(done.pot)}`] });
  }
  function askReal(s: MineState): MineState {
    const l = realRef.current.ledger.current, e = realRef.current.shown.current;
    return s.phase === 'mine' && l && e !== null && canRealBet(l, e) ? { ...s, phase: 'confirm' } : s;
  }
  const doBet = () => act(s => s.phase === 'confirm' ? cancelBet(s) : s.mode === 'real' ? askReal(s) : askBet(s));
  const doAsk = () => act(s => s.mode === 'real' ? askReal(s) : askBet(s));
  function doConfirm() {
    const suspense = reducedRef.current ? ROLL_TIME_REDUCED : ROLL_TIME;
    if (!isReal()) { act(s => confirmBet(s, suspense)); return; }
    act(s => realRef.current.confirm(s, suspense));
    void persist();
  }
  const doCancel = () => act(cancelBet);
  const toggleSound = () => {
    const s = game.current;
    if (s) { ensureAudio(); commit(setSound(s, !s.sound)); }
  };
  const handlers = useRef({ strike, doWithdraw, doAsk, doConfirm, doCancel, toggleSound, pauseNow });
  handlers.current = { strike, doWithdraw, doAsk, doConfirm, doCancel, toggleSound, pauseNow };

  useEffect(() => {
    const blur = () => handlers.current.pauseNow();
    const visibility = () => { if (document.hidden) blur(); };
    const down = (e: KeyboardEvent) => {
      const h = handlers.current, key = e.key.toLowerCase(), s = game.current;
      const onButton = (e.target as HTMLElement)?.closest?.('button');
      if (key === 'm') { e.preventDefault(); h.toggleSound(); return; }
      if (key === 'p' || (key === 'escape' && s?.phase !== 'confirm')) {
        e.preventDefault();
        if (!s) return;
        if (pausedNow.current) setManualPause(false); else h.pauseNow();
        return;
      }
      if (!s) return;
      if (s.phase === 'confirm' && key === 'y') { e.preventDefault(); h.doConfirm(); return; }
      if (s.phase === 'confirm' && (key === 'n' || key === 'escape')) { e.preventDefault(); h.doCancel(); return; }
      if ((key === ' ' || key === 'enter') && !onButton) { e.preventDefault(); if (!e.repeat) h.strike(); return; }
      if (key === 'w' && !e.repeat) { e.preventDefault(); h.doWithdraw(); return; }
      if (key === 'b' && !e.repeat) { e.preventDefault(); h.doAsk(); }
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
  function startPractice() { begin(keep.current.practice ?? newGame(token, newSeed(), game.current?.sound ?? keep.current.sound)); }
  function startReal() {
    const s = game.current, k = keep.current;
    if (s?.mode === 'practice') keep.current = { ...k, practice: s };
    realMine.begin(realMine.ledger.current ?? k.real ?? newLedger(token, newSeed()));
    begin(newGame(token, newSeed(), s?.sound ?? k.sound, 'real'));
    void persist();
  }
  const stagePress = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || !activeRef.current) return;
    e.preventDefault(); strike();
  };
  const s = view;
  const real = s?.mode === 'real';
  const ledger = real ? realMine.ledger.current : null, shown = realMine.shown.current, rolling = realMine.rolling.current;
  const potWei = ledger && shown !== null ? (s?.phase === 'roll' && rolling ? rolling.stake : realPot(ledger, shown)) : 0n;
  const share = () => {
    const cur = game.current;
    if (!cur || !client.shareScore) return;
    const l = cur.mode === 'real' ? realRef.current.ledger.current : null;
    const burned = l ? Number(l.burned / RF) : cur.stats.burned, best = l ? l.bestStreak : cur.stats.bestStreak;
    setSharing(true); setShareError(false);
    void client.shareScore(Math.min(999_999_999, burned), Math.max(1, Math.min(MAX_STREAK, best)), best > 0 ? 'won' : 'over', lang)
      .catch(() => setShareError(true)).finally(() => setSharing(false));
  };

  const friendRows = sprites?.clips.idle.down[0]?.rows ?? null;
  const hint = !!s && !real && s.phase === 'mine' && s.pot >= CHOICE_HINT && s.stats.withdrawn === 0 && s.stats.staked === 0;
  const combo = s ? comboLevel(s) : 0;
  const soundOn = s?.sound ?? saved.sound;
  const bets = ledger ? ledger.betsWon + ledger.betsLost : s ? s.stats.betsWon + s.stats.betsLost : 0;
  const stakeText = real ? rfText(potWei) : fmt(s?.pot ?? 0);
  const realData = ledger ? {
    'data-pot-wei': potWei.toString(), 'data-shown': shown?.toString() ?? '', 'data-baseline': ledger.baseline.toString(), 'data-bonus': ledger.bonus.toString(),
    'data-withdrawn-wei': ledger.withdrawn.toString(), 'data-burned-wei': ledger.burned.toString(), 'data-claims': ledger.claims,
  } : {};
  return <section className={`mine${reduced ? ' calm' : ''}`} lang={lang} aria-label="Rare Mine">
    <header>
      <div className="brand"><h1>RARE <span>MINE</span></h1><small>{tt('きみの Friendが ほる コイン鉱山', 'Your Friend digs for coins')}</small></div>
      <div className="status">{friendRows && <Portrait rows={friendRows} label={label} />}<b>{label}</b></div>
      <div className="top-actions">
        <button onClick={toggleSound} disabled={!s} aria-pressed={soundOn} aria-label={tt('サウンド', 'Sound')} data-testid="sound">♪ {soundOn ? 'on' : 'off'}</button>
        <button onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')} data-testid="lang">{lang === 'ja' ? 'English' : '日本語'}</button>
        {started && <button disabled={paused} aria-label={tt('一時停止', 'Pause')} onClick={pauseNow} data-testid="pause">Ⅱ</button>}
      </div>
    </header>
    <div className="stage-wrap" ref={wrap}><div className="stage" style={{ ['--ar' as string]: SCENE_W / sceneH }} data-testid="screen" data-started={String(started)}
      data-mode={s?.mode ?? 'title'} data-decision={decision.mode === 'practice' ? `practice:${decision.reason}` : decision.mode}
      data-reads={reader.reads} data-failures={reader.failures} data-rate={reader.feed.rate?.toString() ?? ''} {...realData}
      data-phase={s?.phase ?? 'title'} data-pot={s?.pot ?? 0} data-safe={s?.safe ?? 0}
      data-streak={s?.streak ?? 0} data-mined={s?.stats.mined ?? 0} data-withdrawn={s?.stats.withdrawn ?? 0} data-burned={s?.stats.burned ?? 0}
      data-best={ledger?.bestStreak ?? s?.stats.bestStreak ?? 0} data-won={ledger?.betsWon ?? s?.stats.betsWon ?? 0} data-lost={ledger?.betsLost ?? s?.stats.betsLost ?? 0}
      data-strikes={s?.stats.strikes ?? 0} data-combo={combo} data-depth={s?.depth ?? 0} data-betseed={ledger?.betSeed ?? s?.betSeed ?? ''}
      data-last={s?.last ? (s.last.win ? 'win' : 'lose') : ''} data-lastid={s?.last?.id ?? 0}
      data-sound={String(soundOn)} data-paused={String(!active)} data-saves={saves} data-lang={lang} data-reduced={String(reduced)}
      onPointerDown={stagePress}>
      <canvas ref={canvas} width={SCENE_W} height={sceneH} role="img"
        aria-label={real ? tt(`${label}が本物の報酬を採掘している。`, `${label} is mining your real rewards.`) : tt(`${label}が岩をほっている。タップで追加の一撃。`, `${label} is mining. Tap the rock to strike.`)} />
      {s && <div className="hud">
        {real ? <RealHud lang={lang} pot={potWei} streak={s.streak} rate={reader.feed.rate} claimable={reader.last?.rf ?? 0n} weth={reader.last?.weth ?? 0n} stale={reader.failures > 0} />
          : <div className="pot"><small>{tt('ポット', 'POT')}{s.streak > 0 && <em> ×{2 ** s.streak}</em>}</small>
            <Odometer text={coinText(s.pot)} value={String(s.pot)} label={tt(`ポット ${fmt(s.pot)}`, `Pot ${fmt(s.pot)}`)} testId="pot" /></div>}
        <ComboMeter level={combo} max={COMBO_MAX} lang={lang} />
      </div>}
      {s && <StageNote lang={lang} real={real} />}
      {hint && active && <p className="nudge">{tt('ポットがたまった！ 引き出す？ 倍かけ？', 'Nice pile! Bank it, or double it?')}</p>}
      {toast && active && <p className="toast" aria-hidden="true">{pick(lang, toast.text)}</p>}
      {banner && s?.phase === 'mine' && <ResultBanner lang={lang} {...banner} />}
      {s?.phase === 'confirm' && <ConfirmPanel lang={lang} stake={stakeText} win={real ? rfText(potWei * 2n) : fmt((s?.pot ?? 0) * 2)} live={real}
        note={real ? BET_SIM_NOTE : undefined} onConfirm={doConfirm} onCancel={doCancel} />}
      {s?.phase === 'roll' && <RollPanel lang={lang} stake={real && rolling ? rfText(rolling.stake) : fmt(s.roll?.stake ?? 0)} reduced={reduced} onSkip={() => act(skipRoll)} />}
      {(!started || error) && <Title lang={lang} label={label} rows={friendRows} ready={ready} error={error} loadError={loadError} paused={paused}
        decision={decision} last={reader.last} rate={reader.feed.rate} busy={rewards.busy} practice={saved.practice} real={saved.real}
        onRetryFriend={() => setAttempt(v => v + 1)} onRetrySave={() => { setLoadError(false); setAttempt(v => v + 1); }}
        onRetryRewards={rewards.retry} onStartReal={startReal} onStartPractice={startPractice} />}
      {started && manualPause && <div className="paused">
        <h2>PAUSED</h2><p>{tt('P / Esc で再開', 'Press P / Esc to resume')}</p>
        <div className="choices">
          <button onClick={() => setManualPause(false)} disabled={paused}>{tt('再開する', 'Resume')}</button>
          <button onClick={() => setReduced(v => !v)} aria-pressed={reduced} data-testid="motion">{reduced ? tt('動き: ひかえめ', 'Motion: reduced') : tt('動き: ふつう', 'Motion: full')}</button>
        </div>
      </div>}
    </div></div>
    {s && <ActionBar lang={lang} real={real} pot={real ? fmtRF(potWei) : fmt(s.pot)} hint={hint} streak={s.streak} onWithdraw={doWithdraw} onBet={doBet}
      canWithdraw={active && s.phase !== 'roll' && (real ? potWei > 0n : s.pot > 0)}
      canBet={active && (s.phase === 'confirm' || (real ? !!ledger && shown !== null && s.phase === 'mine' && canRealBet(ledger, shown) : s.phase === 'mine' && s.pot > 0 && s.streak < MAX_STREAK))} />}
    {s && <StatsPanel lang={lang} rows={ledger ? realRows(ledger, reader.last?.rf ?? 0n, reader.feed.rate, lang) : practiceRows(s)}
      note={real ? REAL_STATS_NOTE : PRACTICE_NOTE} canShare={!!client.shareScore && bets > 0} sharing={sharing || paused} onShare={share}>
      <ModeBar lang={lang} real={real} decision={decision} failures={reader.failures} busy={rewards.busy} onRetry={rewards.retry} onGoReal={startReal} />
    </StatsPanel>}
    <p className="sr-only" role="status" aria-live="polite">{announcement(lang, banner, toast)}</p>
    <footer>
      <span>{tt('タップ/Space: ほる · W: 引き出す · B: 倍かけ · Y/N: 決定/やめる · M: 音 · P: 一時停止', 'Tap/Space: strike · W: withdraw · B: bet · Y/N: confirm/cancel · M: sound · P: pause')}</span>
      <span>{pick(lang, real ? BET_SIM_NOTE : SIM_NOTE)}</span>
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
