import { useEffect, useRef, useState } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import type { GameSnapshot } from '@rarefriends/friendsdk/game';
import { createFriendReader, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { createFriendSoundKit, type FriendSoundKit, type FriendSoundCue } from '@rarefriends/friendsdk/sounds';
import { Town, FriendPixels, ParcelIcon } from './art.js';
import { createRun, advance, travel, deliver, takeShortcut, neighbours, NODES, MISSIONS, type Run, type NodeId, type Language } from './model.js';
import { makePostcard } from './postcard.js';
import founder from './assets/genesis-597.svg';
import './style.css';

export default function LostAndFound(props: GameComponentProps) {
  return <PostalGame key={String(props.friendId)} {...props}/>;
}
function PostalGame({ friendId, client, paused }: GameComponentProps) {
  const [lang, setLang] = useState<Language>('en');
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [mission, setMission] = useState(0), [run, setRun] = useState<Run | null>(null);
  const [cards, setCards] = useState<number[]>([]), [postcard, setPostcard] = useState('');
  const [settings, setSettings] = useState(false), [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(false), [busy, setBusy] = useState(false), [walking, setWalking] = useState(false);
  const [shortcut, setShortcut] = useState(false), [meter, setMeter] = useState(0);
  const sound = useRef<FriendSoundKit | null>(null), epoch = useRef(0), purchaseLock = useRef(false);
  const travelLock = useRef(false), shortcutStart = useRef(0);
  const t = (en: string, ja: string) => lang === 'en' ? en : ja;

  useEffect(() => {
    const version = ++epoch.current;
    setError(''); setSnapshot(null); setSprites(null); setRun(null); setPostcard(''); setCards([]); setBusy(false); purchaseLock.current = false;
    if (client.mode !== 'preview') { setError('This entry supports simulated play only.'); return; }
    void Promise.all([client.read(), createFriendReader().read(friendId)]).then(([state, art]) => {
      if (version !== epoch.current) return;
      if (state.friendId !== friendId) throw new Error('The selected Friend does not match this session.');
      setSnapshot(state); setSprites(art);
    }).catch(cause => { if (version === epoch.current) setError(cause instanceof Error ? cause.message : 'Could not load your Friend.'); });
    return () => { epoch.current++; };
  }, [client, friendId, retry]);
  useEffect(() => {
    sound.current = createFriendSoundKit({ muted: true });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches); update(); media.addEventListener('change', update);
    return () => { sound.current?.dispose(); media.removeEventListener('change', update); };
  }, []);
  useEffect(() => {
    if (!walking) return;
    const timer = window.setTimeout(() => { travelLock.current = false; setWalking(false); }, reduced ? 100 : 480);
    return () => clearTimeout(timer);
  }, [walking, reduced]);
  useEffect(() => {
    let last = performance.now();
    const tick = window.setInterval(() => {
      const now = performance.now(), elapsed = now - last; last = now;
      if (paused || settings || document.hidden) return;
      setRun(value => value ? advance(value, elapsed) : value);
      if (shortcut) setMeter((Math.sin((now - shortcutStart.current) / 450) + 1) / 2);
    }, 50);
    const visibility = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', visibility); };
  }, [paused, settings, shortcut]);
  useEffect(() => {
    if (run?.phase === 'delivered') {
      setCards(previous => previous.includes(run.mission) ? previous : [...previous, run.mission]);
      sound.current?.play('reward');
    }
    if (run?.phase !== 'playing') setShortcut(false);
  }, [run?.phase, run?.mission]);
  useEffect(() => {
    if ((!settings && !postcard) || paused) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('.lf-overlay [role="dialog"]');
    if (!dialog) return;
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')];
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSettings(false); setPostcard(''); return; }
      if (event.key !== 'Tab') return;
      const all = controls(), first = all[0], last = all.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [settings, postcard, paused]);

  const cue = (name: FriendSoundCue = 'select') => { void sound.current?.unlock(); sound.current?.play(name); };
  const blocked = paused || settings || busy;
  const go = (node: NodeId) => {
    if (blocked || travelLock.current || shortcut || run?.phase !== 'playing') return;
    if (!neighbours(run.node).includes(node)) return;
    travelLock.current = true; setWalking(true); cue(); setRun(value => value ? travel(value, node) : value);
  };
  async function buyStamp() {
    if (blocked || purchaseLock.current || !snapshot || snapshot.consumables > 0n) return;
    purchaseLock.current = true; setBusy(true); setError(''); const version = epoch.current;
    try {
      await client.buy(1n);
      const state = await client.read();
      if (version === epoch.current) { setSnapshot(state); cue('purchase'); }
    } catch (cause) {
      if (version === epoch.current) {
        setError(cause instanceof Error ? cause.message : 'The simulated purchase did not complete.');
        // Reconcile after errors so a completed purchase is never silently charged twice.
        try { const state = await client.read(); if (version === epoch.current) setSnapshot(state); }
        catch { if (version === epoch.current) setSnapshot(null); }
      }
    } finally { if (version === epoch.current) { purchaseLock.current = false; setBusy(false); } }
  }
  if (!snapshot || !sprites) return <div className="lf-loading"><span className="postal-mark">✉</span><h1>Lost & Found</h1><p role={error ? 'alert' : 'status'}>{error || t('Your Friend is getting ready for the morning post…', 'あなたのFriendが、朝の配達を準備しています…')}</p>{error && <button type="button" onClick={() => setRetry(n => n + 1)} disabled={paused}>{t('Try again', 'もう一度')}</button>}<small>{t('Verified Friend · Simulated economy', '本人確認済みのFriend・経済はシミュレーション')}</small></div>;
  const gold = snapshot.consumables > 0n;
  const currentMission = MISSIONS[run?.mission ?? mission];
  const playing = run?.phase === 'playing';
  const here = NODES.find(node => node.id === (run?.node ?? 'post'))!;
  const feedback = run?.feedback === 'wrong' ? t('Not this address. Read the clue again. −8s', 'この住所ではないみたい。手がかりをもう一度。−8秒') : run?.feedback === 'miss' ? t('A gust of wind! Back to the square. −6s', '強い風！ 広場に戻ろう。−6秒') : run?.feedback === 'shortcut' ? t('Perfect timing. A little help from the wind.', 'いいタイミング。風が背中を押してくれた。') : run?.feedback === 'street' ? t('Find a house before delivering.', '建物のある場所で届けよう。') : '';
  const start = () => { if (blocked) return; cue('action-start'); setPostcard(''); setError(''); setShortcut(false); setRun(createRun(mission, String(friendId))); };
  const returnHome = () => { if (blocked) return; setRun(null); setPostcard(''); setError(''); setShortcut(false); };
  return <section className={`lf-game ${reduced ? 'reduced' : ''} ${run ? 'has-run' : ''}`} aria-label="Rare Friends: Lost & Found" aria-busy={busy}>
    <div className="lf-toolbar" inert={settings || Boolean(postcard) || paused || undefined}>
      <div className="brand"><span className="brand-envelope">✉</span><span>LOST & FOUND<small>RARE FRIENDS POSTAL SERVICE</small></span></div>
      <div className="toolbar-actions"><span className="demo-balance">{Number(snapshot.rfBalance / (10n ** 18n))} demo RF</span><button type="button" disabled={paused} onClick={() => setLang(lang === 'en' ? 'ja' : 'en')}>{lang === 'en' ? '日本語' : 'English'}</button><button type="button" aria-label={t('Settings', '設定')} disabled={paused} onClick={() => setSettings(true)}>☷</button></div>
    </div>
    <div className="lf-body" inert={settings || Boolean(postcard) || paused || undefined}>
      <div className="map-side">
        <div className="map-heading"><span className="eyebrow">{t('THE MORNING AFTER THE RAIN', '雨が上がった、次の朝。')}</span><h1>{t('Good things find', 'たいせつなものは、')}<br/><em>{t('their way home.', 'きっと届く。')}</em></h1><p>{t('A small delivery. A very big feeling.', '小さな配達が、心をあたためる。')}</p></div>
        <Town node={run?.node ?? 'post'} sprites={sprites} lang={lang} active={Boolean(playing && !blocked && !walking && !shortcut)} onTravel={go} reduced={reduced}/>
        <div className="founder-note"><img src={founder} alt="Genesis #597"/><span><b>Genesis #597</b><small>{t('“Nobody should stay lost forever.”', '「ずっと迷子のままなんて、させないよ」')}</small></span><span className="founder-sign">The founder</span></div>
      </div>
      <aside className="delivery-side">
        <div className="courier-id"><FriendPixels sprites={sprites} size={38}/><span><small>{t('YOUR VERY OWN COURIER', 'あなたの配達員')}</small><b>Friend #{String(friendId)}</b></span><span className="id-badge">{sprites.familyName}</span></div>
        {!run ? <>
          <div className="section-label"><span>01 / {t('THE LOST PROPERTY DESK', '忘れものの窓口')}</span><span>{cards.length}/3 ✉</span></div>
          <h2>{t('Someone’s missing this.', 'だれかが、探している。')}</h2>
          <p className="soft-copy">{t('Pick a parcel. Follow its clue. Bring a little piece of someone’s world back.', '荷物を選び、手がかりをたどろう。だれかの日常に、たいせつなものを返すために。')}</p>
          <div className="mission-tabs" aria-label={t('Choose a delivery', '配達を選ぶ')}>{MISSIONS.map((m, i) => <button type="button" key={m.icon} aria-pressed={mission === i} disabled={blocked} onClick={() => { setMission(i); cue(); }}><ParcelIcon kind={m.icon} size={30}/><span>{String(i+1).padStart(2,'0')}{cards.includes(i) ? ' ✓' : ''}</span></button>)}</div>
          <article className="parcel-card"><div className="parcel-top"><span className="eyebrow">{t('FOUND & WAITING', '持ち主を待っています')}</span><ParcelIcon kind={currentMission.icon} size={44}/></div><h3>{currentMission.item[lang]}</h3><p>{currentMission.title[lang]}</p><div className="perforation"/><span className="small-label">{t('A NOTE FROM ITS OWNER', '持ち主からの手がかり')}</span><blockquote>{currentMission.clue[lang]}</blockquote></article>
          <button className="primary" type="button" disabled={blocked} onClick={start}>{t('Take this delivery', 'この配達を引き受ける')}<span>↗</span></button>
          <p className="microcopy">{t('90 seconds · Free to play · No signatures', '90秒・無料で遊べます・署名不要')}</p>
          <button type="button" className={`stamp-offer ${gold ? 'owned' : ''}`} disabled={blocked || gold || snapshot.rfBalance < 2n * 10n ** 18n} onClick={() => void buyStamp()}><span>✧</span>{gold ? t('Gold-foil stamp selected', '金箔切手を選択中') : t('Gold-foil stamp · 2 demo RF', '金箔切手・2 demo RF')}</button><p className="simulation-note">{t('Optional postcard style. Simulated purchase. Resets on reload.', 'ポストカードの見た目だけが変わります。購入は模擬。再読み込みでリセット。')}</p>
        </> : playing ? <>
          <div className="section-label"><span>{t('ON YOUR WAY', '配達中')}</span><strong className={run.remaining < 20000 ? 'urgent' : ''} data-testid="timer">{Math.ceil(run.remaining/1000)}s</strong></div>
          <h2>{currentMission.item[lang]}</h2><blockquote className="active-clue">{currentMission.clue[lang]}</blockquote>
          <div className="location-label"><span className="small-label">{t('YOU ARE HERE', '現在地')}</span><h3>{here.name[lang]}</h3></div>
          <div className="route-options">{neighbours(run.node).map(id => <button key={id} type="button" disabled={blocked || walking || shortcut} onClick={() => go(id)} aria-label={`${t('Go to', '移動：')} ${NODES.find(n => n.id === id)!.name[lang]} · route`}><span>{NODES.find(n => n.id === id)!.name[lang]}</span><small>−2.5s ↗</small></button>)}</div>
          {run.node === 'plaza' && !shortcut && <button className="wind-button" type="button" disabled={blocked || walking} onClick={() => { shortcutStart.current = performance.now(); setMeter(.5); setShortcut(true); }}>{t('Try the wind shortcut', '風の近道に挑戦')} ↝</button>}
          {shortcut && <div className="shortcut"><p>{t('Send it when the marker is in the green.', 'マーカーが緑の範囲に来たら押そう。')}</p><div className="timing-track"><span/><i style={{left:`${meter*100}%`}}/></div><button type="button" className="primary" disabled={blocked} onClick={() => { if (blocked) return; cue(); setRun(value => value ? takeShortcut(value, meter) : value); setShortcut(false); }}>{t('Catch the breeze', '風に乗る')}</button><button className="text-button" type="button" onClick={() => setShortcut(false)}>{t('Take the streets instead', '通りを歩く')}</button><small>{t('A miss costs 6 seconds. No RF at stake.', '失敗すると6秒減ります。RFは使いません。')}</small></div>}
          {!shortcut && <button type="button" className="primary" disabled={blocked || walking || !here.address} onClick={() => { if (blocked || walking) return; cue('action-ready'); setRun(value => value ? deliver(value) : value); }}>{t('Deliver here', 'ここに届ける')}<span>✉</span></button>}
          <p className="feedback" role="status">{feedback || t('Tap a connected stop on the map, or choose a street.', '地図の次の場所を押すか、行き先のボタンを選ぼう。')}</p><button type="button" className="text-button" disabled={blocked} onClick={returnHome}>{t('Return to the post office', '郵便局に戻る')}</button>
        </> : run.phase === 'delivered' ? <>
          <div className="section-label"><span>{t('DELIVERED WITH LOVE', '想いまで、届いた。')}</span><span className="stars">{'★'.repeat(run.stars)}{'☆'.repeat(3-run.stars)}</span></div>
          <h2 className="ending-title">{t('A little less lost.', 'もう、迷子じゃない。')}</h2><div className="thank-you"><ParcelIcon kind={currentMission.icon} size={60}/><blockquote>{currentMission.ending[lang]}</blockquote><small>— {here.name[lang]}</small></div>
          <p className="soft-copy">{t(`You brought it home, Friend #${friendId}. Keep a little memory of today.`, `Friend #${friendId}、届けてくれてありがとう。今日の思い出を一枚に。`)}</p>
          <button type="button" className="primary" disabled={blocked} onClick={() => { try { setPostcard(makePostcard(run, sprites, gold)); cue('reveal-common'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not make postcard.'); } }}>{t('Make a postcard', 'ポストカードを作る')}<span>✉</span></button>
          <button type="button" className="text-button" disabled={blocked} onClick={returnHome}>{t('Back to the post office', '郵便局へ戻る')}</button>
        </> : <><div className="section-label">{t('THE POST CAN WAIT', '明日も、郵便は届く。')}</div><h2>{t('Even couriers get lost.', '配達員だって、迷う日がある。')}</h2><p className="soft-copy">{t('Your parcel is safe. Take a breath, read the clue, and try another route.', '荷物は無事だよ。ひと息ついて、手がかりを読み直そう。別の道が見つかるはず。')}</p><button type="button" className="primary" disabled={blocked} onClick={start}>{t('Try this delivery again', 'もう一度届けてみる')}</button><button type="button" className="text-button" onClick={returnHome}>{t('Back to the post office', '郵便局へ戻る')}</button></>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="postal-footer"><span>✳ {t('A little kindness goes a long way.', 'やさしさを、少し遠くまで。')}</span><small>VIBEATHON ’26 · SIMULATED</small></div>
      </aside>
    </div>
    {settings && <div className="lf-overlay"><div className="settings-panel" role="dialog" aria-modal="true" aria-label={t('Settings', '設定')}><span className="eyebrow">POST OFFICE NOTES</span><h2>{t('Take a breather.', 'ひと休みしよう。')}</h2><p>{t('The delivery clock is paused.', '配達の時計は止まっています。')}</p><button type="button" aria-pressed={!muted} onClick={() => { const next = !muted; setMuted(next); sound.current?.setMuted(next); if(!next) cue(); }}>{muted ? t('Sound off', '音：オフ') : t('Sound on', '音：オン')}</button><label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)}/>{t('Reduce motion', '動きを減らす')}</label><p>{t('Choose connected stops with touch, mouse, or Tab + Enter. Every street takes 2.5 seconds, in addition to the running clock. A wrong address costs 8 seconds.', 'タップ、マウス、Tab＋Enterで次の場所を選びます。時計の経過に加え、移動で2.5秒、誤配で8秒減ります。')}</p><p>{t('The gold stamp changes postcards only. All RF is simulated. Progress lasts for this session. Town stories are original fiction, not official Rare Friends lore.', '金箔切手は見た目だけを変えます。RFはすべて模擬。進行状況はこのセッション限りです。物語は独自のフィクションです。')}</p><button type="button" className="primary" disabled={paused} onClick={() => setSettings(false)}>{t('Back to the mail', '配達に戻る')}</button></div></div>}
    {postcard && <div className="lf-overlay postcard-overlay"><div className="postcard-panel" role="dialog" aria-modal="true" aria-label={t('Your postcard', 'あなたのポストカード')}><span className="eyebrow">{t('SOMETHING TO KEEP', '今日を、取っておこう。')}</span><img src={postcard} alt="Your delivery postcard"/><p>{t('Long-press / right-click the image to save, or take a screenshot.', '画像を長押し・右クリックで保存。またはスクリーンショットで残せます。')}</p><p className="simulation-note">{t('A personal keepsake, not an NFT. Sharing is manual.', '思い出の画像です。NFTではありません。共有は手動で行ってください。')}</p><button type="button" className="primary" disabled={paused} onClick={returnHome}>{t('Back to the post office', '郵便局へ戻る')}</button></div></div>}
    {busy && <div className="busy-note" role="status">{t('Confirm the simulated purchase in the wallet panel.', 'ウォレットパネルで模擬購入を確認してください。')}</div>}
  </section>;
}
