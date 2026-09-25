import { useEffect, useRef, useState } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import type { GameSnapshot, FriendRewardsSnapshot } from '@rarefriends/friendsdk/game';
import { createFriendReader, createGenesisReader, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { newLife, restore, rename, act, depart, choose, returnHome, build, greeting, soundOn, setSound, PLACES, PROJECTS, type Life, type Place, type Card } from './life.js';
import { CUES, createSound, cueFor } from './sound.js';
import { LifeScene, memoryImage } from './life-art.js';
import {RewardPanel,PiggyIcon} from './reward-panel.js';
import {tokenAmount} from './reward-format.js';
import {translate} from './life-i18n.js';
import './life.css';
export default function IslandLife(props:GameComponentProps){return <LifeGame key={`${props.collection ?? "generations"}:${props.friendId}`} {...props}/>;}
function LifeGame({friendId,collection="generations",client,paused}:GameComponentProps){
 const [life,setLife]=useState<Life|null>(null),[sprites,setSprites]=useState<GenerationSprites|null>(null);
 const language=life?.language??'ja';
 const t=(text:string)=>translate(text,language);
 const [error,setError]=useState(''),[retry,setRetry]=useState(0),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
 const [tab,setTab]=useState('home'),[food,setFood]=useState(false),[reaction,setReaction]=useState(''),[bubble,setBubble]=useState('');
 const [modal,setModal]=useState<'settings'|'card'|'rewards'|null>(null),[cardImage,setCardImage]=useState(''),[nickname,setNickname]=useState('');
 const [realRewards,setRealRewards]=useState<FriendRewardsSnapshot|null>(null);
 const [economy,setEconomy]=useState<GameSnapshot|null>(null);
 const [loaded,setLoaded]=useState(false),[corrupt,setCorrupt]=useState(false);
 const lifeRef=useRef<Life|null>(null),epoch=useRef(0),lock=useRef(false),dialogRef=useRef<HTMLDivElement>(null);
 const [sfx]=useState(()=>createSound(CUES)),toggleSoundRef=useRef<()=>void>(()=>{});
 const sound=life?soundOn(life):true;
 // Sound: context on the first gesture, silent while muted, paused or hidden; M toggles (not while typing or in a dialog).
 useEffect(()=>{sfx.setEnabled(sound);},[sfx,sound]);
 // pagehide covers iOS app switches and the back-forward cache, where visibilitychange can be skipped.
 useEffect(()=>{const sync=()=>sfx.setSuspended(paused||document.hidden);const hide=()=>sfx.setSuspended(true);sync();document.addEventListener('visibilitychange',sync);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',sync);
  return()=>{document.removeEventListener('visibilitychange',sync);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',sync);};},[sfx,paused]);
 useEffect(()=>{
  const unlock=()=>{sfx.unlock();};const gestures=['pointerdown','pointerup','touchend','keydown','click'] as const;gestures.forEach(g=>window.addEventListener(g,unlock,true));
  const key=(e:KeyboardEvent)=>{const typing=e.target instanceof HTMLElement&&(e.target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
   if(e.key.toLowerCase()==='m'&&!typing&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('[role="dialog"]'))toggleSoundRef.current();};
  window.addEventListener('keydown',key);
  return()=>{gestures.forEach(g=>window.removeEventListener(g,unlock,true));window.removeEventListener('keydown',key);sfx.close();};
 },[sfx]);
 useEffect(()=>{
  const version=++epoch.current;lock.current=false;lifeRef.current=null;setSaving(false);setSaveError('');setBubble('');setModal(null);setRealRewards(null);setError('');setLife(null);setSprites(null);setLoaded(false);setCorrupt(false);
  void (async()=>{
   if(client.mode!=='preview'||!client.loadLocal||!client.saveLocal)throw new Error('この版では保存機能つきのプレビューが必要です。ページを再読み込みしてください。');
   const snapshot=await client.read();if(version===epoch.current)setEconomy(snapshot);if(snapshot.friendId!==friendId)throw new Error('Friendが変わりました。接続し直してください。');
   const raw=await client.loadLocal();const art=await (collection==='genesis'?createGenesisReader():createFriendReader()).read(friendId);
   if(version!==epoch.current)return;
   const saved=restore(raw,String(friendId));
   if(raw&&!saved){setCorrupt(true);setSprites(art);throw new Error('保存データを読み取れませんでした。元のデータはそのまま残しています。');}
   const next=saved??newLife(String(friendId));lifeRef.current=next;setLife(next);setSprites(art);setNickname(next.name);setLoaded(Boolean(saved));
  })().catch(e=>{if(version===epoch.current)setError(e instanceof Error?e.message:'読み込みに失敗しました。');});
  return()=>{epoch.current++;};
 },[client,friendId,collection,retry]);
 useEffect(()=>{if(!reaction)return;const id=setTimeout(()=>setReaction(''),1800);return()=>clearTimeout(id);},[reaction]);
 useEffect(()=>{
  if(!modal)return;const before=document.activeElement as HTMLElement|null;const d=dialogRef.current;
  const buttons=()=>Array.from(d?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')??[]);buttons()[0]?.focus();
  const handle=(e:KeyboardEvent)=>{if(paused)return;if(e.key==='Escape')setModal(null);if(e.key==='Tab'){const a=buttons(),first=a[0],last=a.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',handle);return()=>{document.removeEventListener('keydown',handle);before?.focus();};
 },[modal,paused]);
 async function commit(next:Life,animation='happy'){
  if(paused||lock.current||!client.saveLocal)return;lock.current=true;setSaving(true);setSaveError('');const version=epoch.current;
  lifeRef.current=next;setLife(next);setBubble(next.message);setReaction(animation);
  try{await client.saveLocal(JSON.stringify(next));if(version===epoch.current)setLoaded(true);}
  catch(e){if(version===epoch.current)setSaveError(e instanceof Error?e.message:'保存できませんでした。');}
  finally{if(version===epoch.current){lock.current=false;setSaving(false);}}
 }
 async function buyFrame(){
  if(paused||lock.current||!economy||economy.consumables>0n)return;const version=epoch.current;lock.current=true;setSaving(true);
  try{await client.buy(1n);const current=await client.read();if(version===epoch.current)setEconomy(current);}
  catch{if(version===epoch.current){setBubble('額縁の模擬購入は完了しませんでした。');try{const current=await client.read();if(version===epoch.current)setEconomy(current);}catch{if(version===epoch.current)setEconomy(null);}}}
  finally{if(version===epoch.current){lock.current=false;setSaving(false);}}
 }
 const disabled=paused||saving||Boolean(saveError);
 if(!life||!sprites)return <div className="life-loading"><div className="loading-house">⌂</div><h1>OUR LITTLE ISLAND</h1><p role={error?'alert':'status'}>{t(error)||t("あなたのFriendがおうちを準備しています…")}</p>{error&&<button onClick={()=>setRetry(n=>n+1)}>{t("もう一度読み込む")}</button>}{corrupt&&sprites&&<button onClick={()=>{const s=newLife(String(friendId));setLife(s);lifeRef.current=s;setError('');}}>{t("新しい暮らしを始める（次の保存で上書き）")}</button>}</div>;
 const atHome=life.location==='home',place=atHome?null:PLACES[life.location as Exclude<Place,'home'>];
 const change=(fn:(s:Life)=>Life,animation='happy')=>{if(disabled||!lifeRef.current)return;const next=fn(lifeRef.current);if(next===lifeRef.current)return;const cue=cueFor(lifeRef.current,next);if(cue)sfx.play(cue);void commit(next,animation);};
 // Saved with the island like the language; it waits while saving or paused, like every other change.
 toggleSoundRef.current=()=>{if(disabled||!lifeRef.current)return;const on=!soundOn(lifeRef.current);sfx.setEnabled(on);if(on)sfx.unlock();change(s=>setSound(s,on),'');};
 const openBank=()=>{sfx.play('coin');setModal('rewards');};
 const showCard=(card:Card)=>{try{setCardImage(memoryImage(card,life,sprites,language));setModal('card');sfx.play('confirm');}catch(e){setBubble(e instanceof Error?e.message:t("画像を作れませんでした。"));}};
 const level=life.bond<10?t("はじめまして"):life.bond<30?t("気になるともだち"):life.bond<65?t("なかよし"):life.bond<110?t("大切な相棒"):t("家族みたいなふたり");
 // Long-press on the scene and buttons should not open the browser menu; the name field and the postcard image (long-press to save) keep theirs.
 const noMenu=(e:React.MouseEvent)=>{if(!(e.target instanceof HTMLInputElement||e.target instanceof HTMLImageElement))e.preventDefault();};
 return <section className={`life-app ${paused?'is-paused':''} ${economy&&economy.consumables>0n?'gold-frame':''}`} lang={language} aria-label="Rare Friends Island Life" onContextMenu={noMenu}>
 <div className="life-content" inert={Boolean(modal)||paused||undefined}>
 <div className="life-scroll">
 <header className="life-header"><div><span className="tiny">RARE FRIENDS / OUR LITTLE ISLAND</span><h1>{language==='en'?`${life.name}’s island life.`:`${life.name}と、島ぐらし。`}</h1></div><button type="button" className="language-toggle" disabled={disabled} aria-label={language==='ja'?'English':'日本語'} onClick={()=>change(s=>({...s,language:language==='ja'?'en':'ja'}),'')}>{language==='ja'?'English':'日本語'}</button><button type="button" className={`sound-toggle${sound?'':' off'}`} disabled={disabled} aria-pressed={sound} aria-label={t("効果音")} title={t("効果音 オン/オフ（M）")} aria-keyshortcuts="M" onClick={()=>toggleSoundRef.current()}><span aria-hidden="true">♪</span></button><button className="gear" aria-label={t("設定")} onClick={()=>{setNickname(life.name);setModal('settings');sfx.play('confirm');}}>⚙</button></header>
 <div className="life-layout"><section className="companion">
 <div className="day-strip"><span>☀ <b>{language==='en'?`Day ${life.day}`:`${life.day}日目`}</b></span><span>♡ {level}</span><span className="save-state" role="status">{saving?t("保存中…"):saveError?t("未保存"):loaded?t("保存済み"):t("はじめての朝")}</span></div>
 <LifeScene language={language} onBank={openBank} bankDisabled={disabled} life={life} sprites={sprites} reaction={paused?'':reaction} onPet={()=>{if(disabled)return;setBubble(greeting(life));setReaction(reaction?'':'happy');sfx.play('chirp');}}/>
 <div className="speech"><span className="speech-name">{life.name}</span><p key={bubble}>{t(bubble||greeting(life))}</p></div>
 <div className="care-stats">{[[t("おなか"),life.hunger,'🍞'],[t("げんき"),life.energy,'☀'],[t("なかよし"),Math.min(100,life.bond),'♡']].map(([label,value,icon])=><div key={String(label)}><span>{icon} {t(String(label))}</span><meter min="0" max="100" value={Number(value)} aria-label={t(String(label))}/><small>{value}/100</small></div>)}</div>
 <div className="friend-caption">{collection==='genesis'?'Genesis':'Friend'} #{String(friendId)} <span>·</span>{t("あなたと暮らす、世界にひとりのFriend")}</div>
 </section>
 <section className="life-panel" aria-label={t("暮らしの選択")}>
 {!atHome&&place?<><div className="panel-eyebrow">A LITTLE ADVENTURE</div><h2>{place.icon} {t(place.name)}</h2><p className="lead">{t(place.subtitle)}</p><div className="event-story"><span>{life.choice===null?t("道の途中で…"):t("ふたりの、今日のできごと")}</span><p>{t(life.choice===null?place.question:life.message)}</p></div>
 {life.choice===null?<div className="choice-list">{place.choices.map((label,i)=><button aria-label={t(String(label))} key={label} disabled={disabled} onClick={()=>change(s=>choose(s,i))}>{t(label)}<span>↗</span></button>)}</div>:<><div className="souvenirs">{t("おみやげ")}<span>🪵 {life.bag.wood}</span><span>🐚 {life.bag.shells}</span><span>🌱 {life.bag.seeds}</span></div><button aria-label={t("おみやげを持って帰る")} className="main-action" disabled={disabled} onClick={()=>{change(returnHome,'walk');setTab('memories');}}>{t("おみやげを持って帰る")}<span>⌂</span></button><p className="hint">{t("帰ったら、今日の思い出がアルバムに残ります。")}</p></>}</>
 :tab==='home'?<><div className="panel-eyebrow">A DAY WITH YOU</div><h2>{t("今日は、何しよう？")}</h2><p className="lead">{t("いそがなくていい。ふたりのペースで。")}</p>
 {life.gardenReady&&<button aria-label={t("お花を摘む")} className="garden-ready" disabled={disabled} onClick={()=>change(s=>act(s,'harvest'))}>{t("🌷 お花を摘む")}<small>{t("花畑が咲いたよ！")}</small></button>}
 <div className="home-actions"><button aria-label={t("ごはん")} disabled={disabled} onClick={()=>{setFood(!food);sfx.play('confirm');}} aria-expanded={food}><span>🍞</span><b>{t("ごはん")}</b><small>{t("いっしょに、いただきます")}</small></button><button aria-label={t("おさんぽ")} disabled={disabled||life.energy<15} onClick={()=>change(s=>act(s,'walk'),'walk')}><span>🐾</span><b>{t("おさんぽ")}</b><small>{t("おうちのまわりを、てくてく")}</small></button><button aria-label={t("おやすみ")} disabled={disabled} onClick={()=>change(s=>act(s,'sleep'),'sleep')}><span>☾</span><b>{t("おやすみ")}</b><small>{t("次の朝へ。げんきを回復")}</small></button></div>
 {food&&<div className="food-menu"><p>{t("何を食べよう？")}<small>{t("好きな味を、見つけてみて。")}</small></p>{([['toast','🍞',t("焼きたてトースト")],['berry','🫐',t("摘みたてベリー")],['soup','🥣',t("あったかスープ")]] as const).map(([id,icon,label])=><button key={id} disabled={disabled||life.hunger>=90} onClick={()=>{change(s=>act(s,id),'eat');setFood(false);}}>{icon} {t(String(label))}</button>)}{life.hunger>=90&&<p>{t("いまはおなかいっぱい。またあとで。")}</p>}</div>}
 <button type="button" className="home-piggy" aria-label={t("貯金箱を見る")} disabled={disabled} onClick={openBank}><PiggyIcon/><span><b>{t("この家の、貯金箱。")}</b><small>{realRewards ? t(`前回確認・未受取 ${tokenAmount((realRewards.genesis??realRewards).claimableRF)} RF · ${realRewards.genesis?`Genesis #${realRewards.genesis.tokenId}`:`${collection==='genesis'?'Genesis':'Friend'} #${friendId}`}`) : t("NFTの本当のおこづかいを、のぞいてみよう。")}</small></span><i>↗</i></button><div className="daily-note"><span>{t("✎ ふたりのメモ")}</span><p>{t(life.journal[0]?.text??("まだ名前しか知らないふたり。ご飯を食べたり、外へ出たり。一緒の時間から始めよう。"))}</p></div>
 </>:tab==='outings'?<><div className="panel-eyebrow">POCKET FULL OF POSSIBILITIES</div><h2>{t("どこへ、出かけよう？")}</h2><p className="lead">{t("小さなおみやげと、帰ってくるおうち。")}</p><div className="destinations">{Object.entries(PLACES).map(([id,p])=>{const locked=id==='lighthouse'&&!life.projects.includes('bridge');return <button key={id} disabled={disabled||locked||life.energy<20} onClick={()=>change(s=>depart(s,id as Place),'walk')}><span className="destination-icon">{p.icon}</span><span><b>{t(p.name)}</b><small>{locked?t("橋をつくると行けるよ"):t(p.subtitle)}</small></span><i>{locked?t("鍵"):'↗'}</i></button>;})}</div><p className="hint">{t("お出かけはげんき20。")}{life.energy<20?t("おうちで「おやすみ」してから出かけよう。"):t("出先では、好きな過ごし方を選べます。")}</p></>
 :tab==='island'?<><div className="panel-eyebrow">LITTLE BY LITTLE</div><h2>{t("ぼくらの島を、育てよう。")}</h2><p className="lead">{t("拾ってきたものが、暮らしになっていく。")}</p><div className="materials"><span>{t("🪵 木")} {life.wood}</span><span>{t("🐚 貝")} {life.shells}</span><span>{t("🌱 種")} {life.seeds}</span></div><div className="projects">{PROJECTS.map(p=>{const done=life.projects.includes(p.id),afford=life.wood>=p.wood&&life.shells>=p.shells&&life.seeds>=p.seeds;return <article key={p.id}><span className="project-icon">{p.icon}</span><div><h3>{t(p.name)}</h3><p>{t(p.description)}</p><small>🪵{p.wood}　🐚{p.shells}　🌱{p.seeds}</small></div><button aria-label={done?t(`${p.name}は完成`):t(`${p.name}をつくる`)} disabled={disabled||done||!afford} onClick={()=>change(s=>build(s,p.id))}>{done?t("完成"):afford?t("つくる"):t("材料待ち")}</button></article>;})}</div><p className="hint">{t("木は森で、貝は海岸で見つかります。島の材料はゲーム内だけのものです。")}</p></>
 :<><div className="panel-eyebrow">THINGS WE WILL REMEMBER</div><h2>{t("ふたりの思い出。")}</h2><p className="lead">{language==='en'?`${life.cards.length}/8 postcards · ${life.outings} outings`:`${life.cards.length}/8 枚のポストカード · ${life.outings}回のおでかけ`}</p>{life.cards.length?<div className="memory-grid">{[...life.cards].reverse().map(c=><button key={c.id} onClick={()=>showCard(c)}><span className={`memory-art memory-${c.place}`}>{PLACES[c.place].icon}</span><small>DAY {c.day}</small><b>{t(c.title)}</b></button>)}</div>:<div className="empty-memory">✉<p>{t("最初の一枚は、これから。")}<br/>{t("お出かけして、おみやげを持って帰ろう。")}</p></div>}<h3 className="journal-title">{t("暮らしの日記")}</h3><div className="journal">{life.journal.slice(0,8).map((m,i)=><p key={`${i}-${m.day}`}><small>{language==='en'?`Day ${m.day}`:`${m.day}日目`}</small>{t(m.text)}</p>)}</div></>}
 </section></div>
 </div>
 <nav className="life-nav" aria-label={t("島ぐらしメニュー")}>{[['home','⌂',t("おうち")],['outings','☀',t("おでかけ")],['island','♧',t("島づくり")],['memories','✉',t("思い出")]].map(([id,icon,label])=><button key={id} aria-label={t(String(label))} aria-current={tab===id?'page':undefined} disabled={!atHome||saving} onClick={()=>{setTab(id);setFood(false);sfx.play('confirm');}}><span>{icon}</span>{label}</button>)}</nav>
 {saveError&&<div className="save-error" role="alert"><p>{t("まだ保存できていません。")}{t(saveError)}</p><button disabled={saving||paused} onClick={()=>void commit(life)}>{t("保存をやり直す")}</button></div>}
 </div>
 {modal&&<div className="life-overlay"><div className="life-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={modal==='rewards'?t("NFTの貯金箱"):modal==='card'?t("思い出のポストカード"):t("暮らしの設定")} inert={paused||undefined}><button className="close-dialog" onClick={()=>setModal(null)}>{t("閉じる")}</button>{modal==='rewards'?<RewardPanel client={client} friendId={friendId} previous={realRewards} onRead={setRealRewards} onIncrease={()=>sfx.play('coins')} paused={paused} language={language}/>:modal==='card'?<><img className="memory-image" src={cardImage} alt={t(`${life.name}との思い出のポストカード`)}/><p>{t("画像を長押し・右クリックで保存できます。")}</p></>:<><span className="tiny">MAKE YOURSELF AT HOME</span><h2>{t("きみとの暮らし。")}</h2><label>{t("Friendの呼び名")}<input value={nickname} maxLength={20} onChange={e=>setNickname(e.target.value)}/></label><button className="main-action" disabled={disabled||!nickname.trim()} onClick={()=>{change(s=>rename(s,nickname));setModal(null);}}>{t("この名前で呼ぶ")}</button><h3>{t("スマートフォンで遊ぶ")}</h3><p>{t("ブラウザーのメニューから「ホーム画面に追加」。育成データはこのブラウザーに保存されます。")}</p><p>{t("起動時に対応ウォレットでの接続が必要です。ホーム画面版にウォレットがない場合は、いつものウォレット対応ブラウザーで開いてください。別ブラウザー・別端末には保存は引き継がれません。")}</p><h3>{t("お部屋の模様替え")}</h3><button disabled={disabled||!economy||economy.consumables>0n||economy.rfBalance<2n*10n**18n} onClick={()=>void buyFrame()}>{economy&&economy.consumables>0n?t("金色の額縁を使用中"):t("金色の額縁 · 2 demo RF")}</button><p className="hint">{t("SDKの模擬購入です。お部屋の枠だけが変わり、この接続中のみ有効。育成と島づくりは無料です。")}</p><h3>{t("暮らしのルール")}</h3><p>{t("「おやすみ」で次の朝に進みます。閉じている間に弱ったり、いなくなったりはしません。データ削除で思い出も消えるため、このブラウザーを使い続けてください。")}</p><p className="hint">{t("無料の育成プレビュー。材料・育成結果は模擬で、RFへの交換やNFTの発行はありません。")}</p></>}</div></div>}
 </section>;
}
