// Phone check for Rare Quest: real device emulation (isMobile, touch, DPR 3, mobile UA) at the sizes
// players actually hold. Run from the SDK root: node games/rare-quest/mobile.test.mjs
// MOBILE_SIZE='[[390,664]]' limits sizes; MOBILE_PHASE=before|after names the screenshots (default after);
// MOBILE_MEASURE_ONLY=1 prints the measurements without failing.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';import {readFile} from 'node:fs/promises';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SIZES=process.env.MOBILE_SIZE?JSON.parse(process.env.MOBILE_SIZE):[[360,640],[375,667],[390,664],[430,740],[664,390]];
const PHASE=process.env.MOBILE_PHASE||'after',MEASURE_ONLY=process.env.MOBILE_MEASURE_ONLY==='1';
let device={};
const launch=chromium.launch.bind(chromium);
chromium.launch=async o=>{const browser=await launch({...o,...(process.env.QUEST_CHROMIUM?{executablePath:process.env.QUEST_CHROMIUM}:{})});const context=browser.newContext.bind(browser);browser.newContext=options=>context({...options,...device});return browser;};
const tag=(w,h)=>w>h?'land':String(w);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const box=async l=>{const b=await l.boundingBox();return b&&{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
const openGame=async page=>{await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();};

/** Layout facts in page pixels: scroll in the host page and the game document, the GB screen, the pad, smallest text. */
async function measure(page,game){
 const host=await page.evaluate(()=>{const s=document.scrollingElement,bar=document.querySelector('.rf-frame-toolbar').getBoundingClientRect();
  return {pageScrollY:s.scrollHeight-innerHeight,pageScrollX:s.scrollWidth-innerWidth,toolbar:{y:Math.round(bar.y),h:Math.round(bar.height)},hostText:Math.min(...[...document.querySelectorAll('.rf-frame-toolbar > *')].map(e=>parseFloat(getComputedStyle(e).fontSize)))};});
 const inner=await game.locator('body').evaluate(()=>{const s=document.scrollingElement,root=document.querySelector('.quest');window.scrollTo(0,200);const moved=scrollY;window.scrollTo(0,0);
  const small=[];for(const el of document.querySelectorAll('body *')){if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);if(!r.width||!r.height||cs.visibility==='hidden'||cs.display==='none')continue;const fs=parseFloat(cs.fontSize);if(fs<12)small.push(`${el.className||el.tagName}:${el.textContent.trim().slice(0,10)}@${fs.toFixed(1)}`);}
  const screen=document.querySelector('.screen'),pad=document.querySelector('.pad');
  return {docScroll:s.scrollHeight-innerHeight,docScrollX:s.scrollWidth-innerWidth,rootScroll:root.scrollHeight-root.clientHeight,rootScrollX:root.scrollWidth-root.clientWidth,scrollMoved:moved,small:[...new Set(small)],
   rendering:getComputedStyle(screen.querySelector('canvas')).imageRendering,
   styles:{padTouch:getComputedStyle(pad).touchAction,dpadTouch:getComputedStyle(document.querySelector('.dpad button')).touchAction,menuTouch:getComputedStyle(document.querySelector('.menu-btn')).touchAction,screenTouch:getComputedStyle(screen).touchAction,
    overscroll:getComputedStyle(document.documentElement).overscrollBehaviorY,select:getComputedStyle(screen).userSelect,padSelect:getComputedStyle(pad).userSelect,tap:getComputedStyle(document.querySelector('.dpad button')).webkitTapHighlightColor}};});
 const controls={};for(const id of ['pad-up','pad-down','pad-left','pad-right','pad-a','pad-b','pad-menu'])controls[id]=await box(game.getByTestId(id));
 controls.pause=await box(game.getByRole('button',{name:'一時停止',exact:true}));controls.wallet=await box(page.getByRole('button',{name:'Open Friend wallet',exact:true}));
 return {host,inner,screen:await box(game.getByTestId('screen')),controls};
}
/** Heights of the tappable entries in an in-screen list (menus, battle commands, moves). */
const entries=async(game,selector)=>(await game.locator(selector).evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return Math.round(r.height);})));

{const css=await readFile(new URL('./style.css',import.meta.url),'utf8');const rule=[...css.matchAll(/([^{}]*)\{[^}]*-webkit-touch-callout:none/g)].map(m=>m[1]).join(',');
 for(const selector of ['.screen','.dpad button','.ab button','.quest button'])if(!MEASURE_ONLY)assert.ok(rule.includes(selector),`-webkit-touch-callout:none covers ${selector}`);}
