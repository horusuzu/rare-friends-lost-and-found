// Phone play for Rare Invaders: emulated touch phones (isMobile, touch, DPR 3, mobile UA) at common sizes.
// Real touch holds go through CDP touch events. MOBILE_SHOT=before|after names the in-play screenshots;
// MOBILE_MEASURE=1 only prints measurements.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {testGame} from '@rarefriends/friendsdk/testing';
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const launch=chromium.launch.bind(chromium);
chromium.launch=async o=>{const b=await launch({...o,...(process.env.INVADERS_CHROMIUM?{executablePath:process.env.INVADERS_CHROMIUM}:{})});const nc=b.newContext.bind(b);
 b.newContext=o=>nc({...o,isMobile:true,hasTouch:true,deviceScaleFactor:3,userAgent:o?.viewport?.width===360?ANDROID:IPHONE});return b;};
const sizes=process.env.MOBILE_SIZE?JSON.parse(process.env.MOBILE_SIZE):[[360,640],[375,667],[390,664],[430,740],[664,390]];
const measureOnly=process.env.MOBILE_MEASURE==='1',shot=process.env.MOBILE_SHOT??'after';
const tag=(w,h)=>w>h?'land':String(w);const check=(ok,msg)=>{if(measureOnly){if(!ok)console.log(`  ✗ ${msg}`);}else assert.ok(ok,msg);};
const box=l=>l.boundingBox();const wait=ms=>new Promise(r=>setTimeout(r,ms));
const overlaps=(a,b)=>a.x<b.x+b.width-1&&b.x<a.x+a.width-1&&a.y<b.y+b.height-1&&b.y<a.y+a.height-1;
const center=b=>({x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)});
const pageMetrics=async(page,game)=>({...await page.evaluate(()=>{const d=document.documentElement,i=document.querySelector('iframe').getBoundingClientRect();
 return {vw:innerWidth,vh:innerHeight,docW:d.scrollWidth,docH:d.scrollHeight,toolbarH:Math.round(document.querySelector('.rf-frame-toolbar').getBoundingClientRect().height),top:Math.round(i.top),bottom:Math.round(i.bottom),iframeH:Math.round(i.height)};}),
 ...await game.locator('.arcade').evaluate(a=>{const d=document.scrollingElement;return {gameDocH:d.scrollHeight,gameClientH:d.clientHeight,panelScroll:a.scrollHeight-a.clientHeight,panelScrollW:a.scrollWidth-a.clientWidth};})});
/** The drawn 480×560 field inside the canvas box (object-fit: contain), plus the backing-store density. */
const field=game=>game.locator('canvas').evaluate(c=>{const r=c.getBoundingClientRect(),k=Math.min(r.width/480,r.height/560);return {w:Math.round(480*k),h:Math.round(560*k),density:+(c.width/(480*k)).toFixed(2),
 rendering:getComputedStyle(c).imageRendering,ta:getComputedStyle(c).touchAction};});
/** Player x from the lime bar under the ship (drawn at y = PLAYER_Y + 23). */
const playerX=game=>game.locator('canvas').evaluate(c=>{const s=c.width/480,y=Math.round((510+24)*s),row=c.getContext('2d').getImageData(0,y,c.width,1).data;let sum=0,n=0;
 for(let x=0;x<c.width;x++){const i=x*4;if(row[i]>190&&row[i+1]>235&&row[i+2]<140){sum+=x;n++;}}return n?Math.round(sum/n/s):null;});
const touchStyle=el=>{const s=getComputedStyle(el);return {ta:s.touchAction,us:s.userSelect||s.webkitUserSelect,tap:s.webkitTapHighlightColor};};

