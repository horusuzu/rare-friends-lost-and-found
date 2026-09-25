// Phone check for Rare Rush: real device emulation (isMobile, touch, DPR 3, mobile UA) at the sizes
// players actually hold. Run from the SDK root: node games/rare-rush/mobile.test.mjs
// MOBILE_SIZE='[[390,664]]' limits sizes; MOBILE_PHASE=before|after names the screenshots (default after);
// MOBILE_MEASURE_ONLY=1 prints the measurements without failing.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';import {readFile} from 'node:fs/promises';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SIZES=process.env.MOBILE_SIZE?JSON.parse(process.env.MOBILE_SIZE):[[360,640],[375,667],[390,664],[430,740],[664,390]];
const PHASE=process.env.MOBILE_PHASE||'after',MEASURE_ONLY=process.env.MOBILE_MEASURE_ONLY==='1';
let device={};
const launch=chromium.launch.bind(chromium);
chromium.launch=async o=>{const browser=await launch({...o,...(process.env.RUSH_CHROMIUM?{executablePath:process.env.RUSH_CHROMIUM}:{})});const context=browser.newContext.bind(browser);browser.newContext=options=>context({...options,...device});return browser;};
const tag=(w,h)=>w>h?'land':String(w);
const openGame=async page=>{await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();};
const box=async l=>{const b=await l.boundingBox();return b&&{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};

/** Layout facts in page pixels: scroll in the host page and the game document, play surface, controls, smallest text. */
async function measure(page,game){
 const host=await page.evaluate(()=>{const s=document.scrollingElement,bar=document.querySelector('.rf-frame-toolbar').getBoundingClientRect(),f=document.querySelector('iframe').getBoundingClientRect();
  return {pageScrollY:s.scrollHeight-innerHeight,pageScrollX:s.scrollWidth-innerWidth,toolbar:{y:Math.round(bar.y),h:Math.round(bar.height)},frame:{y:Math.round(f.y),h:Math.round(f.height),w:Math.round(f.width)},
   hostText:Math.min(...[...document.querySelectorAll('.rf-frame-toolbar > *')].map(e=>parseFloat(getComputedStyle(e).fontSize)))};});
 const inner=await game.locator('body').evaluate(()=>{const s=document.scrollingElement,root=document.querySelector('.rush');window.scrollTo(0,200);const moved=scrollY;window.scrollTo(0,0);
  const small=[];for(const el of document.querySelectorAll('body *')){if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);if(!r.width||!r.height||cs.visibility==='hidden'||cs.display==='none')continue;const fs=parseFloat(cs.fontSize);if(fs<12)small.push(`${el.className||el.tagName}:${el.textContent.trim().slice(0,12)}@${fs}`);}
  const hold=document.querySelector('.hold'),lines=hold?Math.round(hold.scrollHeight/parseFloat(getComputedStyle(hold).lineHeight||'20')):0;
  const c=document.querySelector('.stage canvas'),cs=getComputedStyle(c),stage=document.querySelector('.stage');
  return {docScroll:s.scrollHeight-innerHeight,docScrollX:s.scrollWidth-innerWidth,rootScroll:root.scrollHeight-root.clientHeight,rootScrollX:root.scrollWidth-root.clientWidth,scrollMoved:moved,small:[...new Set(small)],
   holdOverflow:hold?hold.scrollWidth-hold.clientWidth:0,holdText:hold?.innerText,backing:[c.width,c.height],css:[Math.round(c.getBoundingClientRect().width),Math.round(c.getBoundingClientRect().height)],dpr:devicePixelRatio,
   styles:{stageTouch:getComputedStyle(stage).touchAction,holdTouch:hold?getComputedStyle(hold).touchAction:'',overscroll:getComputedStyle(document.documentElement).overscrollBehaviorY,select:getComputedStyle(stage).userSelect,holdSelect:hold?getComputedStyle(hold).userSelect:'',tap:getComputedStyle(stage).webkitTapHighlightColor}};});
 const controls={hold:await box(game.getByRole('button',{name:'長押し',exact:true})),turbo:await box(game.getByTestId('turbo')),pause:await box(game.getByRole('button',{name:'一時停止',exact:true})),sound:await box(game.getByTestId('sound')),
  wallet:await box(page.getByRole('button',{name:'Open Friend wallet',exact:true})),friend:await box(page.getByRole('button',{name:'Choose Friend',exact:true}))};
 return {host,inner,stage:await box(game.locator('.stage')),controls};
}