const failures=[];
for(const [width,height] of SIZES){
 device={isMobile:true,hasTouch:true,deviceScaleFactor:3,userAgent:width===360?ANDROID:IPHONE};
 try{console.log(await testGame('./games/rare-quest',{width,height,timeout:20_000,check:async({page,game})=>{
  const screen=game.getByTestId('screen'),attr=name=>screen.getAttribute(`data-${name}`);
  const until=async(what,fn,ms=20_000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await sleep(60);}throw new Error(`timed out: ${what}`);};
  const cdp=await page.context().newCDPSession(page);const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
  const centre=async id=>{const b=await game.getByTestId(id).boundingBox();return [b.x+b.width/2,b.y+b.height/2];};
  const tapPad=async id=>{const [x,y]=await centre(id);await touch('touchStart',x,y);await touch('touchEnd');};
  async function hold(dir,done,ms=15_000,end='touchEnd'){const [x,y]=await centre(`pad-${dir}`);await touch('touchStart',x,y);try{await until(`holding ${dir}`,done,ms);}finally{await touch(end);}}
  await page.reload();await openGame(page);
  const fresh=game.getByRole('button',{name:'はじめから',exact:true});await fresh.waitFor();
  const title=await game.locator('.title').evaluate(e=>e.scrollHeight-e.clientHeight),start=await box(fresh);
  if(!MEASURE_ONLY){assert.ok(title<=1,`title card overflows by ${title}px`);assert.ok(start.h>=44&&start.y+start.h<=height,`New game button ${JSON.stringify(start)}`);}
  if(process.env.MOBILE_TITLE_SHOTS)await page.screenshot({path:`./artifacts/mobile-${PHASE}-title-${tag(width,height)}.png`});
  await fresh.tap();await game.getByTestId('textbox').waitFor();
  for(let i=0;i<10&&await attr('scene')==='talk';i++)await tapPad('pad-a');
  await until('world',async()=>await attr('scene')==='world');
  const m=await measure(page,game);console.log(`[${PHASE}] ${width}x${height} world`,JSON.stringify(m));
  await page.screenshot({path:`./artifacts/mobile-${PHASE}-${tag(width,height)}.png`});
  // Main menu entries.
  await tapPad('pad-menu');await until('menu',async()=>await attr('scene')==='menu');const menu=await entries(game,'.menu li button');
  if(width===390)await page.screenshot({path:`./artifacts/mobile-${PHASE}-menu-390.png`});
  await tapPad('pad-b');await until('menu closed',async()=>await attr('scene')==='world');
  // D-pad hold walks; a cancelled touch stops the walk.
  const where=async()=>`${await attr('map')}:${await attr('x')},${await attr('y')}`;const from=await where();
  await hold('up',async()=>await where()!==from,5000,'touchCancel');await sleep(400);const stopped=await where();await sleep(700);const still=await where();
  // Walk to the trail and pace the grass for a battle.
  await hold('up',async()=>await attr('map')==='wakaba'||await attr('scene')!=='world');
  let dir='up';for(let n=0;n<200&&await attr('scene')==='world';n++){
   if(await attr('map')==='moegi'){await hold('up',async()=>await attr('map')==='wakaba'||await attr('scene')!=='world');continue;}
   const y=Number(await attr('y'));dir=y<=20?'down':y>=22?'up':dir;const target=dir==='up'?y-1:y+1;
   await hold(dir,async()=>Number(await attr('y'))===target||await attr('scene')!=='world',3000).catch(()=>{});}
  await until('battle',async()=>await attr('scene')==='battle',5000);
  await until('battle menu',async()=>{if(await attr('ui')==='main')return true;await tapPad('pad-a');return false;});
  const commands=await entries(game,'.command .grid button'),battleSmall=(await measure(page,game)).inner.small;
  if(width===390||width>height)await page.screenshot({path:`./artifacts/mobile-${PHASE}-battle-${tag(width,height)}.png`});
  await game.getByRole('button',{name:'たたかう',exact:true}).tap();await until('moves',async()=>await attr('ui')==='fight');
  const moves=await entries(game,'.command.moves li button'),movesSmall=(await measure(page,game)).inner.small;
  if(width===390)await page.screenshot({path:`./artifacts/mobile-${PHASE}-moves-390.png`});
  console.log(`[${PHASE}] ${width}x${height} lists`,JSON.stringify({menu,commands,moves,battleSmall,movesSmall,walk:[from,stopped,still]}));
  if(MEASURE_ONLY)return;
  const vw=width,vh=height,{host,inner,controls}=m;
  assert.ok(host.pageScrollY<=1&&host.pageScrollX<=1,`host page scrolls ${JSON.stringify(host)}`);
  assert.ok(inner.docScroll<=1&&inner.docScrollX<=1&&inner.rootScroll<=1&&inner.rootScrollX<=1&&inner.scrollMoved===0,`game document scrolls ${JSON.stringify(inner)}`);
  for(const [name,b] of Object.entries(controls)){assert.ok(b,`${name} visible`);assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=vw+1&&b.y+b.h<=vh+1,`${name} inside ${vw}x${vh}: ${JSON.stringify(b)}`);assert.ok(b.h>=44&&b.w>=44,`${name} ≥44px: ${JSON.stringify(b)}`);}
  assert.ok(controls['pad-a'].h>=48&&controls['pad-b'].h>=48,'A and B are primary 48px targets');
  for(const id of ['pad-up','pad-down','pad-left','pad-right','pad-a','pad-b','pad-menu'])assert.ok(controls[id].y+controls[id].h<=controls.wallet.y+1,`${id} clear of the host toolbar`);
  if(vh>vw){assert.ok(controls['pad-a'].y>vh*.55&&controls['pad-up'].y>vh*.55,`pad in the thumb zone ${JSON.stringify(controls)}`);assert.ok(m.screen.h>=vh*.4&&m.screen.w>=vw*.85,`GB screen ${JSON.stringify(m.screen)} uses the width`);}
  else assert.ok(m.screen.h>=vh*.6,`landscape screen ${m.screen.h} ≥60% of ${vh}`);
  assert.ok(Math.abs(m.screen.w/m.screen.h-160/144)<.02,'screen keeps the 160x144 shape');
  assert.deepEqual(inner.small,[],'no visible text under 12px in the world');assert.deepEqual(battleSmall,[],'no text under 12px in the battle menu');assert.deepEqual(movesSmall,[],'no text under 12px in the move list');
  assert.ok(host.hostText>=12,`host toolbar text ${host.hostText}px`);
  const minList=vh>vw?44:36;
  assert.ok(Math.min(...commands)>=minList,`battle commands ≥${minList}px: ${commands}`);assert.ok(Math.min(...moves)>=minList,`moves ≥${minList}px: ${moves}`);assert.ok(Math.min(...menu)>=(vh>vw?36:28),`menu entries: ${menu}`);
  assert.ok(['pixelated','crisp-edges'].includes(inner.rendering),`nearest-neighbour pixel art: ${inner.rendering}`);
  assert.equal(inner.styles.padTouch,'none');assert.equal(inner.styles.dpadTouch,'none');assert.equal(inner.styles.menuTouch,'manipulation');assert.equal(inner.styles.screenTouch,'manipulation');
  assert.equal(inner.styles.overscroll,'none');assert.equal(inner.styles.select,'none');assert.equal(inner.styles.padSelect,'none');assert.equal(inner.styles.tap,'rgba(0, 0, 0, 0)');
  assert.notEqual(stopped,from,'holding the D-pad walks');assert.equal(still,stopped,`pointercancel stops the walk (${stopped} → ${still})`);
  const frame=page.frames().find(f=>f!==page.mainFrame());
  assert.equal(await frame.evaluate(()=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('.screen canvas').dispatchEvent(e);return e.defaultPrevented;}),true,'context menu suppressed on the screen');
  // Leaving the tab pauses; resuming continues the same battle.
  await frame.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
  await frame.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await game.getByRole('button',{name:'再開する',exact:true}).tap();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor({state:'hidden'});
  assert.equal(await attr('scene'),'battle','resume keeps the battle');assert.equal(await attr('ui'),'fight');
  const after=await measure(page,game);assert.ok(after.host.pageScrollY<=1&&after.inner.rootScroll<=1,'still no scroll after touch play');
 }}))}catch(error){failures.push(`${width}x${height}: ${error.message.split('\n')[0]}`);console.error(`FAIL ${width}x${height}`,error.message.slice(0,600));}
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Rare Quest mobile PASS ${SIZES.map(s=>s.join('x')).join(' ')}`);