for(const [width,height] of sizes){const t=tag(width,height),report={size:`${width}x${height}`};
 await testGame('./games/rare-invaders',{width,height,check:async({page,game})=>{
  const cdp=await page.context().newCDPSession(page);const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,id)=>({...p,id}))});
  await game.getByRole('button',{name:'出撃する',exact:true}).waitFor();
  for(const name of ['Choose Friend','Open Friend wallet']){const b=await box(page.getByRole('button',{name,exact:true}));check(b.height>=44,`host ${name} ≥44px (${b.height})`);}
  report.hostFont=await page.locator('.rf-frame-toolbar button').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));check(report.hostFont>=12,`host toolbar text ≥12px (${report.hostFont})`);
  await game.getByRole('button',{name:'出撃する',exact:true}).tap();await game.getByRole('button',{name:'一時停止',exact:true}).waitFor();
  const m=await pageMetrics(page,game);report.play=m;
  check(m.docH<=m.vh&&m.docW<=m.vw,`host document does not scroll (${m.docW}×${m.docH})`);check(m.gameDocH<=m.gameClientH,'game document does not scroll');
  check(m.panelScroll<=1&&m.panelScrollW<=1,`arcade panel does not scroll during play (${m.panelScroll}px)`);
  // Play surface and thumb controls.
  const f=await field(game);report.field=f;check(f.density>=2,`canvas is crisp (${f.density}× backing)`);check(f.rendering==='pixelated','pixel art stays pixelated');check(f.ta==='none','canvas takes gestures');
  check(width>height?f.h>=240:f.w>=300,`play field is a sensible size (${f.w}×${f.h})`);
  const [left,right,fire,shield]=await Promise.all(['左へ','右へ','射撃','シールド'].map(n=>box(game.getByRole('button',{name:n,exact:true}))));
  report.controls={left:[Math.round(left.width),Math.round(left.height)],right:[Math.round(right.width),Math.round(right.height)],fire:[Math.round(fire.width),Math.round(fire.height)],shield:[Math.round(shield.width),Math.round(shield.height)],top:Math.round(Math.min(left.y,fire.y)),bottom:Math.round(Math.max(left.y+left.height,fire.y+fire.height))};
  for(const [n,b] of [['left',left],['right',right],['fire',fire],['shield',shield]]){check(b.width>=48&&b.height>=48,`${n} control ≥48px (${Math.round(b.width)}×${Math.round(b.height)})`);check(b.y>=m.top&&b.y+b.height<=m.bottom+1,`${n} control on screen`);}
  if(width<height)check(Math.min(left.y,fire.y,shield.y)>=m.top+m.iframeH*0.6,`controls sit in the lower thumb zone (top ${Math.round(Math.min(left.y,fire.y))} of ${m.bottom})`);
  else check(left.x<width/2&&(right.x>width/2||fire.x>width/2),'landscape: one thumb each side');
  const canvasBox=await box(game.locator('canvas'));for(const b of [left,right,fire,shield])check(!overlaps(b,canvasBox),'controls do not cover the field');
  const cs=await game.getByRole('button',{name:'射撃',exact:true}).evaluate(touchStyle);report.buttonStyle=cs;check(cs.us==='none','buttons are not text-selectable');check(cs.tap==='rgba(0, 0, 0, 0)','no tap highlight');
  const noMenu=await game.locator('.arcade').evaluate(e=>!e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));check(noMenu,'long-press menu suppressed');
  check(await game.locator('.arcade').evaluate(e=>getComputedStyle(e).overscrollBehaviorY)==='none','no overscroll bounce');
  const tx=await game.locator('body').evaluate(()=>{let min=99,where='';for(const el of document.querySelectorAll('body *')){if(!el.getClientRects().length)continue;if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;
   const f=parseFloat(getComputedStyle(el).fontSize);if(f<min){min=f;where=el.className||el.tagName;}}return {min,where:String(where)};});report.minText=tx;check(tx.min>=12,`text ≥12px (${tx.min}px in ${tx.where})`);
  const hdr=await Promise.all([...await game.locator('.top-actions button').all(),game.locator('.brand h1'),game.locator('.hud')].map(box));
  for(let i=0;i<hdr.length;i++)for(let j=i+1;j<hdr.length;j++)check(!overlaps(hdr[i],hdr[j]),`header/HUD items do not overlap (${i}/${j})`);
  for(const b of hdr)check(!overlaps(b,canvasBox)||width<height,'header stays off the field');
  await page.screenshot({path:`./artifacts/mobile-${shot}-${t}-invaders.png`});
  // Hold ▶ with a finger: the ship keeps moving; a cancelled touch stops it.
  const x0=await playerX(game);await touch('touchStart',[center(right)]);await wait(250);const x1=await playerX(game);
  await touch('touchCancel',[]);await wait(80);const x2=await playerX(game);await wait(400);const x3=await playerX(game);
  report.hold={x0,x1,x2,x3};check(x0!==null&&x1>x0+20,`holding ▶ moves the ship (${x0}→${x1})`);check(x3===x2,`touchcancel releases the hold (${x2}→${x3})`);
  // Two thumbs: hold ◀ and FIRE together — the ship moves left and scores.
  const s0=Number(await game.getByTestId('score').innerText());await touch('touchStart',[center(left),center(fire)]);
  for(let i=0;i<40&&Number(await game.getByTestId('score').innerText())===s0;i++)await wait(250);const x4=await playerX(game);await touch('touchEnd',[]);
  report.twoThumbs={score:Number(await game.getByTestId('score').innerText()),x:x4};check(report.twoThumbs.score>s0,'two-thumb fire scores');check(x4<x3,`two-thumb ◀ moves left (${x3}→${x4})`);
  // Switching apps (the page becomes hidden) pauses; Resume carries on. (A real pagehide also ends the SDK session.)
  await game.locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  const paused=await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor({timeout:2000}).then(()=>true,()=>false);check(paused,'hiding the page pauses play');
  if(paused){await game.getByRole('button',{name:'再開する',exact:true}).tap();await game.getByRole('heading',{name:'PAUSED',exact:true}).waitFor({state:'hidden'});}
  const m2=await pageMetrics(page,game);check(m2.docH<=m2.vh&&m2.panelScroll<=1,'still no scroll after play');
 }});
 console.log(JSON.stringify(report));console.log(`Rare Invaders mobile ${width}x${height} ${measureOnly?'measured':'PASS'}`);}
