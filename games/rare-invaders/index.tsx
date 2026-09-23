import {useEffect,useRef,useState} from 'react';
import type {GameComponentProps} from '@rarefriends/friendsdk/runtime';
import {createFriendReader,createGenesisReader,type GenerationSprites} from '@rarefriends/friendsdk/sprites';
import {createGame,step,WIDTH,HEIGHT,PLAYER_Y,type State} from './engine.js';
import './style.css';
const foes=['01100110/11111111/10111101/11111111/00111100/01011010/10000001','00111100/01111110/11011011/11111111/00100100/01011010/10000001','00011000/01111110/11011011/11111111/10100101/00100100/01000010'];
function pixels(c:CanvasRenderingContext2D,rows:readonly string[],x:number,y:number,size:number,color:string){c.fillStyle=color;const scale=size/rows[0].length;rows.forEach((row,j)=>[...row].forEach((p,i)=>{if(p==='#'||p==='1')c.fillRect(x-size/2+i*scale,y-size/2+j*scale,Math.ceil(scale),Math.ceil(scale));}));}
function draw(c:CanvasRenderingContext2D,s:State,art:GenerationSprites|null,reduced:boolean){
 c.fillStyle='#0a111b';c.fillRect(0,0,WIDTH,HEIGHT);
 for(let i=0;i<65;i++){const y=(i*83+(reduced?0:s.time*9))%HEIGHT;c.fillStyle=i%3===0?'#62756b':'#283b43';c.fillRect((i*137)%WIDTH,y,i%4===0?2:1,2);}
 c.strokeStyle='#233631';c.lineWidth=1;c.beginPath();c.moveTo(12,HEIGHT-28);c.lineTo(WIDTH-12,HEIGHT-28);c.stroke();
 s.enemies.forEach(e=>pixels(c,foes[e.kind%3].split('/'),e.x,e.y,30,['#d3ff64','#83e1d1','#ffab89'][e.kind%3]));
 for(const b of s.shots){c.fillStyle=b.enemy?'#ff8f8e':'#e4ff9a';c.fillRect(b.x-2,b.y-6,4,b.enemy?13:19);}
 if(art){c.globalAlpha=s.invincible>0?.5:1;pixels(c,art.clips.idle.down[0].rows,s.playerX,PLAYER_Y,38,'#eaf4da');c.globalAlpha=1;}
 c.fillStyle='#d3ff64';c.fillRect(s.playerX-22,PLAYER_Y+23,44,3);
 if(s.shield>0){c.strokeStyle='#80e6ff';c.lineWidth=3;c.beginPath();c.arc(s.playerX,PLAYER_Y,33,0,Math.PI*2);c.stroke();}
}
export default function Invaders(props:GameComponentProps){return <Arcade key={`${props.collection ?? "generations"}:${props.friendId}`} {...props}/>;}
function Arcade({friendId,collection='generations',client,paused}:GameComponentProps){
 const [lang,setLang]=useState<'ja'|'en'>('ja'),[art,setArt]=useState<GenerationSprites|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[ready,setReady]=useState(false);
 const [started,setStarted]=useState(false),[manualPause,setManualPause]=useState(false),[view,setView]=useState(createGame),[best,setBest]=useState(0),[saveError,setSaveError]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef(createGame()),keys=useRef(new Set<string>()),touch=useRef(new Map<number,string>()),shieldTap=useRef(false),bestRef=useRef(0),alive=useRef(false);
 const t=(ja:string,en:string)=>lang==='ja'?ja:en;
 const active=started&&!paused&&!manualPause&&ready;
 useEffect(()=>{alive.current=true;setReady(false);setError('');let current=true;void(async()=>{
  await client.read();const [sprite,raw]=await Promise.all([(collection==='genesis'?createGenesisReader():createFriendReader()).read(friendId),client.loadLocal?.().catch(()=>{if(current)setSaveError(true);return null;})]);
  if(!current)return;setArt(sprite);
  if(raw){try{const saved=JSON.parse(raw);if(saved.version===1&&Number.isSafeInteger(saved.best)&&saved.best>=0&&saved.best<1e9){bestRef.current=saved.best;setBest(saved.best);}}catch{setSaveError(true);}}
  setReady(true);
 })().catch(()=>{if(current)setError('Could not load your Friend. Please retry.');});return()=>{current=false;alive.current=false;};},[client,friendId,collection,attempt]);
 useEffect(()=>{const clear=()=>{keys.current.clear();touch.current.clear();shieldTap.current=false;};const blur=()=>{clear();setManualPause(true);};const visibility=()=>{if(document.hidden)blur();};
 const down=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('button,input'))return;if(['ArrowLeft','ArrowRight',' ','a','d','A','D','Shift'].includes(e.key)){e.preventDefault();keys.current.add(e.key.toLowerCase());}if(e.key==='Escape'||e.key.toLowerCase()==='p'){e.preventDefault();clear();setManualPause(v=>!v);}};
 const up=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase());window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
 return()=>{clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{if(!active){keys.current.clear();touch.current.clear();shieldTap.current=false;}},[active]);
 useEffect(()=>{
  let frame=0,last=0,published=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tick(now:number){const dt=last?Math.min(.03,(now-last)/1000):0;last=now;
   if(active&&world.current.status==='playing'){
    const held=(key:string)=>keys.current.has(key)||[...touch.current.values()].includes(key);
    const next=step(world.current,{move:Number(held('arrowright')||held('d'))-Number(held('arrowleft')||held('a')),fire:held(' ')||held('fire'),shield:shieldTap.current||held('shift')},dt);shieldTap.current=false;world.current=next;
    if(next.status!=='playing'&&next.score>bestRef.current){bestRef.current=next.score;setBest(next.score);if(client.saveLocal)void client.saveLocal(JSON.stringify({version:1,best:next.score})).catch(()=>{if(alive.current)setSaveError(true);});}
   }
   const c=canvas.current?.getContext('2d');if(c)draw(c,world.current,art,reduced);
   if(now-published>70||world.current.status!=='playing'){setView({...world.current});published=now;}
   frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[active,art,client]);
 const start=()=>{if(paused||!ready)return;world.current=createGame();setView(world.current);keys.current.clear();touch.current.clear();setStarted(true);setManualPause(false);canvas.current?.focus();};
 const bind=(action:string)=>({onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{if(!active)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);touch.current.set(e.pointerId,action);},onPointerUp:(e:React.PointerEvent<HTMLButtonElement>)=>{touch.current.delete(e.pointerId);},onPointerCancel:(e:React.PointerEvent<HTMLButtonElement>)=>{touch.current.delete(e.pointerId);},onLostPointerCapture:(e:React.PointerEvent<HTMLButtonElement>)=>{touch.current.delete(e.pointerId);}});
 const finished=view.status!=='playing';
 return <section className="arcade" lang={lang} aria-label="Rare Invaders">
 <header><div className="brand"><small>RARE FRIENDS / ARCADE 01</small><h1>RARE <span>INVADERS</span></h1></div><div className="top-actions"><button onClick={()=>{setLang(lang==='ja'?'en':'ja');if(started)canvas.current?.focus();}}>{lang==='ja'?'English':'日本語'}</button>{started&&!finished&&<button disabled={paused} aria-label={t('一時停止','Pause')} onClick={()=>setManualPause(true)}>Ⅱ</button>}</div></header>
 <div className="game-layout"><div className="cabinet"><div className="hud"><div><small>SCORE</small><strong data-testid="score">{String(view.score).padStart(6,'0')}</strong></div><div><small>WAVE</small><strong>{String(view.wave).padStart(2,'0')} / 05</strong></div><div><small>LIVES</small><strong className="hearts">{'♥'.repeat(view.lives)}{'·'.repeat(Math.max(0,3-view.lives))}</strong></div></div>
 <div className="screen"><canvas ref={canvas} width={WIDTH} height={HEIGHT} tabIndex={0} aria-label={t('矢印キーで移動、スペースで射撃、Shiftでシールド','Arrow keys move, Space fires, Shift shields')}/>
 {(!started||manualPause||finished||error)&&<div className="overlay"><div><span className="label">{finished?'MISSION REPORT':'DEFEND YOUR LITTLE UNIVERSE'}</span><h2>{error?'SIGNAL LOST':finished?view.status==='won'?'SECTOR CLEAR':'TRY AGAIN':started?'PAUSED':<>SMALL FRIEND.<br/>BIG FIGHT.</>}</h2><p>{error||(!started?t('きみのFriendで、迫る編隊を迎え撃とう。5つのウェーブを越えて、星空を守れ。','Your own Friend. Five incoming waves. Hold your ground and bring the stars back home.'):finished?t(`スコア ${view.score}。もう一度、星空へ。`,`Score ${view.score}. One more flight?`):t('準備ができたら、続きを。','Take a breath. The stars can wait.'))}</p>
 {error?<button className="launch" onClick={()=>setAttempt(v=>v+1)}>{t('再読み込み','Retry')}</button>:<button className="launch" disabled={!ready||paused} onClick={started&&!finished?()=>{setManualPause(false);canvas.current?.focus();}:start}>{!ready?t('Friendを読込中…','Loading Friend…'):started&&!finished?t('再開する','Resume'):finished?t('もう一度','Play again'):t('出撃する','Launch')}</button>}
 <p>{t('← → / A D：移動　SPACE：射撃　SHIFT：シールド','← → / A D move · SPACE fire · SHIFT shield')}</p></div></div>}
 </div><div className="touch-controls"><button {...bind('arrowleft')} disabled={!active||finished} aria-label={t('左へ','Move left')}>◀</button><button {...bind('arrowright')} disabled={!active||finished} aria-label={t('右へ','Move right')}>▶</button><button className="fire" {...bind('fire')} disabled={!active||finished} aria-label={t('射撃','Fire')}>{t('射撃','FIRE')} ↑</button><button className="shield" disabled={!active||finished||view.shieldCooldown>0} aria-label={t('シールド','Shield')} onClick={()=>{shieldTap.current=true;}}>◇</button></div><div className="shield-meter" data-testid="shield-status">{view.shieldCooldown>0?`RECHARGING ${Math.ceil(view.shieldCooldown)}s`:'SHIELD READY / 2 SEC'}</div></div>
 <aside className="brief"><div className="pilot"><span className="label">YOUR PILOT</span>{art&&<svg className="mini-friend" width="80" height="80" viewBox="0 0 16 16" role="img" aria-label={`${collection==='genesis'?'Genesis':'Friend'} #${friendId}`}>{art.clips.idle.down[0].rows.flatMap((row,y)=>[...row].map((p,x)=>p==='#'?<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#d3ff64"/>:null))}</svg>}<b>{collection==='genesis'?'GENESIS':'FRIEND'} #{String(friendId)}</b><p>{t('あなたのNFTが、この宇宙のパイロット。','Your NFT. Your pilot. Your little universe.')}</p></div><div><span className="label">THE MISSION</span><h2>{t('星空を、取り戻せ。','A little courage. A lot of lasers.')}</h2><p>{t('射撃は長押しで連射。編隊は端に着くと降下します。敵を地上に近づけないで。シールドは2秒、再使用まで8秒。','Hold fire for rapid shots. Formations descend at the edges. Stop them before they reach you. Shield lasts 2 seconds; recharges in 8.')}</p></div><div className="record"><span className="label">PERSONAL BEST</span><strong>{String(best).padStart(6,'0')}</strong><span className="note">{t('このブラウザー・このFriendの記録','This browser · this Friend')}</span></div></aside></div>
 <footer><span>{t('無料のアーケード · スコアはRFではありません','FREE ARCADE · SCORE IS NOT RF')}</span><span>{collection==='genesis'?'GENESIS':'FRIEND'} #{String(friendId)} · BEST {best}</span></footer>{saveError&&<p className="error" role="alert">{t('記録を保存できませんでした。このブラウザーの保存設定を確認してください。','Could not save your record. Check this browser’s storage settings.')}</p>}
 </section>;
}
