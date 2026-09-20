import { useEffect, useRef, useState } from 'react';
import type { GameComponentProps } from '@rarefriends/friendsdk/runtime';
import type { GameSnapshot } from '@rarefriends/friendsdk/game';
import { createFriendReader, type GenerationSprites } from '@rarefriends/friendsdk/sprites';
import { newLife, restore, rename, act, depart, choose, returnHome, build, greeting, PLACES, PROJECTS, type Life, type Place, type Card } from './life.js';
import { LifeScene, memoryImage } from './life-art.js';
import './life.css';
export default function IslandLife(props:GameComponentProps){return <LifeGame key={String(props.friendId)} {...props}/>;}
function LifeGame({friendId,client,paused}:GameComponentProps){
 const [life,setLife]=useState<Life|null>(null),[sprites,setSprites]=useState<GenerationSprites|null>(null);
 const [error,setError]=useState(''),[retry,setRetry]=useState(0),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
 const [tab,setTab]=useState('home'),[food,setFood]=useState(false),[reaction,setReaction]=useState(''),[bubble,setBubble]=useState('');
 const [modal,setModal]=useState<'settings'|'card'|null>(null),[cardImage,setCardImage]=useState(''),[nickname,setNickname]=useState('');
 const [economy,setEconomy]=useState<GameSnapshot|null>(null);
 const [loaded,setLoaded]=useState(false),[corrupt,setCorrupt]=useState(false);
 const lifeRef=useRef<Life|null>(null),epoch=useRef(0),lock=useRef(false),dialogRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const version=++epoch.current;lock.current=false;lifeRef.current=null;setSaving(false);setSaveError('');setBubble('');setModal(null);setError('');setLife(null);setSprites(null);setLoaded(false);setCorrupt(false);
  void (async()=>{
   if(client.mode!=='preview'||!client.loadLocal||!client.saveLocal)throw new Error('この版では保存機能つきのプレビューが必要です。ページを再読み込みしてください。');
   const snapshot=await client.read();if(version===epoch.current)setEconomy(snapshot);if(snapshot.friendId!==friendId)throw new Error('Friendが変わりました。接続し直してください。');
   const raw=await client.loadLocal();const art=await createFriendReader().read(friendId);
   if(version!==epoch.current)return;
   const saved=restore(raw,String(friendId));
   if(raw&&!saved){setCorrupt(true);setSprites(art);throw new Error('保存データを読み取れませんでした。元のデータはそのまま残しています。');}
   const next=saved??newLife(String(friendId));lifeRef.current=next;setLife(next);setSprites(art);setNickname(next.name);setLoaded(Boolean(saved));
  })().catch(e=>{if(version===epoch.current)setError(e instanceof Error?e.message:'読み込みに失敗しました。');});
  return()=>{epoch.current++;};
 },[client,friendId,retry]);
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
 if(!life||!sprites)return <div className="life-loading"><div className="loading-house">⌂</div><h1>OUR LITTLE ISLAND</h1><p role={error?'alert':'status'}>{error||'あなたのFriendがおうちを準備しています…'}</p>{error&&<button onClick={()=>setRetry(n=>n+1)}>もう一度読み込む</button>}{corrupt&&sprites&&<button onClick={()=>{const s=newLife(String(friendId));setLife(s);lifeRef.current=s;setError('');}}>新しい暮らしを始める（次の保存で上書き）</button>}</div>;
 const atHome=life.location==='home',place=atHome?null:PLACES[life.location as Exclude<Place,'home'>];
 const change=(fn:(s:Life)=>Life,animation='happy')=>{if(disabled||!lifeRef.current)return;const next=fn(lifeRef.current);if(next!==lifeRef.current)void commit(next,animation);};
 const showCard=(card:Card)=>{try{setCardImage(memoryImage(card,life,sprites));setModal('card');}catch(e){setBubble(e instanceof Error?e.message:'画像を作れませんでした。');}};
 const level=life.bond<10?'はじめまして':life.bond<30?'気になるともだち':life.bond<65?'なかよし':life.bond<110?'大切な相棒':'家族みたいなふたり';
 return <section className={`life-app ${paused?'is-paused':''} ${economy&&economy.consumables>0n?'gold-frame':''}`} aria-label="Rare Friends Island Life">
 <div className="life-content" inert={Boolean(modal)||paused||undefined}>
 <header className="life-header"><div><span className="tiny">RARE FRIENDS / OUR LITTLE ISLAND</span><h1>{life.name}と、島ぐらし。</h1></div><button className="gear" aria-label="設定" onClick={()=>{setNickname(life.name);setModal('settings');}}>⚙</button></header>
 <div className="life-layout"><section className="companion">
 <div className="day-strip"><span>☀ <b>{life.day}日目</b></span><span>♡ {level}</span><span className="save-state" role="status">{saving?'保存中…':saveError?'未保存':loaded?'保存済み':'はじめての朝'}</span></div>
 <LifeScene life={life} sprites={sprites} reaction={paused?'':reaction} onPet={()=>{if(disabled)return;setBubble(greeting(life));setReaction(reaction?'':'happy');}}/>
 <div className="speech"><span className="speech-name">{life.name}</span><p key={bubble}>{bubble||greeting(life)}</p></div>
 <div className="care-stats">{[['おなか',life.hunger,'🍞'],['げんき',life.energy,'☀'],['なかよし',Math.min(100,life.bond),'♡']].map(([label,value,icon])=><div key={String(label)}><span>{icon} {label}</span><meter min="0" max="100" value={Number(value)} aria-label={String(label)}/><small>{value}/100</small></div>)}</div>
 <div className="friend-caption">Friend #{String(friendId)} <span>·</span> あなたと暮らす、世界にひとりのFriend</div>
 </section>
 <section className="life-panel" aria-label="暮らしの選択">
 {!atHome&&place?<><div className="panel-eyebrow">A LITTLE ADVENTURE</div><h2>{place.icon} {place.name}</h2><p className="lead">{place.subtitle}</p><div className="event-story"><span>{life.choice===null?'道の途中で…':'ふたりの、今日のできごと'}</span><p>{life.choice===null?place.question:life.message}</p></div>
 {life.choice===null?<div className="choice-list">{place.choices.map((label,i)=><button aria-label={label} key={label} disabled={disabled} onClick={()=>change(s=>choose(s,i))}>{label}<span>↗</span></button>)}</div>:<><div className="souvenirs">おみやげ <span>🪵 {life.bag.wood}</span><span>🐚 {life.bag.shells}</span><span>🌱 {life.bag.seeds}</span></div><button aria-label="おみやげを持って帰る" className="main-action" disabled={disabled} onClick={()=>{change(returnHome,'walk');setTab('memories');}}>おみやげを持って帰る <span>⌂</span></button><p className="hint">帰ったら、今日の思い出がアルバムに残ります。</p></>}</>
 :tab==='home'?<><div className="panel-eyebrow">A DAY WITH YOU</div><h2>今日は、何しよう？</h2><p className="lead">いそがなくていい。ふたりのペースで。</p>
 {life.gardenReady&&<button aria-label="お花を摘む" className="garden-ready" disabled={disabled} onClick={()=>change(s=>act(s,'harvest'))}>🌷 お花を摘む <small>花畑が咲いたよ！</small></button>}
 <div className="home-actions"><button aria-label="ごはん" disabled={disabled} onClick={()=>setFood(!food)} aria-expanded={food}><span>🍞</span><b>ごはん</b><small>いっしょに、いただきます</small></button><button aria-label="おさんぽ" disabled={disabled||life.energy<15} onClick={()=>change(s=>act(s,'walk'),'walk')}><span>🐾</span><b>おさんぽ</b><small>おうちのまわりを、てくてく</small></button><button aria-label="おやすみ" disabled={disabled} onClick={()=>change(s=>act(s,'sleep'),'sleep')}><span>☾</span><b>おやすみ</b><small>次の朝へ。げんきを回復</small></button></div>
 {food&&<div className="food-menu"><p>何を食べよう？ <small>好きな味を、見つけてみて。</small></p>{([['toast','🍞','焼きたてトースト'],['berry','🫐','摘みたてベリー'],['soup','🥣','あったかスープ']] as const).map(([id,icon,label])=><button key={id} disabled={disabled||life.hunger>=90} onClick={()=>{change(s=>act(s,id),'eat');setFood(false);}}>{icon} {label}</button>)}{life.hunger>=90&&<p>いまはおなかいっぱい。またあとで。</p>}</div>}
 <div className="daily-note"><span>✎ ふたりのメモ</span><p>{life.journal[0]?.text??'まだ名前しか知らないふたり。ご飯を食べたり、外へ出たり。一緒の時間から始めよう。'}</p></div>
 </>:tab==='outings'?<><div className="panel-eyebrow">POCKET FULL OF POSSIBILITIES</div><h2>どこへ、出かけよう？</h2><p className="lead">小さなおみやげと、帰ってくるおうち。</p><div className="destinations">{Object.entries(PLACES).map(([id,p])=>{const locked=id==='lighthouse'&&!life.projects.includes('bridge');return <button key={id} disabled={disabled||locked||life.energy<20} onClick={()=>change(s=>depart(s,id as Place),'walk')}><span className="destination-icon">{p.icon}</span><span><b>{p.name}</b><small>{locked?'橋をつくると行けるよ':p.subtitle}</small></span><i>{locked?'鍵':'↗'}</i></button>;})}</div><p className="hint">お出かけはげんき20。{life.energy<20?'おうちで「おやすみ」してから出かけよう。':'出先では、好きな過ごし方を選べます。'}</p></>
 :tab==='island'?<><div className="panel-eyebrow">LITTLE BY LITTLE</div><h2>ぼくらの島を、育てよう。</h2><p className="lead">拾ってきたものが、暮らしになっていく。</p><div className="materials"><span>🪵 木 {life.wood}</span><span>🐚 貝 {life.shells}</span><span>🌱 種 {life.seeds}</span></div><div className="projects">{PROJECTS.map(p=>{const done=life.projects.includes(p.id),afford=life.wood>=p.wood&&life.shells>=p.shells&&life.seeds>=p.seeds;return <article key={p.id}><span className="project-icon">{p.icon}</span><div><h3>{p.name}</h3><p>{p.description}</p><small>🪵{p.wood}　🐚{p.shells}　🌱{p.seeds}</small></div><button aria-label={done?`${p.name}は完成`:`${p.name}をつくる`} disabled={disabled||done||!afford} onClick={()=>change(s=>build(s,p.id))}>{done?'完成':afford?'つくる':'材料待ち'}</button></article>;})}</div><p className="hint">木は森で、貝は海岸で見つかります。島の材料はゲーム内だけのものです。</p></>
 :<><div className="panel-eyebrow">THINGS WE WILL REMEMBER</div><h2>ふたりの思い出。</h2><p className="lead">{life.cards.length}/8 枚のポストカード · {life.outings}回のおでかけ</p>{life.cards.length?<div className="memory-grid">{[...life.cards].reverse().map(c=><button key={c.id} onClick={()=>showCard(c)}><span className={`memory-art memory-${c.place}`}>{PLACES[c.place].icon}</span><small>DAY {c.day}</small><b>{c.title}</b></button>)}</div>:<div className="empty-memory">✉<p>最初の一枚は、これから。<br/>お出かけして、おみやげを持って帰ろう。</p></div>}<h3 className="journal-title">暮らしの日記</h3><div className="journal">{life.journal.slice(0,8).map((m,i)=><p key={`${i}-${m.day}`}><small>{m.day}日目</small>{m.text}</p>)}</div></>}
 </section></div>
 <nav className="life-nav" aria-label="島ぐらしメニュー">{[['home','⌂','おうち'],['outings','☀','おでかけ'],['island','♧','島づくり'],['memories','✉','思い出']].map(([id,icon,label])=><button key={id} aria-label={label} aria-current={tab===id?'page':undefined} disabled={!atHome||saving} onClick={()=>{setTab(id);setFood(false);}}><span>{icon}</span>{label}</button>)}</nav>
 {saveError&&<div className="save-error" role="alert"><p>まだ保存できていません。{saveError}</p><button disabled={saving||paused} onClick={()=>void commit(life)}>保存をやり直す</button></div>}
 </div>
 {modal&&<div className="life-overlay"><div className="life-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={modal==='card'?'思い出のポストカード':'暮らしの設定'} inert={paused||undefined}><button className="close-dialog" onClick={()=>setModal(null)}>閉じる</button>{modal==='card'?<><img className="memory-image" src={cardImage} alt={`${life.name}との思い出のポストカード`}/><p>画像を長押し・右クリックで保存できます。</p></>:<><span className="tiny">MAKE YOURSELF AT HOME</span><h2>きみとの暮らし。</h2><label>Friendの呼び名<input value={nickname} maxLength={20} onChange={e=>setNickname(e.target.value)}/></label><button className="main-action" disabled={disabled||!nickname.trim()} onClick={()=>{change(s=>rename(s,nickname));setModal(null);}}>この名前で呼ぶ</button><h3>スマートフォンで遊ぶ</h3><p>ブラウザーのメニューから「ホーム画面に追加」。育成データはこのブラウザーに保存されます。</p><p>起動時に対応ウォレットでの接続が必要です。ホーム画面版にウォレットがない場合は、いつものウォレット対応ブラウザーで開いてください。別ブラウザー・別端末には保存は引き継がれません。</p><h3>お部屋の模様替え</h3><button disabled={disabled||!economy||economy.consumables>0n||economy.rfBalance<2n*10n**18n} onClick={()=>void buyFrame()}>{economy&&economy.consumables>0n?'金色の額縁を使用中':'金色の額縁 · 2 demo RF'}</button><p className="hint">SDKの模擬購入です。お部屋の枠だけが変わり、この接続中のみ有効。育成と島づくりは無料です。</p><h3>暮らしのルール</h3><p>「おやすみ」で次の朝に進みます。閉じている間に弱ったり、いなくなったりはしません。データ削除で思い出も消えるため、このブラウザーを使い続けてください。</p><p className="hint">無料の育成プレビュー。材料・育成結果は模擬で、RFへの交換やNFTの発行はありません。</p></>}</div></div>}
 </section>;
}
