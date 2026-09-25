// Phone check for Rare Drop: real device emulation (isMobile, touch, DPR 3, mobile UA) at the sizes
// players actually hold. Run from the SDK root: node games/rare-drop/mobile.test.mjs
// MOBILE_SIZE='[[390,664]]' limits sizes; MOBILE_PHASE=before|after names the screenshots (default after);
// MOBILE_MEASURE_ONLY=1 prints the measurements without failing.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';import {readFile} from 'node:fs/promises';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SIZES=process.env.MOBILE_SIZE?JSON.parse(process.env.MOBILE_SIZE):[[360,640],[375,667],[390,664],[430,740],[664,390]];
const PHASE=process.env.MOBILE_PHASE||'after',MEASURE_ONLY=process.env.MOBILE_MEASURE_ONLY==='1';
let device={};
const launch=chromium.launch.bind(chromium);
chromium.launch=async o=>{const browser=await launch({...o,...(process.env.DROP_CHROMIUM?{executablePath:process.env.DROP_CHROMIUM}:{})});const context=browser.newContext.bind(browser);browser.newContext=options=>context({...options,...device});return browser;};
const tag=(w,h)=>w>h?'land':String(w);
const openGame=async page=>{await page.getByRole('button',{name:/^Connect (wallet|Browser wallet)$/}).click();await page.getByRole('button',{name:/^Friend #7730/}).click();};

/** Layout facts in page pixels: scroll in the host page and the game document, play surface, controls, smallest text. */
async function measure(page,game){
 const host=await page.evaluate(()=>{const s=document.scrollingElement,bar=document.querySelector('.rf-frame-toolbar').getBoundingClientRect(),f=document.querySelector('iframe').getBoundingClientRect();
  return {pageScrollY:s.scrollHeight-innerHeight,pageScrollX:s.scrollWidth-innerWidth,toolbar:{y:Math.round(bar.y),h:Math.round(bar.height)},frame:{y:Math.round(f.y),h:Math.round(f.height),w:Math.round(f.width)},
   hostText:Math.min(...[...document.querySelectorAll('.rf-frame-toolbar > *')].map(e=>parseFloat(getComputedStyle(e).fontSize)))};});
 const inner=await game.locator('body').evaluate(()=>{const s=document.scrollingElement,root=document.querySelector('.jar-game');window.scrollTo(0,200);const moved=scrollY;window.scrollTo(0,0);
  let small=[];for(const el of document.querySelectorAll('body *')){if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const r=el.getBoundingClientRect(),cs=getComputedStyle(el);if(!r.width||!r.height||cs.visibility==='hidden'||cs.display==='none')continue;const fs=parseFloat(cs.fontSize);if(fs<12)small.push(`${el.className||el.tagName}:${el.textContent.trim().slice(0,12)}@${fs}`);}
  const c=document.querySelector('.screen canvas'),cr=c.getBoundingClientRect(),k=Math.min(cr.width/400,cr.height/620);
  return {docScroll:s.scrollHeight-innerHeight,docScrollX:s.scrollWidth-innerWidth,rootScroll:root.scrollHeight-root.clientHeight,rootScrollX:root.scrollWidth-root.clientWidth,scrollMoved:moved,small:[...new Set(small)],
   jar:{w:Math.round(400*k),h:Math.round(620*k)},backing:[c.width,c.height],dpr:devicePixelRatio,
   styles:{canvasTouch:getComputedStyle(c).touchAction,overscroll:getComputedStyle(document.documentElement).overscrollBehaviorY,rootOverscroll:getComputedStyle(root).overscrollBehaviorY,select:getComputedStyle(c).userSelect,tap:getComputedStyle(c).webkitTapHighlightColor}};});
 const box=async l=>{const b=await l.boundingBox();return b&&{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
 const controls={left:await box(game.getByRole('button',{name:'左へ',exact:true})),drop:await box(game.getByRole('button',{name:'落とす',exact:true})),right:await box(game.getByRole('button',{name:'右へ',exact:true})),
  pause:await box(game.getByRole('button',{name:'一時停止',exact:true})),sound:await box(game.getByTestId('sound')),next:await box(game.getByTestId('next-tier')),
  wallet:await box(page.getByRole('button',{name:'Open Friend wallet',exact:true})),friend:await box(page.getByRole('button',{name:'Choose Friend',exact:true}))};
 return {host,inner,screen:await box(game.locator('.screen')),controls};
}

// Chromium ignores -webkit-touch-callout (Safari only), so check the stylesheet for the jar and the buttons.
{const css=await readFile(new URL('./style.css',import.meta.url),'utf8');const rule=[...css.matchAll(/([^{}]*)\{[^}]*-webkit-touch-callout:none/g)].map(m=>m[1]).join(',');
 for(const selector of ['.screen canvas','.jar-game button'])assert.ok(rule.includes(selector),`-webkit-touch-callout:none covers ${selector}`);}
const failures=[];
for(const [width,height] of SIZES){
 device={isMobile:true,hasTouch:true,deviceScaleFactor:3,userAgent:width===360?ANDROID:IPHONE};
 try{console.log(await testGame('./games/rare-drop',{width,height,check:async({page,game})=>{
  await page.clock.install();await page.reload();await openGame(page);
  await game.locator('[data-testid=sound]:not([disabled])').waitFor();
  // Title card fits without scrolling inside the jar and its Start button is a thumb-sized target.
  const title=await game.locator('.overlay').evaluate(e=>e.scrollHeight-e.clientHeight);const start=await game.getByRole('button',{name:'はじめる',exact:true}).boundingBox();
  if(!MEASURE_ONLY){assert.ok(title<=1,`title card overflows by ${title}px`);assert.ok(start.height>=48&&start.y+start.height<=height,`Start button ${JSON.stringify(start)}`);}
  if(process.env.MOBILE_TITLE_SHOTS)await page.screenshot({path:`./artifacts/mobile-${PHASE}-title-${tag(width,height)}.png`});
  await game.getByRole('button',{name:'はじめる',exact:true}).tap();await page.clock.runFor(300);
  const frame=page.frames().find(f=>f!==page.mainFrame());
  /** Centre of the held orb along the dropper row, in jar units. */
  const dropperX=()=>frame.evaluate(()=>{const c=document.querySelector('.screen canvas'),s=c.width/400,d=c.getContext('2d').getImageData(0,Math.round(80*s),c.width,1).data;let sum=0,n=0;for(let x=0;x<c.width;x++){const i=x*4;if(d[i]+d[i+1]+d[i+2]>250){sum+=x;n++;}}return n?sum/n/s:null;});
  /** Bright orb pixels in a column band just above the floor (jar units). */
  const settled=(x0,x1)=>frame.evaluate(([x0,x1])=>{const c=document.querySelector('.screen canvas'),s=c.width/400,d=c.getContext('2d').getImageData(Math.round(x0*s),Math.round(590*s),Math.round((x1-x0)*s),1).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>250)n++;return n;},[x0,x1]);
  const cdp=await page.context().newCDPSession(page);const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
  const m=await measure(page,game);
  console.log(`[${PHASE}] ${width}x${height}`,JSON.stringify(m));
  await page.screenshot({path:`./artifacts/mobile-${PHASE}-${tag(width,height)}.png`});
  if(MEASURE_ONLY)return;
  const vw=width,vh=height,{host,inner,controls,screen}=m;
  // No scroll or overflow anywhere during play.
  assert.ok(host.pageScrollY<=1&&host.pageScrollX<=1,`host page scrolls ${JSON.stringify(host)}`);
  assert.ok(inner.docScroll<=1&&inner.docScrollX<=1&&inner.rootScroll<=1&&inner.rootScrollX<=1&&inner.scrollMoved===0,`game document scrolls ${JSON.stringify(inner)}`);
  // Primary controls on screen, thumb-sized, and in the lower part of the screen in portrait.
  for(const [name,b] of Object.entries(controls)){assert.ok(b,`${name} visible`);assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=vw+1&&b.y+b.h<=vh+1,`${name} inside ${vw}x${vh}: ${JSON.stringify(b)}`);if(name!=='next')assert.ok(b.h>=44&&b.w>=44,`${name} ≥44px: ${JSON.stringify(b)}`);}
  assert.ok(controls.drop.h>=48,'DROP is a primary 48px target');
  assert.ok(controls.next.h>=36,`NEXT preview readable ${JSON.stringify(controls.next)}`);
  if(vh>vw){assert.ok(controls.drop.y>vh*.6,`DROP in the thumb zone ${JSON.stringify(controls.drop)}`);assert.ok(screen.h>=vh*.45,`jar area ${screen.h} ≥45% of ${vh}`);assert.ok(inner.jar.h>=vh*.45,`drawn jar ${inner.jar.h} ≥45% of ${vh}`);}
  else assert.ok(inner.jar.h>=vh*.5,`landscape jar ${inner.jar.h} ≥50% of ${vh}`);
  assert.ok(controls.drop.y+controls.drop.h<=controls.wallet.y+1||controls.drop.x+controls.drop.w<=controls.wallet.x+1,'game controls clear of the host toolbar');
  assert.deepEqual(inner.small,[],'no visible text under 12px');assert.ok(host.hostText>=12,`host toolbar text ${host.hostText}px`);
  // Touch behaviour and a crisp canvas on a 3x screen.
  assert.equal(inner.styles.canvasTouch,'none');assert.equal(inner.styles.overscroll,'none');assert.equal(inner.styles.select,'none');assert.equal(inner.styles.tap,'rgba(0, 0, 0, 0)');
  assert.ok(inner.backing[0]>=800,`canvas backing ${inner.backing} scaled for DPR ${inner.dpr}`);
  // Hold ◀ with a finger, then the OS cancels the touch: the dropper must stop.
  const left=await game.getByRole('button',{name:'左へ',exact:true}).boundingBox();const x0=await dropperX();
  await touch('touchStart',left.x+left.width/2,left.y+left.height/2);await page.clock.runFor(250);await touch('touchCancel');
  const x1=await dropperX();await page.clock.runFor(500);const x2=await dropperX();
  assert.ok(x0-x1>30,`holding ◀ moves the dropper ${x0}→${x1}`);assert.ok(Math.abs(x2-x1)<1,`pointercancel releases ◀ (${x1}→${x2})`);
  // Drag across the jar to aim, release to drop.
  const jar=await game.locator('.screen canvas').boundingBox(),k=Math.min(jar.width/400,jar.height/620),ox=jar.x+(jar.width-400*k)/2,at=x=>ox+x*k,y=jar.y+jar.height*.5;
  await page.clock.runFor(700);await touch('touchStart',at(80),y);await touch('touchMove',at(200),y);await touch('touchMove',at(320),y);
  let aimed=await dropperX();for(let i=0;i<30&&Math.abs(aimed-320)>=12;i++){await page.clock.runFor(16);aimed=await dropperX();}assert.ok(Math.abs(aimed-320)<12,`drag aims the dropper at 320, got ${aimed}`);
  const before=await settled(290,350);await touch('touchEnd');await page.clock.runFor(1500);
  assert.ok(await settled(290,350)>before,'release drops the orb where it was aimed');
  // Long-press on the jar must not open a context menu.
  assert.equal(await frame.evaluate(()=>{const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.querySelector('.screen canvas').dispatchEvent(e);return e.defaultPrevented;}),true,'context menu suppressed on the jar');
  // Leaving the tab pauses; resuming continues the same game.
  const score=await game.getByTestId('score').innerText();
  await frame.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor();
  await frame.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await game.getByRole('button',{name:'再開する',exact:true}).tap();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor({state:'hidden'});assert.equal(await game.getByTestId('score').innerText(),score,'resume keeps the game');
  // (pagehide is not simulated: the SDK session treats it as the frame unloading and restarts it.)
  const again=await measure(page,game);assert.ok(again.host.pageScrollY<=1&&again.inner.rootScroll<=1,'still no scroll after touch play');
 }}))}catch(error){failures.push(`${width}x${height}: ${error.message.split('\n')[0]}`);console.error(`FAIL ${width}x${height}`,error.message);}
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`Rare Drop mobile PASS ${SIZES.map(s=>s.join('x')).join(' ')}`);