// Chromium ignores -webkit-touch-callout (Safari only), so check the stylesheet for the stage and the hold buttons.
{const css=await readFile(new URL('./style.css',import.meta.url),'utf8');const rule=[...css.matchAll(/([^{}]*)\{[^}]*-webkit-touch-callout:none/g)].map(m=>m[1]).join(',');
 for(const selector of ['.stage','.hold','.turbo','.rush button'])if(!MEASURE_ONLY)assert.ok(rule.includes(selector),`-webkit-touch-callout:none covers ${selector}`);}
const failures=[];
for(const [width,height] of SIZES){
 device={isMobile:true,hasTouch:true,deviceScaleFactor:3,userAgent:width===360?ANDROID:IPHONE};
 try{console.log(await testGame('./games/rare-rush',{width,height,check:async({page,game})=>{
  await page.clock.install();await page.reload();await openGame(page);
  await game.locator('[data-testid=sound]:not([disabled])').waitFor();
  const board=game.getByRole('button',{name:'乗車する',exact:true});
  const title=await game.locator('.overlay').evaluate(e=>e.scrollHeight-e.clientHeight),start=await board.boundingBox();
  if(!MEASURE_ONLY){assert.ok(title<=1,`title card overflows by ${title}px`);assert.ok(start.height>=48&&start.y+start.height<=height,`Board button ${JSON.stringify(start)}`);}
  if(process.env.MOBILE_TITLE_SHOTS)await page.screenshot({path:`./artifacts/mobile-${PHASE}-title-${tag(width,height)}.png`});
  await board.tap();await page.clock.runFor(300);
  const cdp=await page.context().newCDPSession(page);const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
  const m=await measure(page,game);
  console.log(`[${PHASE}] ${width}x${height} launch`,JSON.stringify(m));
  if(MEASURE_ONLY){const hb=await game.getByRole('button',{name:'長押し',exact:true}).boundingBox();await touch('touchStart',hb.x+hb.width/2,hb.y+hb.height/2);await page.clock.runFor(400);await page.screenshot({path:`./artifacts/mobile-${PHASE}-${tag(width,height)}.png`});await touch('touchEnd');return;}
  const vw=width,vh=height,{host,inner,controls,stage}=m;
  assert.ok(host.pageScrollY<=1&&host.pageScrollX<=1,`host page scrolls ${JSON.stringify(host)}`);
  assert.ok(inner.docScroll<=1&&inner.docScrollX<=1&&inner.rootScroll<=1&&inner.rootScrollX<=1&&inner.scrollMoved===0,`game document scrolls ${JSON.stringify(inner)}`);
  for(const [name,b] of Object.entries(controls)){assert.ok(b,`${name} visible`);assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=vw+1&&b.y+b.h<=vh+1,`${name} inside ${vw}x${vh}: ${JSON.stringify(b)}`);assert.ok(b.h>=44&&b.w>=44,`${name} ≥44px: ${JSON.stringify(b)}`);}
  assert.ok(controls.hold.h>=48&&controls.turbo.h>=48,'HOLD and TURBO are primary 48px targets');
  if(vh>vw){assert.ok(controls.hold.y>vh*.6&&controls.turbo.y>vh*.6,`controls in the thumb zone ${JSON.stringify(controls)}`);assert.ok(stage.h>=vh*.45,`stage ${stage.h} ≥45% of ${vh}`);}
  else assert.ok(stage.h>=vh*.6,`landscape stage ${stage.h} ≥60% of ${vh}`);
  assert.ok(controls.hold.y+controls.hold.h<=controls.wallet.y+1,'game controls clear of the host toolbar');
  assert.ok(inner.holdOverflow<=0,`hold hint fits its button: ${inner.holdText}`);
  const right=await game.locator('.rush').evaluate(e=>{const r=e.getBoundingClientRect(),pad=parseFloat(getComputedStyle(e).paddingRight);return [...e.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().right>r.right-pad+1).map(b=>b.className||b.textContent);});
  assert.deepEqual(right,[],'buttons stay inside the layout padding');
  assert.deepEqual(inner.small,[],'no visible text under 12px');assert.ok(host.hostText>=12,`host toolbar text ${host.hostText}px`);
  assert.equal(inner.styles.stageTouch,'none');assert.equal(inner.styles.holdTouch,'none');assert.equal(inner.styles.overscroll,'none');assert.equal(inner.styles.select,'none');assert.equal(inner.styles.holdSelect,'none');assert.equal(inner.styles.tap,'rgba(0, 0, 0, 0)');
  assert.ok(inner.backing[1]>=inner.css[1]*1.9,`canvas backing ${inner.backing} for ${inner.css} css px at DPR ${inner.dpr}`);
  // Hold the launch button with a finger, then the OS cancels the touch: the charge is released (the car launches).
  const pressure=async()=>{const el=game.getByTestId('pressure');return await el.count()?Number((await el.getAttribute('style')).match(/height:\s*([\d.]+)%/)[1]):null;};
  const hb=await game.getByRole('button',{name:'長押し',exact:true}).boundingBox();
  await touch('touchStart',hb.x+hb.width/2,hb.y+hb.height/2);await page.clock.runFor(400);const charged=await pressure();
  await page.screenshot({path:`./artifacts/mobile-${PHASE}-${tag(width,height)}.png`});
  await touch('touchCancel');await page.clock.runFor(300);
  assert.ok(charged>5,`holding charges the pressure (${charged})`);assert.equal(await pressure(),null,'pointercancel releases the launch hold');
  assert.ok(Number(await game.getByTestId('speed').innerText())>0,'the car launched');
  // The whole stage is a hold area: a finger held on it dives, a cancel lets go.
  const sb=await game.locator('.stage').boundingBox();await touch('touchStart',sb.x+sb.width/2,sb.y+sb.height*.6);await page.clock.runFor(300);await touch('touchCancel');await page.clock.runFor(200);
  // TURBO by touch fires and a cancel ends the press.
  const tb=await game.getByTestId('turbo').boundingBox();await touch('touchStart',tb.x+tb.width/2,tb.y+tb.height/2);await page.clock.runFor(120);await touch('touchCancel');
  await game.locator('.turbo.firing').waitFor();
  const ride=await measure(page,game);console.log(`[${PHASE}] ${width}x${height} ride`,JSON.stringify({hold:ride.inner.holdText,overflow:ride.inner.holdOverflow,small:ride.inner.small}));
  assert.ok(ride.inner.holdOverflow<=0,`ride hint fits its button: ${ride.inner.holdText}`);assert.deepEqual(ride.inner.small,[],'no visible text under 12px while riding');
  assert.ok(ride.host.pageScrollY<=1&&ride.inner.rootScroll<=1,'still no scroll after touch play');
  if(width===390)await page.screenshot({path:`./artifacts/mobile-${PHASE}-ride-390.png`});
  // Long-press on the stage must not open a context menu.
  const frame=page.frames().find(f=>f!==page.mainFrame());
  assert.equal(await frame.evaluate(()=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('.stage canvas').dispatchEvent(e);return e.defaultPrevented;}),true,'context menu suppressed on the stage');
  // Leaving the tab pauses; resuming continues the same ride.
  await frame.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();const metres=async()=>Number((await game.getByTestId('distance').innerText()).replace('m',''));
  await page.clock.runFor(300);const dist=await metres();await page.clock.runFor(1000);assert.equal(await metres(),dist,'the ride is frozen while hidden');
  await frame.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await game.getByRole('button',{name:'再開する',exact:true}).tap();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor({state:'hidden'});
  await page.clock.runFor(200);assert.ok(await metres()>=dist,`resume keeps the ride (${dist}m → ${await metres()}m)`);
 }}))}catch(error){failures.push(`${width}x${height}: ${error.message.split('\n')[0]}`);console.error(`FAIL ${width}x${height}`,error.message);}
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Rare Rush mobile PASS ${SIZES.map(s=>s.join('x')).join(' ')}`);
